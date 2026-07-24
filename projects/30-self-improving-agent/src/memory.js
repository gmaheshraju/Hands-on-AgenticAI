import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class Memory {
  constructor(dbPath = './data/agent.db') {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this._initSchema();
  }

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS episodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        timestamp TEXT DEFAULT (datetime('now')),
        question TEXT NOT NULL,
        answer TEXT,
        composite_score REAL,
        prompt_version INTEGER,
        stop_reason TEXT,
        total_iterations INTEGER
      );

      CREATE TABLE IF NOT EXISTS facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject TEXT NOT NULL,
        predicate TEXT NOT NULL,
        object TEXT NOT NULL,
        confidence REAL DEFAULT 1.0,
        source_run_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(
        subject, predicate, object,
        content=facts, content_rowid=id
      );

      CREATE TRIGGER IF NOT EXISTS facts_ai AFTER INSERT ON facts BEGIN
        INSERT INTO facts_fts(rowid, subject, predicate, object)
        VALUES (new.id, new.subject, new.predicate, new.object);
      END;

      CREATE TRIGGER IF NOT EXISTS facts_ad AFTER DELETE ON facts BEGIN
        INSERT INTO facts_fts(facts_fts, rowid, subject, predicate, object)
        VALUES ('delete', old.id, old.subject, old.predicate, old.object);
      END;

      CREATE TRIGGER IF NOT EXISTS facts_au AFTER UPDATE ON facts BEGIN
        INSERT INTO facts_fts(facts_fts, rowid, subject, predicate, object)
        VALUES ('delete', old.id, old.subject, old.predicate, old.object);
        INSERT INTO facts_fts(rowid, subject, predicate, object)
        VALUES (new.id, new.subject, new.predicate, new.object);
      END;
    `);
  }

  addEpisode(runId, question, answer, score, promptVersion, stopReason, totalIterations) {
    const stmt = this.db.prepare(`
      INSERT INTO episodes (run_id, question, answer, composite_score, prompt_version, stop_reason, total_iterations)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(runId, question, answer, score, promptVersion, stopReason, totalIterations);
  }

  getEpisodes(limit = 20) {
    return this.db.prepare('SELECT * FROM episodes ORDER BY id DESC LIMIT ?').all(limit);
  }

  addFact(subject, predicate, object, confidence = 1.0, sourceRunId = null) {
    const existing = this.db.prepare(
      'SELECT * FROM facts WHERE LOWER(subject) = LOWER(?) AND LOWER(predicate) = LOWER(?)'
    ).all(subject, predicate);

    for (const fact of existing) {
      if (fact.object.toLowerCase() === object.toLowerCase()) {
        this.db.prepare('UPDATE facts SET confidence = MIN(1.0, confidence + 0.1), updated_at = datetime(\'now\') WHERE id = ?').run(fact.id);
        return { id: fact.id, action: 'reinforced' };
      }
      if (fact.object.toLowerCase() !== object.toLowerCase()) {
        this.db.prepare('UPDATE facts SET confidence = confidence * 0.5, updated_at = datetime(\'now\') WHERE id = ?').run(fact.id);
      }
    }

    const result = this.db.prepare(
      'INSERT INTO facts (subject, predicate, object, confidence, source_run_id) VALUES (?, ?, ?, ?, ?)'
    ).run(subject, predicate, object, confidence, sourceRunId);
    return { id: result.lastInsertRowid, action: 'created' };
  }

  searchFacts(query) {
    if (!query.trim()) return [];
    const terms = query.split(/\s+/).map(t => `"${t}"`).join(' OR ');
    try {
      return this.db.prepare(`
        SELECT f.*, rank FROM facts f
        JOIN facts_fts ON facts_fts.rowid = f.id
        WHERE facts_fts MATCH ? AND f.confidence > 0.1
        ORDER BY rank LIMIT 10
      `).all(terms);
    } catch {
      return [];
    }
  }

  getFactsAbout(subject) {
    return this.db.prepare(
      'SELECT * FROM facts WHERE LOWER(subject) = LOWER(?) AND confidence > 0.1 ORDER BY confidence DESC'
    ).all(subject);
  }

  decayMemories(halfLifeDays = 180) {
    const facts = this.db.prepare('SELECT id, confidence, created_at FROM facts WHERE confidence > 0.1').all();
    let decayed = 0, archived = 0;
    const now = Date.now();

    const update = this.db.prepare('UPDATE facts SET confidence = ?, updated_at = datetime(\'now\') WHERE id = ?');
    const txn = this.db.transaction(() => {
      for (const fact of facts) {
        const ageMs = now - new Date(fact.created_at).getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        const newConf = fact.confidence * Math.pow(2, -ageDays / halfLifeDays);
        if (newConf < 0.1) {
          update.run(0.0, fact.id);
          archived++;
        } else if (Math.abs(newConf - fact.confidence) > 0.001) {
          update.run(newConf, fact.id);
          decayed++;
        }
      }
    });
    txn();
    return { decayed, archived, total: facts.length };
  }

  getHealth() {
    const total = this.db.prepare('SELECT COUNT(*) as c FROM facts').get().c;
    const active = this.db.prepare('SELECT COUNT(*) as c FROM facts WHERE confidence > 0.1').get().c;
    const episodes = this.db.prepare('SELECT COUNT(*) as c FROM episodes').get().c;
    const buckets = [0, 0, 0, 0];
    const all = this.db.prepare('SELECT confidence FROM facts WHERE confidence > 0.1').all();
    for (const { confidence } of all) {
      if (confidence < 0.25) buckets[0]++;
      else if (confidence < 0.5) buckets[1]++;
      else if (confidence < 0.75) buckets[2]++;
      else buckets[3]++;
    }
    return { total, active, archived: total - active, episodes, distribution: buckets };
  }

  close() {
    this.db.close();
  }
}
