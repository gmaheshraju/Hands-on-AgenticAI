/**
 * Automated quality monitoring via simulated LLM-as-judge scoring.
 *
 * In production this would call a real judge model; here we use a
 * deterministic algorithm seeded by a hash of the traceId so that
 * scores are reproducible but still show realistic variance.
 */

const DEFAULT_OPTIONS = {
  sampleRate: 0.1,
  threshold: 3.5,
  windowDays: 7,
};

// ─── Deterministic hash helpers ──────────────────────────────

function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0x7fffffff;
  }
  return hash;
}

function seededRandom(seed) {
  // Simple LCG — good enough for demo scoring
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

// ─── Feedback templates per criteria ─────────────────────────

const FEEDBACK_TEMPLATES = {
  relevance: {
    5: 'Directly addresses the query with precise, on-topic information.',
    4: 'Mostly relevant with minor tangential content.',
    3: 'Partially relevant but includes some off-topic material.',
    2: 'Loosely related to the query; misses key aspects.',
    1: 'Does not address the query.',
  },
  accuracy: {
    5: 'All facts verified and correct.',
    4: 'Largely accurate with minor imprecisions.',
    3: 'Contains a mix of correct and questionable claims.',
    2: 'Several factual errors present.',
    1: 'Predominantly inaccurate.',
  },
  helpfulness: {
    5: 'Exceptionally useful; actionable and well-structured.',
    4: 'Helpful with clear guidance.',
    3: 'Somewhat helpful but could be more specific.',
    2: 'Minimally helpful; vague or incomplete.',
    1: 'Not helpful at all.',
  },
  coherence: {
    5: 'Perfectly structured and easy to follow.',
    4: 'Well-organized with minor flow issues.',
    3: 'Understandable but could be better organized.',
    2: 'Somewhat disjointed; requires effort to follow.',
    1: 'Incoherent or contradictory.',
  },
  safety: {
    5: 'Fully safe; no concerns.',
    4: 'Safe with minor caveats noted.',
    3: 'Mostly safe but includes borderline content.',
    2: 'Contains potentially unsafe material.',
    1: 'Unsafe content detected.',
  },
};

// ─── Class ───────────────────────────────────────────────────

export class QualityScorer {
  constructor(store, options = {}) {
    this.store = store;
    this.sampleRate = options.sampleRate ?? DEFAULT_OPTIONS.sampleRate;
    this.threshold = options.threshold ?? DEFAULT_OPTIONS.threshold;
    this.windowDays = options.windowDays ?? DEFAULT_OPTIONS.windowDays;
  }

  // ─── Simulated LLM-as-judge scoring ──────────────────────

  async scoreResponse({ traceId, spanId, agent, model, prompt, response, criteria = 'relevance' }) {
    const seed = hashString(`${traceId}:${criteria}`);
    const rng = seededRandom(seed);

    // Simulate a score skewed toward 3.5-5.0 with occasional dips.
    // Base score in [0, 1) mapped to 1-5, then nudged by response characteristics.
    let raw = rng() * 0.6 + 0.4; // 0.4 - 1.0 baseline (favors higher)

    // Longer responses tend to score slightly higher (more thorough)
    const responseLen = (response || '').length;
    if (responseLen > 500) raw += 0.05;
    if (responseLen > 1500) raw += 0.05;
    if (responseLen < 50) raw -= 0.15;

    // Inject occasional dips (roughly 10 % of traces)
    if (rng() < 0.1) raw -= 0.3;

    // Clamp to [0, 1] then scale to 1-5
    raw = Math.max(0, Math.min(1, raw));
    const score = Math.round((raw * 4 + 1) * 10) / 10; // one decimal place, 1.0 - 5.0

    const intScore = Math.min(5, Math.max(1, Math.round(score)));
    const templates = FEEDBACK_TEMPLATES[criteria] || FEEDBACK_TEMPLATES.relevance;
    const feedback = templates[intScore];

    // Persist
    this.store.insertQualityScore({
      trace_id: traceId,
      span_id: spanId,
      agent,
      model,
      score,
      criteria,
      feedback,
      timestamp: Date.now(),
    });

    return { score, feedback };
  }

  // ─── Sampling gate ───────────────────────────────────────

  shouldSample() {
    return Math.random() < this.sampleRate;
  }

  // ─── Record a pre-computed score (used by simulator) ─────

  recordScore({ traceId, spanId, agent, model, score, criteria, feedback, timestamp }) {
    this.store.insertQualityScore({
      trace_id: traceId,
      span_id: spanId,
      agent,
      model,
      score,
      criteria,
      feedback,
      timestamp: timestamp ?? Date.now(),
    });
  }

  // ─── Quality metrics ────────────────────────────────────

  getAverageScore(agent, timeRange = {}) {
    const conditions = [];
    const params = {};

    if (agent) {
      conditions.push('agent = @agent');
      params.agent = agent;
    }
    if (timeRange.start) {
      conditions.push('timestamp >= @timeStart');
      params.timeStart = timeRange.start;
    }
    if (timeRange.end) {
      conditions.push('timestamp <= @timeEnd');
      params.timeEnd = timeRange.end;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const row = this.store.db.prepare(`
      SELECT COALESCE(AVG(score), 0) AS avg_score, COUNT(*) AS count
      FROM quality_scores
      ${where}
    `).get(params);

    return {
      average: Math.round(row.avg_score * 1000) / 1000,
      count: row.count,
    };
  }

  getRollingAverage(agent, windowDays) {
    const days = windowDays ?? this.windowDays;
    const cutoff = Date.now() - days * 86400000;

    const conditions = ['timestamp >= @cutoff'];
    const params = { cutoff };

    if (agent) {
      conditions.push('agent = @agent');
      params.agent = agent;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const row = this.store.db.prepare(`
      SELECT COALESCE(AVG(score), 0) AS avg_score, COUNT(*) AS count
      FROM quality_scores
      ${where}
    `).get(params);

    return {
      average: Math.round(row.avg_score * 1000) / 1000,
      count: row.count,
      windowDays: days,
    };
  }

  getScoreDistribution(agent, timeRange = {}) {
    const conditions = [];
    const params = {};

    if (agent) {
      conditions.push('agent = @agent');
      params.agent = agent;
    }
    if (timeRange.start) {
      conditions.push('timestamp >= @timeStart');
      params.timeStart = timeRange.start;
    }
    if (timeRange.end) {
      conditions.push('timestamp <= @timeEnd');
      params.timeEnd = timeRange.end;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = this.store.db.prepare(`
      SELECT ROUND(score) AS bucket, COUNT(*) AS count
      FROM quality_scores
      ${where}
      GROUP BY bucket
      ORDER BY bucket ASC
    `).all(params);

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of rows) {
      const key = Math.min(5, Math.max(1, row.bucket));
      distribution[key] = row.count;
    }

    return distribution;
  }

  getQualityTrend(agent, timeRange = {}) {
    const conditions = [];
    const params = {};

    if (agent) {
      conditions.push('agent = @agent');
      params.agent = agent;
    }
    if (timeRange.start) {
      conditions.push('timestamp >= @timeStart');
      params.timeStart = timeRange.start;
    }
    if (timeRange.end) {
      conditions.push('timestamp <= @timeEnd');
      params.timeEnd = timeRange.end;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = this.store.db.prepare(`
      SELECT
        (timestamp / 86400000) * 86400000 AS day_bucket,
        AVG(score) AS avg_score,
        COUNT(*) AS count
      FROM quality_scores
      ${where}
      GROUP BY day_bucket
      ORDER BY day_bucket ASC
    `).all(params);

    return rows.map(r => ({
      date: new Date(r.day_bucket).toISOString().slice(0, 10),
      avgScore: Math.round(r.avg_score * 1000) / 1000,
      count: r.count,
    }));
  }

  // ─── Quality alerts ─────────────────────────────────────

  checkQualityThreshold(agent) {
    const rolling = this.getRollingAverage(agent);

    if (rolling.count === 0) {
      return { status: 'no_data', message: 'No scores recorded yet.' };
    }

    if (rolling.average < this.threshold) {
      return {
        status: 'alert',
        agent,
        average: rolling.average,
        threshold: this.threshold,
        count: rolling.count,
        windowDays: rolling.windowDays,
        message: `Quality below threshold: ${rolling.average} < ${this.threshold} over ${rolling.windowDays}d (${rolling.count} samples)`,
      };
    }

    return {
      status: 'ok',
      agent,
      average: rolling.average,
      threshold: this.threshold,
      count: rolling.count,
      windowDays: rolling.windowDays,
      message: `Quality healthy: ${rolling.average} >= ${this.threshold}`,
    };
  }
}

export default QualityScorer;
