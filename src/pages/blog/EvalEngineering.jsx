import { useState } from 'react';
import { Link } from 'react-router-dom';
import Decision, { Pill } from '../../components/Decision';
import Insight from '../../components/Insight';
import CodeBlock from '../../components/CodeBlock';
import FadeIn from '../../components/FadeIn';

const EVAL_HARNESS_CODE = `async function runEvals(testCases, agent, judges) {
  const results = [];

  for (const test of testCases) {
    const response = await agent(test.input);

    const scores = {};
    for (const [dimension, judge] of Object.entries(judges)) {
      scores[dimension] = await judge(test.input, response, test.context);
    }

    results.push({
      id: test.id,
      input: test.input,
      output: response,
      expected: test.expected,
      scores,
      pass: Object.values(scores).every(s => s >= 0.7),
    });
  }

  const passRate = results.filter(r => r.pass).length / results.length;
  const byDimension = {};
  for (const dim of Object.keys(judges)) {
    byDimension[dim] = results.reduce((sum, r) => sum + r.scores[dim], 0) / results.length;
  }

  return { results, passRate, byDimension };
}`;

const EVAL_HARNESS_OUTPUT = `> const results = await runEvals(goldenDataset, myAgent, {
    correctness: correctnessJudge,
    faithfulness: faithfulnessJudge,
    relevance: relevanceJudge,
  })

Evaluated 150 test cases across 3 dimensions:

Pass rate: 82.0% (123/150)

Scores by dimension:
  correctness:  0.87  ████████▋
  faithfulness: 0.91  █████████▏
  relevance:    0.79  ███████▏   ← weakest dimension

7 critical failures (score < 0.3 on any dimension):
  #42  faithfulness: 0.12  "Claimed product has feature X — not in docs"
  #89  correctness:  0.08  "Returned pricing from 2023, not current"
  #103 relevance:    0.21  "Answered a different question entirely"
  ...`;

const LLM_JUDGE_CODE = `async function llmJudge(question, answer, context, { rubric, model = 'claude-sonnet' } = {}) {
  const prompt = \`You are an expert evaluator. Score the following answer on a scale of 1-5.

RUBRIC:
\${rubric}

CONTEXT PROVIDED TO THE SYSTEM:
\${context}

USER QUESTION: \${question}

SYSTEM ANSWER: \${answer}

Respond with ONLY a JSON object: { "score": <1-5>, "reasoning": "<one sentence>" }\`;

  const response = await callModel(model, prompt);
  const parsed = JSON.parse(response);
  return {
    score: parsed.score / 5,   // normalize to 0-1
    reasoning: parsed.reasoning,
  };
}

// The rubric IS the eval. Vague rubrics give random results.
const FAITHFULNESS_RUBRIC = \`
5: Every claim in the answer is directly supported by the provided context.
   No additions, no extrapolations, no external knowledge used.
4: Core answer is fully supported. One minor detail could be inferred
   but isn't explicitly stated — does not mislead the user.
3: Main claim is supported but the answer adds unsupported elaboration
   that could be true or false. User might be misled.
2: Answer mixes supported and unsupported claims roughly equally.
   Some hallucinated facts presented as truth.
1: Answer contains major claims not found in the context. Clear hallucination
   that would mislead the user into wrong actions.\`;

const CORRECTNESS_RUBRIC = \`
5: Answer is factually correct and complete. Matches ground truth on
   all key points. No errors.
4: Answer is correct on the main point. Missing one minor detail
   that doesn't change the user's action.
3: Partially correct — right direction but missing important nuance
   or a secondary error that could cause problems.
2: Contains a significant factual error alongside some correct information.
1: Fundamentally wrong. Would cause the user to take incorrect action.\`;`;

const LLM_JUDGE_OUTPUT = `> await llmJudge(
    "What's the return policy?",
    "You can return within 30 days for a full refund. Items must be unused.",
    "Return Policy: Items may be returned within 30 days of purchase...",
    { rubric: FAITHFULNESS_RUBRIC }
  )

{ score: 1.0, reasoning: "5 — Both claims (30-day window, full refund)
  are directly stated in the context. No unsupported additions." }

> await llmJudge(
    "What's the return policy?",
    "You can return within 60 days. We also offer free shipping on returns.",
    "Return Policy: Items may be returned within 30 days of purchase...",
    { rubric: FAITHFULNESS_RUBRIC }
  )

{ score: 0.2, reasoning: "1 — Two hallucinations: says 60 days (context
  says 30), claims free return shipping (not mentioned in context)." }`;

const POSITION_BIAS_CODE = `// Position bias fix: run A/B comparisons twice with swapped positions
async function debiasedCompare(question, answerA, answerB, rubric) {
  // Run 1: A first, B second
  const run1 = await llmJudge(question,
    \`Option 1: \${answerA}\\n\\nOption 2: \${answerB}\`,
    null, { rubric });

  // Run 2: B first, A second
  const run2 = await llmJudge(question,
    \`Option 1: \${answerB}\\n\\nOption 2: \${answerA}\`,
    null, { rubric });

  // Average scores — cancels out position preference
  const scoreA = (run1.scoreForOption1 + run2.scoreForOption2) / 2;
  const scoreB = (run1.scoreForOption2 + run2.scoreForOption1) / 2;

  return {
    winner: scoreA > scoreB ? 'A' : 'B',
    scoreA, scoreB,
    agreement: run1.winner === run2.winner,  // false = position bias detected
  };
}

// Multi-judge panel: majority vote for high-stakes evals
async function judgePanel(question, answer, context, rubric, { n = 3 } = {}) {
  const judges = await Promise.all(
    Array.from({ length: n }, () =>
      llmJudge(question, answer, context, { rubric }))
  );

  const avgScore = judges.reduce((s, j) => s + j.score, 0) / n;
  const variance = judges.reduce((s, j) => s + (j.score - avgScore) ** 2, 0) / n;

  return {
    score: avgScore,
    confidence: variance < 0.04 ? 'high' : variance < 0.1 ? 'medium' : 'low',
    judges: judges.map(j => ({ score: j.score, reasoning: j.reasoning })),
  };
}`;

