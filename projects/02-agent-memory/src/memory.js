/**
 * Three-layer memory system backed by SQLite.
 *
 * Layers:
 *   1. Episodic  — raw interaction logs with timestamps
 *   2. Semantic  — distilled facts about people, companies, relationships
 *   3. Procedural — learned behavioral patterns (e.g., "how to prep for a call")
 *
 * Each layer lives in its own table. Episodic rows carry a `consolidated`
 * flag so the consolidation gate knows what has already been processed.
 *
 * Forgetting-as-Hygiene (Carbon Layer):
 *   - Temporal decay: confidence erodes exponentially based on age
 *   - Contradiction detection: new facts that conflict with existing ones
 *     halve the older fact's confidence instead of silently overwriting
 *   - Memory compression: merge related facts by subject
 *   - Manual curation: forgetFact, reinforceFact, getMemoryHealth
 */

import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_DB_PATH = path.join(__dirname, "..", "crm_memory.db");

export class MemoryStore {
  constructor(dbPath = DEFAULT_DB_PATH) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this._initSchema();
  }

  // ─── Schema ──────────────────────────────────────────────────────────

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS episodic (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp   TEXT    NOT NULL DEFAULT (datetime('now')),
        raw_input   TEXT    NOT NULL,
        raw_output  TEXT    NOT NULL DEFAULT '',
        context     TEXT    NOT NULL DEFAULT '{}',
        consolidated INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS semantic (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        subject     TEXT    NOT NULL,
        predicate   TEXT    NOT NULL,
        object      TEXT    NOT NULL,
        confidence  REAL    NOT NULL DEFAULT 1.0,
        source_episode_ids TEXT NOT NULL DEFAULT '[]',
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        stale       INTEGER NOT NULL DEFAULT 0,
        archived    INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS procedural (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        trigger_pattern TEXT NOT NULL,
        action_template TEXT NOT NULL,
        examples    TEXT    NOT NULL DEFAULT '[]',
        use_count   INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      -- FTS index for full-text keyword search across episodic memory
      CREATE VIRTUAL TABLE IF NOT EXISTS episodic_fts USING fts5(
        raw_input,
        raw_output,
        content=episodic,
        content_rowid=id
      );

      -- FTS index for semantic facts
      CREATE VIRTUAL TABLE IF NOT EXISTS semantic_fts USING fts5(
        subject,
        predicate,
        object,
        content=semantic,
        content_rowid=id
      );

      -- Trigger: keep FTS in sync on insert
      CREATE TRIGGER IF NOT EXISTS episodic_ai AFTER INSERT ON episodic BEGIN
        INSERT INTO episodic_fts(rowid, raw_input, raw_output)
        VALUES (new.id, new.raw_input, new.raw_output);
      END;

      CREATE TRIGGER IF NOT EXISTS semantic_ai AFTER INSERT ON semantic BEGIN
        INSERT INTO semantic_fts(rowid, subject, predicate, object)
        VALUES (new.id, new.subject, new.predicate, new.object);
      END;

      CREATE TRIGGER IF NOT EXISTS semantic_au AFTER UPDATE ON semantic BEGIN
        INSERT INTO semantic_fts(semantic_fts, rowid, subject, predicate, object)
        VALUES ('delete', old.id, old.subject, old.predicate, old.object);
        INSERT INTO semantic_fts(rowid, subject, predicate, object)
        VALUES (new.id, new.subject, new.predicate, new.object);
      END;
    `);

    // Migration: add archived column if missing (handles pre-existing DBs)
    try {
      this.db.prepare(`SELECT archived FROM semantic LIMIT 1`).get();
    } catch {
      this.db.exec(`ALTER TABLE semantic ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`);
    }
  }

  // ─── Episodic ────────────────────────────────────────────────────────

  addEpisode(rawInput, rawOutput = "", context = {}) {
    const stmt = this.db.prepare(
      `INSERT INTO episodic (raw_input, raw_output, context) VALUES (?, ?, ?)`
    );
    const info = stmt.run(rawInput, rawOutput, JSON.stringify(context));
    return info.lastInsertRowid;
  }

  getUnconsolidatedEpisodes(limit = 10) {
    return this.db
      .prepare(
        `SELECT * FROM episodic WHERE consolidated = 0 ORDER BY id ASC LIMIT ?`
      )
      .all(limit);
  }

  markConsolidated(ids) {
    const placeholders = ids.map(() => "?").join(",");
    this.db
      .prepare(
        `UPDATE episodic SET consolidated = 1 WHERE id IN (${placeholders})`
      )
      .run(...ids);
  }

  getRecentEpisodes(limit = 20) {
    return this.db
      .prepare(`SELECT * FROM episodic ORDER BY id DESC LIMIT ?`)
      .all(limit);
  }

  countUnconsolidated() {
    return this.db
      .prepare(`SELECT COUNT(*) as cnt FROM episodic WHERE consolidated = 0`)
      .get().cnt;
  }

  // ─── Semantic ────────────────────────────────────────────────────────

  addFact(subject, predicate, object, sourceEpisodeIds = [], confidence = 1.0) {
    // Check for existing fact with same subject+predicate (non-archived only)
    const existing = this.db
      .prepare(
        `SELECT * FROM semantic
         WHERE LOWER(subject) = LOWER(?) AND LOWER(predicate) = LOWER(?)
         AND archived = 0`
      )
      .get(subject, predicate);

    if (existing) {
      // Run contradiction detection before overwriting
      const contradiction = detectContradiction(
        { subject, predicate, object, confidence },
        existing
      );

      const mergedSources = [
        ...new Set([
          ...JSON.parse(existing.source_episode_ids),
          ...sourceEpisodeIds,
        ]),
      ];

      if (contradiction.hasContradiction) {
        // Halve old fact's confidence (don't delete — keep lineage)
        this.db
          .prepare(
            `UPDATE semantic
             SET confidence = confidence * 0.5, updated_at = datetime('now')
             WHERE id = ?`
          )
          .run(existing.id);

        // Insert the new fact as a separate row so both coexist briefly
        // The old one decays naturally; the new one starts fresh
        const stmt = this.db.prepare(
          `INSERT INTO semantic (subject, predicate, object, confidence, source_episode_ids)
           VALUES (?, ?, ?, ?, ?)`
        );
        const info = stmt.run(
          subject,
          predicate,
          object,
          confidence,
          JSON.stringify(sourceEpisodeIds)
        );
        return {
          id: info.lastInsertRowid,
          action: "contradiction_resolved",
          previous: existing.object,
          previousId: existing.id,
          resolution: contradiction.resolution,
        };
      }

      // No contradiction — simple update (same object or compatible values)
      this.db
        .prepare(
          `UPDATE semantic
           SET object = ?, confidence = ?, source_episode_ids = ?,
               updated_at = datetime('now'), stale = 0
           WHERE id = ?`
        )
        .run(object, confidence, JSON.stringify(mergedSources), existing.id);
      return { id: existing.id, action: "updated", previous: existing.object };
    }

    const stmt = this.db.prepare(
      `INSERT INTO semantic (subject, predicate, object, confidence, source_episode_ids)
       VALUES (?, ?, ?, ?, ?)`
    );
    const info = stmt.run(
      subject,
      predicate,
      object,
      confidence,
      JSON.stringify(sourceEpisodeIds)
    );
    return { id: info.lastInsertRowid, action: "created" };
  }

  getFactsAbout(subject) {
    return this.db
      .prepare(
        `SELECT * FROM semantic WHERE LOWER(subject) = LOWER(?) AND archived = 0`
      )
      .all(subject);
  }

  getAllFacts() {
    return this.db
      .prepare(`SELECT * FROM semantic WHERE archived = 0 ORDER BY updated_at DESC`)
      .all();
  }

  markStaleFacts(monthsThreshold = 6) {
    this.db
      .prepare(
        `UPDATE semantic SET stale = 1
         WHERE updated_at < datetime('now', ? || ' months')
         AND stale = 0 AND archived = 0`
      )
      .run(`-${monthsThreshold}`);
  }

  // ─── Temporal Decay ─────────────────────────────────────────────────
  //
  // Applies exponential decay to confidence scores based on age.
  // Facts that decay below archiveThreshold get soft-archived.

  decayMemories(options = {}) {
    const semanticHalfLife = options.semanticHalfLife || 180;  // days
    const archiveThreshold = options.archiveThreshold || 0.1;
    const now = options.now || new Date().toISOString();

    // Fetch all active (non-archived) semantic facts
    const facts = this.db
      .prepare(`SELECT id, confidence, updated_at FROM semantic WHERE archived = 0`)
      .all();

    let decayed = 0;
    let archived = 0;
    let untouched = 0;

    const updateStmt = this.db.prepare(
      `UPDATE semantic SET confidence = ? WHERE id = ?`
    );
    const archiveStmt = this.db.prepare(
      `UPDATE semantic SET archived = 1, stale = 1 WHERE id = ?`
    );

    const txn = this.db.transaction(() => {
      for (const fact of facts) {
        const ageMs = new Date(now).getTime() - new Date(fact.updated_at).getTime();
        const ageDays = ageMs / 86400000;

        if (ageDays <= 0) {
          untouched++;
          continue;
        }

        // Exponential decay: newConf = original * 2^(-age/halfLife)
        const decayFactor = Math.pow(2, -ageDays / semanticHalfLife);
        const newConfidence = fact.confidence * decayFactor;

        if (newConfidence < archiveThreshold) {
          archiveStmt.run(fact.id);
          archived++;
        } else if (Math.abs(newConfidence - fact.confidence) > 0.001) {
          updateStmt.run(newConfidence, fact.id);
          decayed++;
        } else {
          untouched++;
        }
      }
    });

    txn();

    return { decayed, archived, untouched };
  }

  // ─── Manual Curation ────────────────────────────────────────────────

  /**
   * Soft-delete a specific fact by setting archived = 1.
   */
  forgetFact(id) {
    const fact = this.db
      .prepare(`SELECT * FROM semantic WHERE id = ? AND archived = 0`)
      .get(id);

    if (!fact) return { success: false, reason: "fact_not_found_or_already_archived" };

    this.db
      .prepare(`UPDATE semantic SET archived = 1, stale = 1 WHERE id = ?`)
      .run(id);

    return {
      success: true,
      forgotten: { subject: fact.subject, predicate: fact.predicate, object: fact.object },
    };
  }

  /**
   * Boost a fact's confidence to 1.0 and reset its decay clock (updated_at = now).
   */
  reinforceFact(id) {
    const fact = this.db
      .prepare(`SELECT * FROM semantic WHERE id = ? AND archived = 0`)
      .get(id);

    if (!fact) return { success: false, reason: "fact_not_found_or_archived" };

    this.db
      .prepare(
        `UPDATE semantic SET confidence = 1.0, stale = 0, updated_at = datetime('now') WHERE id = ?`
      )
      .run(id);

    return {
      success: true,
      reinforced: { subject: fact.subject, predicate: fact.predicate, object: fact.object },
    };
  }

  /**
   * Returns a health report: total facts, stale count, archived count,
   * contradiction count (same subject+predicate with multiple active rows),
   * compression opportunities, and a confidence distribution histogram.
   */
  getMemoryHealth() {
    const total = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM semantic WHERE archived = 0`)
      .get().cnt;
    const stale = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM semantic WHERE stale = 1 AND archived = 0`)
      .get().cnt;
    const archivedCount = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM semantic WHERE archived = 1`)
      .get().cnt;

    // Contradiction count: same subject+predicate with multiple active rows
    const contradictions = this.db
      .prepare(
        `SELECT COUNT(*) as cnt FROM (
           SELECT subject, predicate FROM semantic
           WHERE archived = 0
           GROUP BY LOWER(subject), LOWER(predicate)
           HAVING COUNT(*) > 1
         )`
      )
      .get().cnt;

    // Compression opportunities: subjects with 5+ facts (likely mergeable)
    const compressionOpportunities = this.db
      .prepare(
        `SELECT COUNT(*) as cnt FROM (
           SELECT subject FROM semantic
           WHERE archived = 0
           GROUP BY LOWER(subject)
           HAVING COUNT(*) >= 5
         )`
      )
      .get().cnt;

    // Confidence distribution histogram
    const buckets = { "0.00-0.25": 0, "0.25-0.50": 0, "0.50-0.75": 0, "0.75-1.00": 0 };
    const activeFacts = this.db
      .prepare(`SELECT confidence FROM semantic WHERE archived = 0`)
      .all();

    for (const f of activeFacts) {
      if (f.confidence < 0.25) buckets["0.00-0.25"]++;
      else if (f.confidence < 0.50) buckets["0.25-0.50"]++;
      else if (f.confidence < 0.75) buckets["0.50-0.75"]++;
      else buckets["0.75-1.00"]++;
    }

    return {
      total,
      stale,
      archived: archivedCount,
      contradictions,
      compressionOpportunities,
      confidenceDistribution: buckets,
    };
  }

  // ─── Memory Compression ─────────────────────────────────────────────
  //
  // Groups related facts by subject and merges when one fact's object
  // is a substring/superset of another with the same predicate.

  compressMemories(options = {}) {
    const dryRun = options.dryRun || false;
    const subjects = this.db
      .prepare(
        `SELECT DISTINCT LOWER(subject) as subj FROM semantic WHERE archived = 0`
      )
      .all()
      .map((r) => r.subj);

    let merged = 0;
    let removed = 0;
    const compressed = [];

    const txn = this.db.transaction(() => {
      for (const subj of subjects) {
        const facts = this.db
          .prepare(
            `SELECT * FROM semantic
             WHERE LOWER(subject) = ? AND archived = 0
             ORDER BY confidence DESC, updated_at DESC`
          )
          .all(subj);

        // Group by predicate
        const byPredicate = new Map();
        for (const f of facts) {
          const key = f.predicate.toLowerCase();
          if (!byPredicate.has(key)) byPredicate.set(key, []);
          byPredicate.get(key).push(f);
        }

        for (const [pred, group] of byPredicate) {
          if (group.length < 2) continue;

          // Check each pair: if one object contains the other, keep the longer/higher-confidence one
          const toArchive = new Set();
          for (let i = 0; i < group.length; i++) {
            if (toArchive.has(group[i].id)) continue;
            for (let j = i + 1; j < group.length; j++) {
              if (toArchive.has(group[j].id)) continue;

              const a = group[i].object.toLowerCase();
              const b = group[j].object.toLowerCase();

              // Merge if one is a substring of the other, or if they share 80%+ words
              if (a.includes(b) || b.includes(a) || wordOverlap(a, b) >= 0.8) {
                // Keep the one with higher confidence, or the longer one if equal
                const keep = group[i].confidence >= group[j].confidence ? group[i] : group[j];
                const drop = keep === group[i] ? group[j] : group[i];

                if (!dryRun) {
                  // Merge source episode IDs
                  const keepSources = JSON.parse(keep.source_episode_ids);
                  const dropSources = JSON.parse(drop.source_episode_ids);
                  const mergedSources = [...new Set([...keepSources, ...dropSources])];
                  this.db
                    .prepare(
                      `UPDATE semantic SET source_episode_ids = ?, updated_at = datetime('now') WHERE id = ?`
                    )
                    .run(JSON.stringify(mergedSources), keep.id);

                  this.db
                    .prepare(`UPDATE semantic SET archived = 1 WHERE id = ?`)
                    .run(drop.id);
                }

                toArchive.add(drop.id);
                compressed.push({
                  kept: { id: keep.id, value: keep.object },
                  dropped: { id: drop.id, value: drop.object },
                  subject: keep.subject,
                  predicate: keep.predicate,
                });
                merged++;
                removed++;
              }
            }
          }
        }
      }
    });

    txn();

    return { merged, removed, compressed };
  }

  // ─── Procedural ─────────────────────────────────────────────────────

  addProcedure(triggerPattern, actionTemplate, examples = []) {
    const existing = this.db
      .prepare(
        `SELECT * FROM procedural WHERE LOWER(trigger_pattern) = LOWER(?)`
      )
      .get(triggerPattern);

    if (existing) {
      const mergedExamples = [
        ...new Set([...JSON.parse(existing.examples), ...examples]),
      ];
      this.db
        .prepare(
          `UPDATE procedural
           SET action_template = ?, examples = ?, updated_at = datetime('now')
           WHERE id = ?`
        )
        .run(actionTemplate, JSON.stringify(mergedExamples), existing.id);
      return { id: existing.id, action: "updated" };
    }

    const stmt = this.db.prepare(
      `INSERT INTO procedural (trigger_pattern, action_template, examples)
       VALUES (?, ?, ?)`
    );
    const info = stmt.run(
      triggerPattern,
      actionTemplate,
      JSON.stringify(examples)
    );
    return { id: info.lastInsertRowid, action: "created" };
  }

  incrementProcedureUse(id) {
    this.db
      .prepare(
        `UPDATE procedural SET use_count = use_count + 1, updated_at = datetime('now') WHERE id = ?`
      )
      .run(id);
  }

  getProcedures() {
    return this.db
      .prepare(`SELECT * FROM procedural ORDER BY use_count DESC`)
      .all();
  }

  // ─── Search ──────────────────────────────────────────────────────────

  searchEpisodic(query) {
    return this.db
      .prepare(
        `SELECT e.*, rank
         FROM episodic_fts fts
         JOIN episodic e ON e.id = fts.rowid
         WHERE episodic_fts MATCH ?
         ORDER BY rank
         LIMIT 20`
      )
      .all(query);
  }

  searchSemantic(query) {
    return this.db
      .prepare(
        `SELECT s.*, rank
         FROM semantic_fts fts
         JOIN semantic s ON s.id = fts.rowid
         WHERE s.archived = 0 AND semantic_fts MATCH ?
         ORDER BY rank
         LIMIT 20`
      )
      .all(query);
  }

  // ─── Stats ───────────────────────────────────────────────────────────

  getStats() {
    const episodes = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM episodic`)
      .get().cnt;
    const unconsolidated = this.countUnconsolidated();
    const facts = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM semantic WHERE archived = 0`)
      .get().cnt;
    const staleFacts = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM semantic WHERE stale = 1 AND archived = 0`)
      .get().cnt;
    const archivedFacts = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM semantic WHERE archived = 1`)
      .get().cnt;
    const procedures = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM procedural`)
      .get().cnt;
    return { episodes, unconsolidated, facts, staleFacts, archivedFacts, procedures };
  }

  close() {
    this.db.close();
  }
}

// ─── Contradiction Detection ────────────────────────────────────────────
//
// Checks whether a new fact conflicts with an existing one.
// Same subject+predicate, different object = contradiction.

/**
 * Detect whether a new fact contradicts an existing fact.
 *
 * @param {{ subject: string, predicate: string, object: string, confidence: number }} newFact
 * @param {{ subject: string, predicate: string, object: string, confidence: number }} existingFact
 * @returns {{ hasContradiction: boolean, resolution: string }}
 */
export function detectContradiction(newFact, existingFact) {
  const newObj = newFact.object.toLowerCase().trim();
  const oldObj = existingFact.object.toLowerCase().trim();

  // Same value (case-insensitive) or one contains the other — no contradiction
  if (newObj === oldObj || newObj.includes(oldObj) || oldObj.includes(newObj)) {
    return { hasContradiction: false, resolution: "compatible" };
  }

  // Different object values for the same subject+predicate = contradiction
  // Resolution strategy:
  //   - If the new fact has higher confidence, keep newer (default)
  //   - If old has strictly higher confidence, flag for review
  const newConf = newFact.confidence || 1.0;
  const oldConf = existingFact.confidence || 1.0;

  let resolution;
  if (newConf >= oldConf) {
    resolution = "keep_newer";
  } else {
    resolution = "flag_for_review";
  }

  return {
    hasContradiction: true,
    conflicting: [
      { id: existingFact.id, value: existingFact.object, confidence: oldConf },
    ],
    resolution,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Compute word overlap ratio between two strings.
 * Returns 0..1 where 1 means all words in the shorter string appear in the longer one.
 */
function wordOverlap(a, b) {
  const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > 2));
  const wordsB = new Set(b.split(/\s+/).filter((w) => w.length > 2));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  const smaller = wordsA.size <= wordsB.size ? wordsA : wordsB;
  const larger = wordsA.size <= wordsB.size ? wordsB : wordsA;

  let overlap = 0;
  for (const w of smaller) {
    if (larger.has(w)) overlap++;
  }

  return overlap / smaller.size;
}
