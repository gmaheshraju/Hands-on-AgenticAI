export async function generatePatch({ currentPrompt, postmortem, evaluation, llm }) {
  const findingsText = postmortem.findings
    .slice(0, 5)
    .map(f => `- [${f.severity}] ${f.type}: ${f.description}\n  Suggested: ${f.suggestedFix}`)
    .join('\n');

  const scoresText = Object.entries(evaluation.scores)
    .map(([k, v]) => `${k}: ${v.toFixed(2)}`)
    .join(', ');

  const response = await llm.chat([
    {
      role: 'system',
      content: `You are a prompt engineer improving an AI research agent's system prompt.
Analyze the agent's performance and generate ONE concrete improvement.

Rules:
- Make ONE specific change, not multiple
- The change should directly address the most impactful finding
- Be specific and actionable — give exact text to add
- Target the lowest-scoring dimension

Respond with ONLY a JSON object:
{
  "section": "which part of the prompt this affects (e.g., 'Process', 'Tools', 'new section')",
  "action": "add",
  "content": "the exact text to add to the prompt",
  "reasoning": "why this change should help",
  "targetDimension": "which score this targets"
}`,
    },
    {
      role: 'user',
      content: `Current system prompt:
---
${currentPrompt}
---

Performance scores: ${scoresText}
Composite: ${evaluation.composite}
Weakest primitive: ${postmortem.weakestPrimitive}

Postmortem findings:
${findingsText}

Generate ONE improvement to the system prompt.`,
    },
  ], { temperature: 0.3, jsonMode: true });

  if (!response.parsed) {
    return getFallbackPatch(postmortem);
  }

  return {
    patch: {
      section: response.parsed.section || 'Process',
      action: response.parsed.action || 'add',
      content: response.parsed.content || '',
    },
    reasoning: response.parsed.reasoning || 'LLM-generated improvement',
    targetDimension: response.parsed.targetDimension || 'completeness',
  };
}

function getFallbackPatch(postmortem) {
  const topFinding = postmortem.findings[0];
  if (!topFinding) {
    return {
      patch: { section: 'Process', action: 'add', content: '\n## Quality\nAlways consult at least 3 sources and gather 8+ facts before synthesizing.' },
      reasoning: 'No specific findings — adding general quality guidance.',
      targetDimension: 'completeness',
    };
  }

  return {
    patch: { section: 'Process', action: 'add', content: `\n## Improvement\n${topFinding.suggestedFix}` },
    reasoning: `Addressing top finding: ${topFinding.type}`,
    targetDimension: 'completeness',
  };
}

export function applyPatch(prompt, patch) {
  if (patch.action === 'add') {
    return prompt.trimEnd() + '\n\n' + patch.content.trim() + '\n';
  }

  if (patch.action === 'replace' && patch.section) {
    const sectionPattern = new RegExp(`(## ${patch.section}[\\s\\S]*?)(?=\\n## |$)`);
    const match = prompt.match(sectionPattern);
    if (match) {
      return prompt.replace(match[0], patch.content.trim());
    }
    return prompt.trimEnd() + '\n\n' + patch.content.trim() + '\n';
  }

  if (patch.action === 'remove' && patch.section) {
    const sectionPattern = new RegExp(`\\n?## ${patch.section}[\\s\\S]*?(?=\\n## |$)`);
    return prompt.replace(sectionPattern, '');
  }

  return prompt.trimEnd() + '\n\n' + patch.content.trim() + '\n';
}