const POSITION_BIAS_OUTPUT = `> await debiasedCompare(
    "Explain quantum computing",
    longDetailedAnswer,
    shortAccurateAnswer,
    HELPFULNESS_RUBRIC
  )

Run 1 (A first): preferred Option 1 (A)  score: 0.82
Run 2 (B first): preferred Option 1 (B)  score: 0.78
                                          ↑ position bias detected!

Debiased scores:  A: 0.72   B: 0.80
Winner: B (the short accurate answer)
Agreement: false — raw judge had position bias, debiasing flipped the result

> await judgePanel(question, answer, context, FAITHFULNESS_RUBRIC, { n: 3 })
{
  score: 0.73,
  confidence: "high",     // variance: 0.007
  judges: [
    { score: 0.8, reasoning: "4 — Mostly grounded, one minor inference" },
    { score: 0.6, reasoning: "3 — Adds some unsupported elaboration" },
    { score: 0.8, reasoning: "4 — Core claims supported by context" },
  ]
}`;

const REGRESSION_CODE = `// Prompt versioning: treat prompts as code, test before deploying
const PROMPT_REGISTRY = {
  'support-agent-v12': {
    version: 12,
    template: \`You are a customer support agent for {{company}}.
Answer questions using ONLY the provided documentation.
If unsure, say "Let me connect you with a specialist."
Never make up product features or pricing.\`,
    changelog: 'Added instruction to not make up pricing (v11 hallucinated prices)',
    goldenDatasetId: 'support-agent-golden-v3',
  },
};

async function promptRegressionTest(promptId, newPrompt) {
  const registry = PROMPT_REGISTRY[promptId];
  const golden = await loadGoldenDataset(registry.goldenDatasetId);

  // Run current prompt and new prompt on same test cases
  const [baseline, candidate] = await Promise.all([
    runEvals(golden, makeAgent(registry.template), judges),
    runEvals(golden, makeAgent(newPrompt), judges),
  ]);

  // Compare dimension by dimension
  const comparison = {};
  for (const dim of Object.keys(judges)) {
    const delta = candidate.byDimension[dim] - baseline.byDimension[dim];
    comparison[dim] = {
      baseline: baseline.byDimension[dim],
      candidate: candidate.byDimension[dim],
      delta,
      regression: delta < -0.05,  // >5% drop = regression
    };
  }

  const hasRegression = Object.values(comparison).some(c => c.regression);

  // Find specific test cases that regressed
  const regressions = golden.map((test, i) => {
    const bScore = Object.values(baseline.results[i].scores).reduce((a,b) => a+b, 0);
    const cScore = Object.values(candidate.results[i].scores).reduce((a,b) => a+b, 0);
    return { test, baselineScore: bScore, candidateScore: cScore, delta: cScore - bScore };
  }).filter(r => r.delta < -0.3).sort((a, b) => a.delta - b.delta);

  return { comparison, hasRegression, regressions,
    recommendation: hasRegression ? 'BLOCK' : 'APPROVE' };
}`;

const REGRESSION_OUTPUT = `> await promptRegressionTest('support-agent-v12', newPromptDraft)

Comparing v12 (baseline) vs candidate on 200 test cases:

Dimension      Baseline  Candidate  Delta
────────────────────────────────────────────────
correctness    0.87      0.89       +0.02  ✓
faithfulness   0.91      0.84       -0.07  ✘ REGRESSION
relevance      0.79      0.81       +0.02  ✓

RECOMMENDATION: BLOCK — faithfulness dropped 7%

3 regressions found (score delta > -0.3):
  #67: "What's the enterprise pricing?"
    v12: "Let me connect you with a specialist." (faith: 1.0)
    new: "Enterprise starts at $500/mo"          (faith: 0.2) ← hallucinated!
  #134: "Does the API support GraphQL?"
    v12: "Currently REST only, GraphQL on roadmap" (faith: 0.8)
    new: "Yes, we support GraphQL and REST"         (faith: 0.2) ← hallucinated!`;

const HITL_CODE = `// Active learning: review cases where the system is least confident
async function selectForHumanReview(evalResults, { budget = 50 } = {}) {
  const candidates = evalResults.results
    .map(r => ({
      ...r,
      avgScore: Object.values(r.scores).reduce((a, b) => a + b, 0) / Object.values(r.scores).length,
      minScore: Math.min(...Object.values(r.scores)),
      maxSpread: Math.max(...Object.values(r.scores)) - Math.min(...Object.values(r.scores)),
    }))
    .sort((a, b) => {
      // Priority 1: low-confidence cases (judge scores spread wide)
      if (a.maxSpread > 0.4 && b.maxSpread <= 0.4) return -1;
      if (b.maxSpread > 0.4 && a.maxSpread <= 0.4) return 1;
      // Priority 2: borderline cases (near the pass/fail threshold)
      const aDist = Math.abs(a.avgScore - 0.7);
      const bDist = Math.abs(b.avgScore - 0.7);
      return aDist - bDist;
    });

  return candidates.slice(0, budget);
}

// Inter-annotator agreement: are your labels trustworthy?
function cohensKappa(annotator1, annotator2) {
  const n = annotator1.length;
  const labels = [...new Set([...annotator1, ...annotator2])];

  // Observed agreement
  let agree = 0;
  for (let i = 0; i < n; i++) {
    if (annotator1[i] === annotator2[i]) agree++;
  }
  const po = agree / n;

  // Expected agreement by chance
  let pe = 0;
  for (const label of labels) {
    const p1 = annotator1.filter(l => l === label).length / n;
    const p2 = annotator2.filter(l => l === label).length / n;
    pe += p1 * p2;
  }

  return (po - pe) / (1 - pe);  // kappa: >0.8 excellent, >0.6 good, <0.4 poor
}`;

