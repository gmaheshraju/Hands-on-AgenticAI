export async function evaluate({ question, answer, traceEntries, llm }) {
  if (!answer) {
    return {
      scores: { factCount: 0, sourceDiversity: 0, coherence: 0, completeness: 0 },
      composite: 0,
      details: { error: 'No answer produced' },
    };
  }

  const factCount = scoreFactCount(answer);
  const sourceDiversity = scoreSourceDiversity(traceEntries);
  const coherence = await scoreCoherence(answer, llm);
  const completeness = await scoreCompleteness(question, answer, llm);

  const composite = 0.25 * factCount + 0.20 * sourceDiversity + 0.25 * coherence + 0.30 * completeness;

  return {
    scores: { factCount, sourceDiversity, coherence, completeness },
    composite: Math.round(composite * 100) / 100,
    details: { factCountRaw: countFacts(answer), sourcesRaw: countSources(traceEntries) },
  };
}

function countFacts(text) {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 15);
  return sentences.filter(s => {
    return /\d/.test(s) || /[A-Z][a-z]+\s[A-Z]/.test(s) || s.length > 40;
  }).length;
}

function scoreFactCount(text) {
  const count = countFacts(text);
  return Math.min(1.0, count / 10);
}

function countSources(traceEntries) {
  const sources = new Set();
  for (const entry of traceEntries) {
    if (entry.tool === 'wikipedia_article' && entry.toolInput?.title) {
      sources.add(entry.toolInput.title);
    }
  }
  return sources.size;
}

function scoreSourceDiversity(traceEntries) {
  const count = countSources(traceEntries);
  if (count === 0) return 0;
  if (count === 1) return 0.2;
  return Math.min(1.0, count / 5);
}

async function scoreCoherence(answer, llm) {
  if (!llm) return 0.5;
  try {
    const response = await llm.chat([
      {
        role: 'system',
        content: 'You are an essay grader. Rate the logical flow, structure, and readability of the given text. Respond with ONLY a JSON object: { "score": N, "reason": "..." } where N is 0-10.',
      },
      { role: 'user', content: `Rate this text:\n\n${answer.slice(0, 2000)}` },
    ], { temperature: 0.1, jsonMode: true });

    const score = response.parsed?.score;
    if (typeof score === 'number' && score >= 0 && score <= 10) {
      return score / 10;
    }
  } catch { /* fall through */ }
  return 0.5;
}

async function scoreCompleteness(question, answer, llm) {
  if (!llm) return 0.5;
  try {
    const response = await llm.chat([
      {
        role: 'system',
        content: 'You evaluate whether an answer fully addresses a question. Rate coverage from 0-10. Respond with ONLY a JSON object: { "score": N, "missing": ["aspect1", "aspect2"] }',
      },
      { role: 'user', content: `Question: ${question}\n\nAnswer:\n${answer.slice(0, 2000)}` },
    ], { temperature: 0.1, jsonMode: true });

    const score = response.parsed?.score;
    if (typeof score === 'number' && score >= 0 && score <= 10) {
      return score / 10;
    }
  } catch { /* fall through */ }
  return 0.5;
}
