const config = {
  // ── Feature Flags ─────────────────────────────────────────────
  features: {
    guardrails: true,
    contextCompression: true,
    toolIntelligence: true,
    auditTrail: true,
    factExtraction: true,
    interruptResume: true,
    tracing: true,
  },

  // ── Agent ─────────────────────────────────────────────────────
  agent: {
    maxToolRounds: 8,
    reasoningTemperature: 0.3,
    answerTemperature: 0.7,
    toolResultMaxLength: 500,
    toolResultContextLength: 1500,
    factSliceLength: 200,
    maxFacts: 5,
    maxLessons: 3,
    forceRespondAfterRounds: 3,
    systemPrompt: `You are a helpful research assistant with access to tools. You can search Wikipedia, read articles, and do calculations.

## How to respond
When you need to use a tool, respond with ONLY a JSON object:
{"thought": "why I'm doing this", "action": "tool_name", "input": {"param": "value"}}

When you have enough information to answer the user's question directly (or the question doesn't need tools), respond with:
{"thought": "I can answer this now", "action": "respond"}

## Rules
- Use wikipedia_search to find articles, then wikipedia_article to read them
- After reading articles, answer the question
- For simple questions (greetings, math, opinions), just respond — no tools needed
- Always be helpful, concise, and accurate`,
  },

  // ── Context Window ────────────────────────────────────────────
  context: {
    maxMessages: 12,
    summaryThreshold: 8,
    summaryMaxWords: 200,
    summaryTemperature: 0.3,
    messageSliceLength: 300,
  },

  // ── Guardrails ────────────────────────────────────────────────
  guardrails: {
    injectionPatterns: [
      /ignore\s+(all\s+)?previous\s+(instructions|prompts|rules)/i,
      /disregard\s+(all\s+)?previous/i,
      /forget\s+(all\s+)?(your|previous)\s+(instructions|rules)/i,
      /you\s+are\s+now\s+(a|an|the)\s+/i,
      /new\s+system\s+prompt/i,
      /override\s+(system|safety|your)\s+(prompt|instructions|rules)/i,
      /pretend\s+(you\s+are|to\s+be|you're)/i,
      /act\s+as\s+(if\s+)?(you\s+are|a|an)/i,
      /jailbreak/i,
      /DAN\s+(mode|prompt)/i,
      /do\s+anything\s+now/i,
      /\[\s*system\s*\]/i,
      /\<\s*system\s*\>/i,
      /\|\s*SYSTEM\s*\|/i,
      /reveal\s+(your|the)\s+(system\s+)?prompt/i,
      /what\s+(is|are)\s+your\s+(system\s+)?(instructions|prompt|rules)/i,
    ],
    piiPatterns: [
      { type: 'credit_card', pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/, mask: '[CARD_REDACTED]' },
      { type: 'ssn', pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/, mask: '[SSN_REDACTED]' },
      { type: 'email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, mask: '[EMAIL_REDACTED]' },
      { type: 'phone', pattern: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g, mask: '[PHONE_REDACTED]' },
      { type: 'api_key', pattern: /\b(?:sk|pk|api|key|token|secret)[-_][a-zA-Z0-9]{20,}\b/gi, mask: '[KEY_REDACTED]' },
    ],
    outputBlockPatterns: [
      /as\s+an?\s+ai\s+(?:language\s+)?model,?\s+i\s+(?:cannot|can't|don't|shouldn't)/i,
      /i'?m\s+(?:just\s+)?an?\s+ai/i,
    ],
    auditLookbackLimit: 100,
  },

  // ── LLM Providers ─────────────────────────────────────────────
  llm: {
    defaultProviders: ['nvidia', 'ollama', 'gemini'],
    ollama: {
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2:3b',
    },
    nvidia: {
      model: 'meta/llama-3.3-70b-instruct',
    },
    gemini: {
      model: 'gemini-2.0-flash',
    },
  },

  // ── Server ────────────────────────────────────────────────────
  server: {
    port: 3001,
    defaultProvider: 'ollama',
    streamBufferTtlMs: 60_000,
  },

  // ── Database ──────────────────────────────────────────────────
  db: {
    path: './data/chat.db',
    defaultThreadLimit: 50,
    defaultAuditLimit: 50,
  },
};

export default Object.freeze(config);