const HITL_OUTPUT = `> const toReview = await selectForHumanReview(evalResults, { budget: 30 })

Selected 30 cases for human review:

Category breakdown:
  12 high-spread (judge disagreement > 0.4)
   8 borderline  (avg score 0.65-0.75)
   6 near-fail   (one dimension < 0.4)
   4 random       (baseline calibration)

Top priority reviews:
  #42: scores [0.9, 0.1, 0.8] — faithfulness judge disagrees with others
  #89: scores [0.6, 0.7, 0.8] — borderline pass, correctness uncertain
  #15: scores [0.5, 0.5, 0.5] — every judge unsure

> cohensKappa(annotatorA, annotatorB)
0.74  ← "good" agreement (>0.6 = reliable labels)

> cohensKappa(annotatorA, annotatorC)
0.43  ← "moderate" — review labeling guidelines, annotators diverging`;

const METRICS_CODE = `// Eval SLO monitor: track quality metrics like you track uptime
class EvalSLOMonitor {
  constructor(config) {
    this.slos = config.slos;
    this.window = config.windowMinutes || 60;
    this.alertChannels = config.alertChannels;
  }

  async checkSLOs(recentEvals) {
    const violations = [];

    for (const [metric, threshold] of Object.entries(this.slos)) {
      const values = recentEvals.map(e => e.scores[metric]).filter(Boolean);
      if (values.length === 0) continue;

      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const p5 = values.sort((a, b) => a - b)[Math.floor(values.length * 0.05)];

      if (avg < threshold.avg) {
        violations.push({
          metric, type: 'avg_below_slo',
          value: avg, threshold: threshold.avg,
          severity: avg < threshold.avg * 0.9 ? 'critical' : 'warning',
        });
      }
      if (p5 < threshold.floor) {
        violations.push({
          metric, type: 'p5_below_floor',
          value: p5, threshold: threshold.floor,
          severity: 'critical',  // tail quality collapsed
        });
      }
    }

    if (violations.length > 0) {
      await this.alert(violations);
    }
    return { healthy: violations.length === 0, violations };
  }

  async alert(violations) {
    const critical = violations.filter(v => v.severity === 'critical');
    if (critical.length > 0) {
      await page(this.alertChannels.oncall,
        \`EVAL SLO BREACH: \${critical.map(v =>
          \\\`\\\${v.metric} \\\${v.type} (\\\${v.value.toFixed(2)} < \\\${v.threshold})\\\`
        ).join(', ')}\`);
    }
  }
}

// Usage
const monitor = new EvalSLOMonitor({
  slos: {
    correctness:  { avg: 0.85, floor: 0.50 },
    faithfulness: { avg: 0.90, floor: 0.60 },
    relevance:    { avg: 0.80, floor: 0.40 },
    latency_ms:   { avg: 2000, floor: null },
  },
  windowMinutes: 60,
  alertChannels: { oncall: '#ai-oncall', slack: '#ai-quality' },
});`;

const METRICS_OUTPUT = `> await monitor.checkSLOs(last60MinEvals)

SLO Check (window: 60min, n=342 evals):

Metric         Avg    SLO    Status     p5     Floor
──────────────────────────────────────────────────────
correctness    0.87   0.85   ✓ healthy   0.52   0.50
faithfulness   0.83   0.90   ✘ WARNING   0.31   0.60  ← p5 CRITICAL
relevance      0.81   0.80   ✓ healthy   0.45   0.40
latency_ms     1847   2000   ✓ healthy   ---    ---

VIOLATIONS:
  [WARNING]  faithfulness avg 0.83 < SLO 0.90
  [CRITICAL] faithfulness p5 0.31 < floor 0.60

→ Paging #ai-oncall: tail faithfulness collapsed
→ Likely cause: RAG index update 47min ago changed retrieval quality`;

const TABS = ['Eval Frameworks', 'LLM-as-Judge', 'Regression Testing', 'Human-in-the-Loop', 'Metrics That Matter'];

export default function EvalEngineering() {
  const [tab, setTab] = useState(0);

  return (
    <div className="page-content">
      <Link to="/blog" style={styles.back}>&larr; AI Engineering</Link>
      <p style={styles.eyebrow}>Post 08</p>
      <h1 style={styles.h1}>Evaluation Engineering</h1>
      <p style={styles.subtitle}>
        LLM-as-judge, golden datasets, regression testing, human-in-the-loop &mdash; how to know
        if your AI system actually works, and catch when it silently breaks.
      </p>

      <div style={styles.tabWrap}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            style={{ ...styles.tabBtn, ...(tab === i ? styles.tabActive : {}) }}>
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && <FrameworksPanel />}
      {tab === 1 && <JudgePanel />}
      {tab === 2 && <RegressionPanel />}
      {tab === 3 && <HITLPanel />}
      {tab === 4 && <MetricsPanel />}

      <FadeIn><div style={{ marginTop: 48, padding: '24px 28px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
        <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Capstone Project</p>
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-h)', marginBottom: 6 }}>RAG Eval Harness</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Build the real thing. Production-grade project brief with architecture requirements, evaluation criteria, and deep dive exercises.</p>
        <a href="https://github.com/gmaheshraju/Hands-on-AgenticAI/blob/main/projects/08-eval-engineering.md" target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--text-accent)', textDecoration: 'none', fontWeight: 500 }}>View project brief on GitHub →</a>
      </div></FadeIn>
    </div>
  );
}

function SectionHead({ title, desc }) {
  return (
    <>
      <h2 style={styles.sh}>{title}</h2>
      <p style={styles.ss}>{desc}</p>
    </>
  );
}

/* ────────── SVG: Eval Pipeline Architecture ────────── */

