import config from './config.js';

const { llm: llmCfg } = config;

export class LLMAdapter {
  constructor(opts = {}) {
    this.providers = opts.providers || llmCfg.defaultProviders;
    this.ollamaBaseUrl = opts.ollamaBaseUrl || llmCfg.ollama.baseUrl;
    this.ollamaModel = opts.ollamaModel || llmCfg.ollama.model;
    this.nvidiaApiKey = opts.nvidiaApiKey || process.env.NVIDIA_API_KEY;
    this.nvidiaModel = opts.nvidiaModel || llmCfg.nvidia.model;
    this.geminiApiKey = opts.geminiApiKey || process.env.GEMINI_API_KEY;
    this.geminiModel = opts.geminiModel || llmCfg.gemini.model;
    this.verbose = opts.verbose ?? false;
    this._lastRequestTime = 0;
  }

  async chat(messages, opts = {}) {
    const errors = [];

    for (const provider of this.providers) {
      try {
        await this._rateLimit();
        const start = Date.now();
        let result;

        switch (provider) {
          case 'ollama':
            result = await this._chatOllama(messages, opts);
            break;
          case 'nvidia':
            if (!this.nvidiaApiKey) throw new Error('NVIDIA_API_KEY not set');
            result = await this._chatNvidia(messages, opts);
            break;
          case 'gemini':
            if (!this.geminiApiKey) throw new Error('GEMINI_API_KEY not set');
            result = await this._chatGemini(messages, opts);
            break;
          default:
            throw new Error(`Unknown provider: ${provider}`);
        }

        result.provider = provider;
        result.latencyMs = Date.now() - start;

        if (opts.jsonMode) {
          result.parsed = this._tryParseJSON(result.text);
          if (!result.parsed) {
            const retry = await this._retryJSON(provider, messages, result.text, opts);
            if (retry) {
              result.text = retry.text;
              result.parsed = retry.parsed;
              result.tokensIn += retry.tokensIn;
              result.tokensOut += retry.tokensOut;
            }
          }
        }

        if (this.verbose) {
          console.log(`  [llm] ${provider}/${result.model} ${result.latencyMs}ms ${result.tokensIn}in/${result.tokensOut}out`);
        }

        return result;
      } catch (err) {
        errors.push({ provider, error: err.message });
        if (this.verbose) console.log(`  [llm] ${provider} failed: ${err.message}`);
      }
    }

    throw new Error(`All LLM providers failed:\n${errors.map(e => `  ${e.provider}: ${e.error}`).join('\n')}`);
  }

  // ── Streaming ────────────────────────────────────────────────────

  async *chatStream(messages, opts = {}) {
    const errors = [];

    for (const provider of this.providers) {
      try {
        await this._rateLimit();
        switch (provider) {
          case 'ollama':
            yield* this._streamOllama(messages, opts);
            return;
          case 'nvidia':
            if (!this.nvidiaApiKey) throw new Error('NVIDIA_API_KEY not set');
            yield* this._streamNvidia(messages, opts);
            return;
          case 'gemini':
            if (!this.geminiApiKey) throw new Error('GEMINI_API_KEY not set');
            yield* this._streamGemini(messages, opts);
            return;
        }
      } catch (err) {
        errors.push({ provider, error: err.message });
        if (this.verbose) console.log(`  [llm-stream] ${provider} failed: ${err.message}`);
      }
    }

    throw new Error(`All streaming providers failed:\n${errors.map(e => `  ${e.provider}: ${e.error}`).join('\n')}`);
  }

