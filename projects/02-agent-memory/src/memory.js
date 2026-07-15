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
        stale       INTEGER NOT NULL DEFAULT 0
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
    // Check for existing fact with same subject+predicate — update if found (conflict resolution)
    const existing = this.db
      .prepare(
        `SELECT * FROM semantic WHERE LOWER(subject) = LOWER(?) AND LOWER(predicate) = LOWER(?)`
      )
      .get(subject, predicate);

    if (existing) {
      // Fact update — supersede the old value
      const mergedSources = [
        ...new Set([
          ...JSON.parse(existing.source_episode_ids),
          ...sourceEpisodeIds,
        ]),
      ];
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
      .prepare(`SELECT * FROM semantic WHERE LOWER(subject) = LOWER(?)`)
      .all(subject);
  }

  getAllFacts() {
    return this.db
      .prepare(`SELECT * FROM semantic ORDER BY updated_at DESC`)
      .all();
  }

  markStaleFacts(monthsThreshold = 6) {
    this.db
      .prepare(
        `UPDATE semantic SET stale = 1
         WHERE updated_at < datetime('now', ? || ' months')
         AND stale = 0`
      )
      .run(`-${monthsThreshold}`);
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
         WHERE semantic_fts MATCH ?
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
      .prepare(`SELECT COUNT(*) as cnt FROM semantic`)
      .get().cnt;
    const staleFacts = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM semantic WHERE stale = 1`)
      .get().cnt;
    const procedures = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM procedural`)
      .get().cnt;
    return { episodes, unconsolidated, facts, staleFacts, procedures };
  }

  close() {
    this.db.close();
  }
}