function EvalPipelineDiagram() {
  const f = 'var(--font-body)';
  const fm = 'var(--font-mono)';

  return (
    <div style={{ overflowX: 'auto', margin: '20px 0' }}>
      <svg viewBox="0 0 740 420" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', display: 'block' }}>
        <text x="370" y="22" textAnchor="middle" fontSize="14" fontWeight="400" fill="var(--text-h)" fontFamily="var(--font-display)">Eval Pipeline Architecture</text>

        {/* ── Offline Evals (top row) ── */}
        <text x="20" y="56" fontSize="10" fontWeight="600" fill="var(--text-accent)" fontFamily={fm}>OFFLINE EVALS</text>

        {/* Golden Dataset */}
        <rect x="20" y="66" width="110" height="44" rx="6" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="75" y="84" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Golden Dataset</text>
        <text x="75" y="98" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>50-500+ test cases</text>

        {/* Arrow */}
        <line x1="130" y1="88" x2="160" y2="88" stroke="var(--text-muted)" strokeWidth="0.8" markerEnd="url(#arrow)" />

        {/* Eval Harness */}
        <rect x="160" y="66" width="100" height="44" rx="6" fill="var(--bg-card)" stroke="var(--text-accent)" strokeWidth="1" />
        <text x="210" y="84" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Eval Harness</text>
        <text x="210" y="98" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>run all dimensions</text>

        {/* Arrow to judges */}
        <line x1="260" y1="88" x2="290" y2="88" stroke="var(--text-muted)" strokeWidth="0.8" markerEnd="url(#arrow)" />

        {/* Judge boxes */}
        <rect x="290" y="50" width="120" height="28" rx="5" fill="#3949AB" opacity="0.15" stroke="#3949AB" strokeWidth="0.5" />
        <text x="350" y="68" textAnchor="middle" fontSize="8" fontWeight="500" fill="var(--text-h)" fontFamily={f}>Correctness Judge</text>

        <rect x="290" y="82" width="120" height="28" rx="5" fill="#3F8624" opacity="0.15" stroke="#3F8624" strokeWidth="0.5" />
        <text x="350" y="100" textAnchor="middle" fontSize="8" fontWeight="500" fill="var(--text-h)" fontFamily={f}>Faithfulness Judge</text>

        <rect x="290" y="114" width="120" height="28" rx="5" fill="#C925D1" opacity="0.15" stroke="#C925D1" strokeWidth="0.5" />
        <text x="350" y="132" textAnchor="middle" fontSize="8" fontWeight="500" fill="var(--text-h)" fontFamily={f}>Relevance Judge</text>

        {/* Arrow to Score Report */}
        <line x1="410" y1="96" x2="440" y2="96" stroke="var(--text-muted)" strokeWidth="0.8" markerEnd="url(#arrow)" />

        {/* Score Report */}
        <rect x="440" y="74" width="100" height="44" rx="6" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="490" y="92" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Score Report</text>
        <text x="490" y="106" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>per-dimension</text>

        {/* Arrow to Pass/Fail */}
        <line x1="540" y1="96" x2="570" y2="96" stroke="var(--text-muted)" strokeWidth="0.8" markerEnd="url(#arrow)" />

        {/* Pass/Fail Gate */}
        <rect x="570" y="74" width="100" height="44" rx="6" fill="#3F8624" opacity="0.2" stroke="#3F8624" strokeWidth="1" />
        <text x="620" y="92" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Pass / Fail</text>
        <text x="620" y="106" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>deploy gate</text>

        {/* ── Online Evals (middle row) ── */}
        <text x="20" y="186" fontSize="10" fontWeight="600" fill="var(--text-accent)" fontFamily={fm}>ONLINE EVALS</text>

        {/* Live Traffic */}
        <rect x="20" y="196" width="110" height="44" rx="6" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="75" y="214" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Live Traffic</text>
        <text x="75" y="228" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>5-10% sampled</text>

        {/* Arrow */}
        <line x1="130" y1="218" x2="160" y2="218" stroke="var(--text-muted)" strokeWidth="0.8" markerEnd="url(#arrow)" />

        {/* Async Queue */}
        <rect x="160" y="196" width="100" height="44" rx="6" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="210" y="214" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Async Queue</text>
        <text x="210" y="228" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>non-blocking</text>

        {/* Arrow */}
        <line x1="260" y1="218" x2="290" y2="218" stroke="var(--text-muted)" strokeWidth="0.8" markerEnd="url(#arrow)" />

        {/* Same judges */}
        <rect x="290" y="196" width="120" height="44" rx="6" fill="var(--bg-card)" stroke="var(--text-accent)" strokeWidth="1" strokeDasharray="4 2" />
        <text x="350" y="214" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Same Judges</text>
        <text x="350" y="228" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>reuse offline rubrics</text>

        {/* Arrow */}
        <line x1="410" y1="218" x2="440" y2="218" stroke="var(--text-muted)" strokeWidth="0.8" markerEnd="url(#arrow)" />

        {/* Dashboard */}
        <rect x="440" y="196" width="100" height="44" rx="6" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="490" y="214" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Dashboard</text>
        <text x="490" y="228" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>time-series metrics</text>

        {/* Arrow */}
        <line x1="540" y1="218" x2="570" y2="218" stroke="var(--text-muted)" strokeWidth="0.8" markerEnd="url(#arrow)" />

        {/* Alerts */}
        <rect x="570" y="196" width="100" height="44" rx="6" fill="#ED7100" opacity="0.2" stroke="#ED7100" strokeWidth="1" />
        <text x="620" y="214" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Alerts</text>
        <text x="620" y="228" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>SLO violations</text>

        {/* ── Feedback Loop (bottom) ── */}
        <text x="20" y="306" fontSize="10" fontWeight="600" fill="var(--text-accent)" fontFamily={fm}>FEEDBACK LOOP</text>

        {/* Human Review */}
        <rect x="290" y="316" width="120" height="44" rx="6" fill="#E7157B" opacity="0.15" stroke="#E7157B" strokeWidth="0.8" />
        <text x="350" y="334" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Human Review</text>
        <text x="350" y="348" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>active learning picks</text>

        {/* Arrow from Dashboard down to Human Review */}
        <line x1="490" y1="240" x2="490" y2="338" stroke="var(--text-muted)" strokeWidth="0.8" strokeDasharray="3 2" />
        <line x1="490" y1="338" x2="410" y2="338" stroke="var(--text-muted)" strokeWidth="0.8" strokeDasharray="3 2" markerEnd="url(#arrow)" />
        <text x="460" y="296" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>low-confidence</text>
        <text x="460" y="306" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>cases</text>

        {/* Arrow from Human Review back up to Golden Dataset */}
        <line x1="290" y1="338" x2="75" y2="338" stroke="var(--text-muted)" strokeWidth="0.8" strokeDasharray="3 2" />
        <line x1="75" y1="338" x2="75" y2="110" stroke="var(--text-muted)" strokeWidth="0.8" strokeDasharray="3 2" markerEnd="url(#arrow)" />
        <text x="180" y="370" textAnchor="middle" fontSize="8" fontWeight="500" fill="var(--text-accent)" fontFamily={f}>Update Golden Dataset</text>

        {/* Arrow marker definition */}
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6" fill="none" stroke="var(--text-muted)" strokeWidth="0.8" />
          </marker>
        </defs>
      </svg>
    </div>
  );
}