  async *_streamOllama(messages, opts) {
    const body = { model: this.ollamaModel, messages, stream: true };
    if (opts.temperature !== undefined) body.options = { temperature: opts.temperature };

    const res = await fetch(`${this.ollamaBaseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);

    for await (const line of readLines(res.body)) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        if (data.message?.content) {
          yield { token: data.message.content, done: !!data.done };
        }
        if (data.done) return;
      } catch { /* skip malformed lines */ }
    }
  }

  async *_streamNvidia(messages, opts) {
    const body = {
      model: this.nvidiaModel,
      messages,
      max_tokens: opts.maxTokens || 2048,
      stream: true,
    };
    if (opts.temperature !== undefined) body.temperature = opts.temperature;

    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.nvidiaApiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) throw new Error(`NVIDIA ${res.status}: ${await res.text()}`);

    for await (const line of readLines(res.body)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const payload = trimmed.slice(6);
      if (payload === '[DONE]') return;
      try {
        const data = JSON.parse(payload);
        const token = data.choices?.[0]?.delta?.content;
        if (token) yield { token, done: false };
      } catch { /* skip */ }
    }
    yield { token: '', done: true };
  }

  async *_streamGemini(messages, opts) {
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const systemInstruction = messages.find(m => m.role === 'system');
    const body = { contents };
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction.content }] };
    }
    if (opts.temperature !== undefined) {
      body.generationConfig = { temperature: opts.temperature };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:streamGenerateContent?alt=sse&key=${this.geminiApiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);

    for await (const line of readLines(res.body)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(trimmed.slice(6));
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) yield { token: text, done: false };
      } catch { /* skip */ }
    }
    yield { token: '', done: true };
  }

  // ── Non-streaming providers ──────────────────────────────────────

  async _chatOllama(messages, opts) {
    const body = { model: this.ollamaModel, messages, stream: false };
    if (opts.temperature !== undefined) body.options = { temperature: opts.temperature };

    const res = await fetch(`${this.ollamaBaseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return {
      text: data.message?.content || '',
      tokensIn: data.prompt_eval_count || 0,
      tokensOut: data.eval_count || 0,
      model: this.ollamaModel,
    };
  }

  async _chatNvidia(messages, opts) {
    const body = {
      model: this.nvidiaModel,
      messages,
      max_tokens: opts.maxTokens || 2048,
      stream: false,
    };
    if (opts.temperature !== undefined) body.temperature = opts.temperature;

    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.nvidiaApiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });

    if (res.status === 429) {
      await new Promise(r => setTimeout(r, 2000));
      throw new Error('Rate limited (429)');
    }
    if (!res.ok) throw new Error(`NVIDIA ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return {
      text: data.choices?.[0]?.message?.content || '',
      tokensIn: data.usage?.prompt_tokens || 0,
      tokensOut: data.usage?.completion_tokens || 0,
      model: this.nvidiaModel,
    };
  }

  async _chatGemini(messages, opts) {
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const systemInstruction = messages.find(m => m.role === 'system');
    const body = { contents };
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction.content }] };
    }
    if (opts.temperature !== undefined) {
      body.generationConfig = { temperature: opts.temperature };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent?key=${this.geminiApiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });

    if (res.status === 429) {
      await new Promise(r => setTimeout(r, 4000));
      throw new Error('Rate limited (429)');
    }
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return {
      text: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
      tokensIn: data.usageMetadata?.promptTokenCount || 0,
      tokensOut: data.usageMetadata?.candidatesTokenCount || 0,
      model: this.geminiModel,
    };
  }

  // ── Health check ─────────────────────────────────────────────────

  async healthCheck() {
    const results = {};
    for (const provider of ['ollama', 'nvidia', 'gemini']) {
      try {
        switch (provider) {
          case 'ollama': {
            const res = await fetch(`${this.ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
            results.ollama = res.ok;
            break;
          }
          case 'nvidia':
            results.nvidia = !!this.nvidiaApiKey;
            break;
          case 'gemini':
            results.gemini = !!this.geminiApiKey;
            break;
        }
      } catch {
        results[provider] = false;
      }
    }
    return results;
  }

  // ── Helpers ──────────────────────────────────────────────────────

  _tryParseJSON(text) {
    const cleaned = text.replace(/^```(?:json)?\n?/g, '').replace(/\n?```$/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try { return JSON.parse(match[0]); } catch { /* fall through */ }
      }
      return null;
    }
  }

  async _retryJSON(provider, originalMessages, badResponse, opts) {
    const retryMessages = [
      ...originalMessages,
      { role: 'assistant', content: badResponse },
      { role: 'user', content: 'Your response was not valid JSON. Please respond with ONLY a valid JSON object, no markdown, no explanation.' },
    ];

    try {
      let result;
      switch (provider) {
        case 'ollama': result = await this._chatOllama(retryMessages, opts); break;
        case 'nvidia': result = await this._chatNvidia(retryMessages, opts); break;
        case 'gemini': result = await this._chatGemini(retryMessages, opts); break;
      }
      const parsed = this._tryParseJSON(result.text);
      if (parsed) return { ...result, parsed };
    } catch { /* fall through */ }
    return null;
  }

  async _rateLimit() {
    const elapsed = Date.now() - this._lastRequestTime;
    const minGap = 500;
    if (elapsed < minGap) {
      await new Promise(r => setTimeout(r, minGap - elapsed));
    }
    this._lastRequestTime = Date.now();
  }
}

async function* readLines(body) {
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.trim()) yield line;
    }
  }

  if (buffer.trim()) yield buffer;
}
