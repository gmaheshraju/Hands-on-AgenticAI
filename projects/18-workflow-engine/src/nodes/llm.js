/**
 * LLM call node — calls an LLM with a prompt template + input data.
 *
 * In demo mode, simulates an LLM response. In production, replace
 * the `callLLM` function with an actual API call.
 */

/**
 * Interpolate {{variable}} placeholders in a template string.
 */
function interpolate(template, data) {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) => {
    const value = path.split('.').reduce((obj, key) => obj?.[key], data);
    return value !== undefined ? String(value) : `{{${path}}}`;
  });
}

/**
 * Simulated LLM call. Replace with real API call in production.
 */
async function simulateLLM(prompt, model, temperature) {
  // Simulate latency
  await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));

  // Generate contextual mock responses based on prompt content
  const promptLower = prompt.toLowerCase();

  if (promptLower.includes('research') || promptLower.includes('gather')) {
    return {
      text: 'Research findings: The topic shows significant growth trends. Key data points include a 40% year-over-year increase in adoption, three major industry players, and emerging regulatory considerations. Sources verified across multiple databases.',
      model,
      tokensUsed: 89,
    };
  }
  if (promptLower.includes('write') || promptLower.includes('draft') || promptLower.includes('article')) {
    return {
      text: 'Draft article: "The Future of Technology" — Technology continues to reshape industries at an unprecedented pace. This comprehensive analysis examines current trends, expert predictions, and actionable insights for stakeholders navigating the evolving landscape.',
      model,
      tokensUsed: 156,
    };
  }
  if (promptLower.includes('review') || promptLower.includes('edit')) {
    return {
      text: 'Review complete. Content quality: 8/10. Suggestions: strengthen the opening hook, add 2 supporting statistics in paragraph 3, and tighten the conclusion. No factual errors detected.',
      model,
      tokensUsed: 67,
    };
  }
  if (promptLower.includes('classify') || promptLower.includes('severity')) {
    return {
      text: 'Classification: HIGH severity. Indicators: service degradation affecting >10% of users, error rate spike of 5x baseline, no redundancy path available.',
      severity: 'HIGH',
      model,
      tokensUsed: 45,
    };
  }
  if (promptLower.includes('welcome') || promptLower.includes('email')) {
    return {
      text: 'Welcome email drafted: Subject: "Welcome aboard!" — Dear valued customer, we are thrilled to have you join us. Your account is fully activated and ready to use.',
      model,
      tokensUsed: 52,
    };
  }

  return {
    text: `LLM response for prompt: "${prompt.slice(0, 80)}..."`,
    model,
    tokensUsed: 30,
  };
}

/**
 * Execute an LLM node.
 *
 * Config:
 *   - prompt: string with {{variable}} placeholders
 *   - model: string (default "gpt-4")
 *   - temperature: number (default 0.7)
 *   - outputKey: key name for result in output (default "llmResponse")
 */
export async function executeLLMNode(config, input) {
  const {
    prompt,
    model = 'gpt-4',
    temperature = 0.7,
    outputKey = 'llmResponse',
  } = config;

  if (!prompt) throw new Error('LLM node requires a "prompt" in config');

  const resolvedPrompt = interpolate(prompt, input);
  const result = await simulateLLM(resolvedPrompt, model, temperature);

  return {
    ...input,
    [outputKey]: result.text,
    _llmMeta: {
      model: result.model,
      tokensUsed: result.tokensUsed,
      temperature,
      promptLength: resolvedPrompt.length,
    },
    ...(result.severity ? { severity: result.severity } : {}),
  };
}