/* ────────── Tab 1: Eval Frameworks ────────── */

function FrameworksPanel() {
  return (
    <div>
      <SectionHead
        title="What are you actually measuring?"
        desc="Most teams start with 'is the answer correct?' and stop there. Production eval needs at least five dimensions, because a correct answer that hallucinates extra facts or ignores the question is still a failure."
      />

      <EvalPipelineDiagram />

      <FadeIn><Decision question="What dimensions should you evaluate? (It's NOT just correctness)">
        <Pill type="green">Correctness</Pill> Does the answer match ground truth? The obvious one. But useless in isolation &mdash; a correct answer buried in three paragraphs of hallucinated context scores high on correctness and zero on faithfulness.
        <br /><br />
        <Pill type="green">Faithfulness</Pill> Is the answer grounded in the provided context? This catches hallucination. A RAG system that invents features not in the docs is unfaithful even if the invented feature happens to exist. This is the dimension most teams under-measure.
        <br /><br />
        <Pill type="green">Relevance</Pill> Does the answer address the actual question asked? An LLM that receives a question about pricing and returns a technically correct explanation of the billing architecture is irrelevant. Users notice this instantly.
        <br /><br />
        <Pill type="amber">Harmlessness</Pill> Does the answer contain harmful, biased, or unsafe content? Critical for consumer-facing systems. Less relevant for internal tools but still matters for compliance.
        <br /><br />
        <Pill type="amber">Helpfulness</Pill> Is the answer actually useful? A one-word "yes" might be correct, faithful, and relevant, but unhelpful. Hardest to measure because it requires understanding user intent.
      </Decision></FadeIn>

      <FadeIn delay={100}><Insight tag="Production reality">
        In practice, faithfulness and correctness together catch 80% of production issues. Add relevance as your third dimension. Harmlessness and helpfulness matter but are harder to automate &mdash; start with the first three and add the others when you have the eval infrastructure running.
      </Insight></FadeIn>

      <FadeIn delay={150}><Decision question="Reference-based vs reference-free evals?">
        <Pill type="green">Reference-based (you have ground truth)</Pill> You have known-correct answers to compare against. Options ranked by quality: LLM-as-judge (best correlation with humans, ~$0.01/eval), semantic similarity via embeddings (fast, cheap, ~0.7 correlation), BLEU/ROUGE (terrible for generative AI &mdash; penalizes correct paraphrases). Always prefer LLM-as-judge when you can afford it.
        <br /><br />
        <Pill type="amber">Reference-free (no ground truth)</Pill> No gold-standard answers. Options: LLM-as-judge with a rubric (can still score faithfulness, relevance without ground truth), human review (gold standard but expensive and slow), proxy metrics (user thumbs up/down, follow-up question rate, session abandonment). Most real systems use a mix &mdash; reference-based for your golden dataset, reference-free for live traffic.
      </Decision></FadeIn>

      <FadeIn delay={200}><Decision question="Offline vs online evals &mdash; when do you run each?">
        <Pill type="green">Offline evals (pre-deploy gate)</Pill> Run on your golden dataset before any deployment. Catches regressions from prompt changes, model upgrades, or RAG index updates. Fast feedback loop &mdash; minutes, not days. Every CI/CD pipeline for AI should include this.
        <br /><br />
        <Pill type="green">Online evals (production monitoring)</Pill> Sample 5-10% of live traffic, run through the same judges asynchronously. Catches distribution shift (users asking questions your golden dataset doesn't cover), real-world edge cases, and gradual quality degradation. This is your smoke detector.
        <br /><br />
        <Pill type="red">Neither (vibes-based deployment)</Pill> "I read a few outputs and they looked fine." This is how teams ship hallucinating systems and find out from angry customers three weeks later.
      </Decision></FadeIn>

      <FadeIn delay={250}><Insight type="warn">
        The #1 mistake: building eval infrastructure after you have a production incident. Build it before you deploy. A basic eval harness with 50 test cases and one LLM judge takes a day to build. That day prevents the week-long fire drill when your prompt change silently breaks 15% of responses.
      </Insight></FadeIn>

      <FadeIn delay={300}><CodeBlock filename="eval-harness.js" code={EVAL_HARNESS_CODE} output={EVAL_HARNESS_OUTPUT} /></FadeIn>
    </div>
  );
}

/* ────────── Tab 2: LLM-as-Judge ────────── */

function JudgePanel() {
  return (
    <div>
      <SectionHead
        title="LLM-as-Judge &mdash; the most important eval technique"
        desc="Humans can't review 10K outputs per week. BLEU/ROUGE correlate poorly with actual quality (0.3-0.4 with human judgment). A calibrated LLM judge correlates 0.8-0.9 with humans at $0.01 per evaluation. This is not optional for production AI."
      />

      <FadeIn><Decision question="Why does LLM-as-judge work so well?">
        <Pill type="green">Scale</Pill> A human reviewer does 50-100 evaluations per hour. An LLM judge does 1000+ per minute. At production volumes (thousands of queries/day), human-only review is economically impossible.
        <br /><br />
        <Pill type="green">Consistency</Pill> Human reviewers drift over time (fatigue, mood, recalibration). An LLM judge with a fixed rubric gives the same score for the same input every time (at temperature 0). Consistency matters more than perfect accuracy for tracking regressions.
        <br /><br />
        <Pill type="amber">Limitations</Pill> LLM judges have blind spots: they struggle with domain-specific correctness (medical, legal), they exhibit position bias in A/B comparisons, and they can be "fooled" by confident-sounding wrong answers. Always calibrate against human judgment on a sample.
      </Decision></FadeIn>

      <FadeIn delay={100}><Insight tag="Staff+ signal">
        The rubric IS the eval. A prompt that says "rate this answer 1-5" gives noise. A rubric with concrete examples for each score level &mdash; "5 means every claim is directly supported by context, 1 means major claims are fabricated" &mdash; gives signal. Spend 80% of your eval engineering time on rubric design.
      </Insight></FadeIn>

      <FadeIn delay={150}><CodeBlock filename="llm-judge.js" code={LLM_JUDGE_CODE} output={LLM_JUDGE_OUTPUT} /></FadeIn>

      <FadeIn delay={200}><Decision question="Single judge vs multi-judge panel?">
        <Pill type="green">Single judge (default)</Pill> One LLM call per evaluation. Fast, cheap ($0.005-0.02 per eval). Sufficient for regression testing and continuous monitoring where you need directional signal, not precision. Use temperature 0.
        <br /><br />
        <Pill type="amber">Panel of 3 (high-stakes)</Pill> Three independent LLM calls, take the majority vote or average. Catches cases where one judge misreads the rubric. Costs 3x but reduces evaluation variance by ~40%. Use for: golden dataset creation, model selection decisions, and any eval that gates a deployment.
        <br /><br />
        <Pill type="red">Panel of 5+ (diminishing returns)</Pill> Going beyond 3 judges rarely improves agreement. If 3 judges disagree, the task is likely underspecified &mdash; fix the rubric, don't add more judges.
      </Decision></FadeIn>

      <FadeIn delay={250}><Decision question="How do you handle position bias?">
        <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-p)' }}>
          LLMs prefer the first option in A/B comparisons. This is well-documented: GPT-4 shows 60-65% first-position preference, Claude shows 55-60%. If you're using an LLM judge to compare two model outputs, a naive comparison is unreliable.
        </p>
        <br />
        <Pill type="green">Run twice, swap positions</Pill> Present A-then-B, then B-then-A. Average the scores. This cancels out position preference. If the two runs disagree on the winner, flag it as "position bias detected" and send to human review.
        <br /><br />
        <Pill type="amber">Use scoring instead of comparison</Pill> Instead of "which is better, A or B?", score each independently on a rubric. Eliminates position bias entirely but requires a well-calibrated rubric with absolute (not relative) criteria.
      </Decision></FadeIn>

      <FadeIn delay={300}><CodeBlock filename="debiased-judge.js" code={POSITION_BIAS_CODE} output={POSITION_BIAS_OUTPUT} /></FadeIn>

      <FadeIn delay={350}><Insight>
        Real cost math: evaluating 10K queries/day across 3 dimensions with a single Claude Haiku judge costs ~$15/day ($0.0005 per judge call x 3 dimensions x 10K). A 3-judge panel on 10% of traffic (high-confidence sampling) adds $4.50/day. This is trivially cheap compared to the engineering time saved debugging quality issues without evals.
      </Insight></FadeIn>
    </div>
  );
}

/* ────────── Tab 3: Regression Testing ────────── */

function RegressionPanel() {
  return (
    <div>
      <SectionHead
        title="Regression testing &mdash; catch breaks before users do"
        desc="A one-word prompt change can drop accuracy by 15%. A model version bump can change behavior on edge cases you never tested. Without regression testing, you're deploying blind."
      />

      <FadeIn><Decision question="Golden datasets &mdash; how to build them right">
        <Pill type="green">Start with 50, grow to 500+</Pill> You don't need 10K test cases on day one. 50 well-chosen cases covering your main use cases, edge cases, and known failure modes is enough to catch most regressions. Add cases every time you find a production bug &mdash; that bug becomes a regression test.
        <br /><br />
        <Pill type="green">Cover the distribution, not just happy paths</Pill> If 30% of your production traffic is ambiguous questions, 30% of your golden dataset should be ambiguous questions. If you only test clean, well-formed queries, you'll miss the failures that actually hurt users.
        <br /><br />
        <Pill type="amber">Include adversarial cases</Pill> Prompt injections, off-topic queries, queries in unexpected languages, queries that reference information not in your knowledge base. These are the cases that fail silently.
        <br /><br />
        <Pill type="red">Auto-generated test cases only</Pill> Using an LLM to generate your golden dataset creates a circular evaluation &mdash; the LLM tests what another LLM thinks is important, not what your users actually ask. Always seed with real production queries.
      </Decision></FadeIn>

      <FadeIn delay={100}><Insight tag="Staff+ signal">
        The golden dataset should be version-controlled alongside your prompts. When someone changes a prompt, the PR should include updated golden dataset results showing no regression. This is the AI equivalent of "tests must pass before merge." Make it a CI gate, not a suggestion.
      </Insight></FadeIn>

      <FadeIn delay={150}><Decision question="When to run regression tests">
        <Pill type="green">Every prompt change</Pill> Prompt changes are the #1 source of silent regressions. A well-intentioned edit to "be more concise" can make the model skip important caveats. Run the full golden dataset before merging any prompt change.
        <br /><br />
        <Pill type="green">Every model version change</Pill> Claude Sonnet 3.5 to 4 changed tool-use behavior significantly. GPT-4 to GPT-4-turbo changed output length distributions. Always re-evaluate on your golden dataset when you change the underlying model.
        <br /><br />
        <Pill type="green">Every RAG index update</Pill> New documents, re-chunked documents, or updated embeddings can all change retrieval quality. A document update that fixes one answer might break three others that depended on the old chunk boundaries.
        <br /><br />
        <Pill type="amber">Every tool schema change</Pill> If your agent uses function calling, changes to tool descriptions or parameter schemas can change when and how tools are invoked. Test the full agent flow, not just the LLM output.
      </Decision></FadeIn>

      <FadeIn delay={200}><Decision question="Handling non-determinism in evals">
        <Pill type="green">Temperature 0 for eval runs</Pill> Set temperature to 0 (or as low as possible) for reproducibility. This doesn't eliminate non-determinism entirely &mdash; batching, quantization, and routing can still cause variation &mdash; but it reduces it dramatically.
        <br /><br />
        <Pill type="amber">Run 3-5 times, majority vote</Pill> For cases where you need temperature &gt; 0 (creative tasks, diverse outputs), run each test case multiple times and use majority vote for pass/fail. If 3/5 runs pass, the test case passes. This tolerates acceptable variation.
        <br /><br />
        <Pill type="amber">Track variance, not just mean</Pill> A test case that passes 100% of the time is stable. One that passes 60% of the time is flaky &mdash; and flaky evals are worse than no evals because they teach the team to ignore failures.
      </Decision></FadeIn>

      <FadeIn delay={250}><CodeBlock filename="prompt-regression.js" code={REGRESSION_CODE} output={REGRESSION_OUTPUT} /></FadeIn>

      <FadeIn delay={300}><Insight type="warn">
        Real incident: A team changed their support agent prompt from "If unsure, say you don't know" to "Be helpful and provide the best answer you can." Faithfulness dropped 12% because the model started confidently making up product features instead of admitting uncertainty. Caught by regression testing on deployment day, not by a customer three weeks later.
      </Insight></FadeIn>
    </div>
  );
}

/* ────────── Tab 4: Human-in-the-Loop ────────── */

function HITLPanel() {
  return (
    <div>
      <SectionHead
        title="Human-in-the-loop &mdash; when machines aren't enough"
        desc="LLM judges are good but not perfect. You need humans for calibrating judges, building golden datasets, and reviewing edge cases where automated evals give low confidence."
      />

      <FadeIn><Decision question="When do you need human review?">
        <Pill type="green">Calibrating LLM judges</Pill> Before you trust an LLM judge, have humans score the same 100 cases. Compute correlation (Pearson or Spearman). If it's below 0.75, your rubric needs work. Re-calibrate every time you change the rubric or the judge model.
        <br /><br />
        <Pill type="green">Building golden datasets</Pill> The expected outputs in your golden dataset should be human-verified. An LLM-generated "correct" answer that's subtly wrong poisons your entire eval pipeline &mdash; every future eval measures against a wrong standard.
        <br /><br />
        <Pill type="green">Low-confidence cases</Pill> When the LLM judge scores spread wide (one judge says 0.9, another says 0.3), the case is ambiguous. Route these to human review instead of guessing.
        <br /><br />
        <Pill type="amber">High-stakes domains</Pill> Medical, legal, financial &mdash; where a wrong answer has real consequences. LLM judges lack domain expertise to catch subtle errors that a domain expert would flag immediately.
      </Decision></FadeIn>

      <FadeIn delay={100}><Decision question="How to design annotation protocols">
        <Pill type="green">Clear labeling guidelines with examples</Pill> "Is this answer good?" is not a labeling task. "Score faithfulness 1-5 using this rubric, here are 3 examples of each score level" is a labeling task. The more specific your guidelines, the higher your inter-annotator agreement.
        <br /><br />
        <Pill type="green">Measure inter-annotator agreement</Pill> Cohen's kappa above 0.7 means your annotators agree reliably. Below 0.4 means your task is underspecified &mdash; fix the guidelines before collecting more labels. Paying for labels with kappa 0.3 is literally wasting money.
        <br /><br />
        <Pill type="amber">Dual annotation on a subset</Pill> Have two annotators label the same 20% of cases. Use agreement on this overlap to monitor quality. If agreement drops, retrain annotators before they corrupt more data.
      </Decision></FadeIn>

      <FadeIn delay={150}><Insight tag="Staff+ signal">
        Active learning saves 60-70% of annotation budget. Instead of reviewing random samples, review cases where the LLM judge had low confidence, where multiple judges disagreed, or where the model's answer was borderline pass/fail. You get more information per dollar from uncertain cases than from cases the system already handles well.
      </Insight></FadeIn>

      <FadeIn delay={200}><CodeBlock filename="human-review.js" code={HITL_CODE} output={HITL_OUTPUT} /></FadeIn>

      <FadeIn delay={250}><Decision question="Annotation costs &mdash; real numbers">
        <Pill type="green">Crowd workers ($0.10-0.50 per judgment)</Pill> Platforms like Scale, Surge, or Labelbox. Good for: straightforward quality judgments, relevance scoring, harmlessness checks. Not reliable for: domain-specific correctness, subtle factual errors, nuanced rubrics.
        <br /><br />
        <Pill type="amber">Domain experts ($5-20 per judgment)</Pill> In-house or contracted specialists. Good for: medical/legal/financial accuracy, complex rubric evaluation, golden dataset creation. Expensive but irreplaceable for high-stakes domains.
        <br /><br />
        <Pill type="green">Internal dogfooding (free but biased)</Pill> Your own team reviewing outputs. Good for: initial rubric development, catching obvious failures, building intuition. Biased because your team knows the system's tendencies and compensates unconsciously. Don't rely on this alone.
      </Decision></FadeIn>

      <FadeIn delay={300}><Insight>
        The flywheel: human review produces labels &rarr; labels train/calibrate LLM judges &rarr; LLM judges identify uncertain cases &rarr; uncertain cases go to human review. Each cycle improves both the golden dataset and the automated judges. This is the eval equivalent of a self-improving system. Budget 10-15% of ongoing AI spend on this loop.
      </Insight></FadeIn>
    </div>
  );
}

/* ────────── Tab 5: Metrics That Matter ────────── */

function MetricsPanel() {
  return (
    <div>
      <SectionHead
        title="Metrics that matter &mdash; and SLOs that bite"
        desc="You don't need 50 metrics. You need 5 good ones with thresholds that page someone at 3am when quality drops. Treat AI quality like you treat uptime."
      />

      <FadeIn><Decision question="What to track on your eval dashboard">
        <Pill type="green">Accuracy / pass rate (trending over time)</Pill> Not just the current number &mdash; the trend. A pass rate that drops from 88% to 84% over two weeks is a slow leak that no single alert catches. Plot it daily, set a 7-day moving average, alert on sustained decline.
        <br /><br />
        <Pill type="green">Faithfulness score (per RAG index version)</Pill> Track faithfulness separately from correctness. When you update your RAG index, faithfulness can drop even if correctness stays flat &mdash; the model starts hallucinating from poorly chunked new documents. Tag each eval with the index version.
        <br /><br />
        <Pill type="green">Latency p50/p95/p99 (by model and route)</Pill> AI latency is bimodal &mdash; most queries fast, some extremely slow (long outputs, complex tool chains). p50 hides the pain. p95 shows what 1-in-20 users experience. Break down by model tier so you know when to route to a faster model.
        <br /><br />
        <Pill type="amber">Cost per query (by model tier)</Pill> Track input tokens, output tokens, and judge eval cost separately. A prompt change that improves quality but 3x's token usage might not be worth it. Set a budget per query tier and alert when it's exceeded.
        <br /><br />
        <Pill type="amber">User feedback signals</Pill> Thumbs up/down, follow-up question rate (proxy for "first answer didn't help"), session abandonment after AI response (proxy for "gave up"). These are noisy but catch issues that automated evals miss &mdash; like the answer being technically correct but confusingly worded.
      </Decision></FadeIn>

      <FadeIn delay={100}><Decision question="Setting SLOs for AI systems">
        <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-p)' }}>
          SLOs turn vague quality goals into concrete alerts. These thresholds are calibrated from real production systems &mdash; adjust based on your domain:
        </p>
        <br />
        <Pill type="green">Accuracy &gt; 85% on golden dataset</Pill> Below 85%, users notice errors frequently enough to lose trust. For user-facing chat, aim for 90%+. For internal tools with expert users who can verify, 80% may be acceptable.
        <br /><br />
        <Pill type="green">Faithfulness &gt; 90% (hallucination rate &lt; 10%)</Pill> This is the hardest SLO to maintain. A 10% hallucination rate means 1-in-10 answers contains fabricated information. For RAG systems, most hallucinations come from poor retrieval, not the LLM &mdash; fix your chunking before tuning your prompt.
        <br /><br />
        <Pill type="amber">p95 latency &lt; 3s for user-facing</Pill> Users start abandoning after 3 seconds. For streaming responses, time-to-first-token matters more than total latency &mdash; set TTFT SLO at 500ms.
        <br /><br />
        <Pill type="amber">Cost per query &lt; $0.01 for tier-1 traffic</Pill> Tier-1 is your high-volume, low-complexity traffic (FAQ, simple lookups). Use cheaper models (Haiku, GPT-4o-mini) with prompt caching. Tier-2 (complex reasoning, multi-step) can be $0.05-0.10 per query.
      </Decision></FadeIn>

      <FadeIn delay={150}><Insight type="warn">
        Set a p5 floor, not just an average SLO. Average faithfulness of 0.90 can hide a tail where 5% of responses score below 0.30 &mdash; pure hallucination. The average looks healthy while 1-in-20 users gets dangerously wrong information. A p5 floor of 0.60 catches tail collapse that averages miss.
      </Insight></FadeIn>

      <FadeIn delay={200}><CodeBlock filename="eval-slo-monitor.js" code={METRICS_CODE} output={METRICS_OUTPUT} /></FadeIn>

      <FadeIn delay={250}><Decision question="A/B testing AI systems &mdash; how it's different from traditional A/B">
        <Pill type="green">Need ~1000 queries for statistical significance</Pill> Quality metrics are noisier than click-through rates. You need more data points to distinguish "prompt B is 3% better" from random variation. Run for at least a week to cover weekday/weekend traffic distribution differences.
        <br /><br />
        <Pill type="amber">Split by session, not by query</Pill> A user who gets good answers on 9 queries and a hallucinated answer on the 10th has a bad experience. Split by user/session so each user gets a consistent experience. Mixing within a session makes quality metrics unreliable.
        <br /><br />
        <Pill type="amber">Track cost alongside quality</Pill> Prompt B might score 2% higher on faithfulness but cost 40% more in tokens. Run both cost and quality metrics &mdash; the winner is the one with the best quality-per-dollar, not the highest absolute quality.
        <br /><br />
        <Pill type="red">A/B test without automated evals</Pill> If you're A/B testing based on user thumbs-up/down alone, you need 10K+ data points per variant because the signal is so noisy. Automated eval scores give you significance in 1/10th the traffic.
      </Decision></FadeIn>

      <FadeIn delay={300}><Insight tag="Staff+ signal">
        The eval system is a product, not a one-time project. Dedicate 15-20% of your AI engineering bandwidth to eval infrastructure &mdash; improving rubrics, growing the golden dataset, calibrating judges, building dashboards. Teams that treat evals as a checkbox end up with a false sense of security. Teams that treat evals as a living system catch regressions the same day they're introduced.
      </Insight></FadeIn>

      <FadeIn delay={350}><Insight tag="2026 engineering signal">
        The eval gap is becoming THE differentiator. Anyone can get an agent to write code &mdash; cursor tab, Claude Code, Copilot, Codex. Knowing whether that code is correct? Building the test harnesses, rubrics, guardrails, monitoring pipelines that catch silent regressions before users do? That's the scarce skill. In 2026, "I built an eval harness that caught a 12% faithfulness drop on deploy day" beats "I built an agent" every single time. The person who can evaluate AI output is more valuable than the person who can generate it.
      </Insight></FadeIn>
        </div>
  );
}

const styles = {
  back: { fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'var(--font-mono)' },
  eyebrow: { fontSize: 11, fontWeight: 500, color: 'var(--text-accent)', letterSpacing: '0.08em', marginBottom: 8, textTransform: 'uppercase', fontFamily: 'var(--font-mono)' },
  h1: { fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 400, color: 'var(--text-h)', lineHeight: 1.12, marginBottom: 16, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
  subtitle: { fontSize: 15, color: 'var(--text-p)', lineHeight: 1.75, marginBottom: 32 },
  tabWrap: { display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 28, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)', paddingBottom: 12 },
  tabBtn: { fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', background: 'none', border: 'none', padding: '6px 14px', borderRadius: 'var(--radius-full)', cursor: 'pointer', transition: 'all var(--dur) var(--ease)', fontFamily: 'var(--font-body)' },
  tabActive: { color: 'var(--text-accent)', background: 'var(--bg-accent)' },
  sh: { fontSize: 20, fontWeight: 600, color: 'var(--text-h)', marginBottom: 8, fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' },
  ss: { fontSize: 14, color: 'var(--text-p)', lineHeight: 1.7, marginBottom: 20 },
};
