import { executeTool } from './tools.js';

export class ResearchAgent {
  constructor({ question, llm, memory, scratchpad, systemPrompt }) {
    this.question = question;
    this.llm = llm;
    this.memory = memory;
    this.scratchpad = scratchpad;
    this.systemPrompt = systemPrompt;
    this.messages = [];
    this.facts = [];
    this.sourcesConsulted = new Set();
    this._finalReport = null;
    this._toolHistory = [];
    this._lastSearchTitles = [];
  }

  async step(iteration) {
    const context = this._buildContext(iteration);

    if (this.messages.length === 0) {
      this.messages.push({ role: 'user', content: context });
    } else {
      this.messages.push({ role: 'user', content: context });
    }

    // Keep only last 8 messages to avoid context bloat on small models
    const recentMessages = this.messages.slice(-8);
    const response = await this.llm.chat(
      [{ role: 'system', content: this.systemPrompt }, ...recentMessages],
      { temperature: 0.3, jsonMode: true }
    );

    const parsed = response.parsed || this._extractAction(response.text);
    this.messages.push({ role: 'assistant', content: response.text });

    if (!parsed || !parsed.action) {
      return {
        thought: parsed?.thought || response.text.slice(0, 200),
        tool: null,
        toolInput: null,
        toolResult: null,
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
        newFactsAdded: 0,
        done: false,
      };
    }

    const toolName = parsed.action;
    const toolInput = parsed.input || {};
    const toolKey = `${toolName}:${JSON.stringify(toolInput)}`;

    if (this._toolHistory.includes(toolKey)) {
      this.messages.push({
        role: 'user',
        content: `You already called ${toolName} with these exact inputs. Try a different search or tool.`,
      });
      return {
        thought: parsed.thought || '',
        tool: toolName,
        toolInput,
        toolResult: '[DUPLICATE — skipped]',
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
        newFactsAdded: 0,
        done: false,
      };
    }
    this._toolHistory.push(toolKey);

    const ctx = { scratchpad: this.scratchpad };
    const toolResult = await executeTool(toolName, toolInput, ctx);

    if (toolName === 'wikipedia_article' && !toolResult.metadata?.error) {
      this.sourcesConsulted.add(toolInput.title);
    }

    let newFactsAdded = 0;
    if (toolName === 'wikipedia_article' && !toolResult.metadata?.error) {
      const extracted = this._extractFacts(toolResult.result, toolInput.title);
      newFactsAdded = extracted.length;
      this.facts.push(...extracted);
    } else if (toolName === 'wikipedia_search' && !toolResult.metadata?.error) {
      this._lastSearchTitles = toolResult.metadata?.titles || [];
      newFactsAdded = 1; // search progress counts to avoid false convergence
    }

    const isDone = toolName === 'synthesize';
    if (isDone) {
      this._finalReport = toolInput.answer || toolResult.result;
    }

    // Build the tool result message with strong guidance for small models
    let resultMessage = `Tool result from ${toolName}:\n${toolResult.result.slice(0, 1500)}`;

    if (toolName === 'wikipedia_search' && this._lastSearchTitles.length > 0) {
      const unread = this._lastSearchTitles.filter(t => !this.sourcesConsulted.has(t));
      if (unread.length > 0) {
        resultMessage += `\n\nNOW you MUST read an article. Use wikipedia_article with title "${unread[0]}". Respond with: {"thought": "Reading ${unread[0]}", "action": "wikipedia_article", "input": {"title": "${unread[0]}"}}`;
      }
    }

    if (this.facts.length >= 8 && toolName !== 'synthesize') {
      resultMessage += `\n\nYou have ${this.facts.length} facts. Time to synthesize! Use: {"thought": "I have enough facts", "action": "synthesize", "input": {"answer": "YOUR COMPLETE ANSWER HERE"}}`;
    }

    this.messages.push({ role: 'user', content: resultMessage });

    return {
      thought: parsed.thought || '',
      tool: toolName,
      toolInput,
      toolResult: toolResult.result,
      tokensIn: response.tokensIn,
      tokensOut: response.tokensOut,
      newFactsAdded,
      done: isDone,
    };
  }

  _buildContext(iteration) {
    const parts = [];

    if (iteration === 1) {
      parts.push(`Research question: ${this.question}`);

      const priorFacts = this.memory ? this.memory.searchFacts(this.question) : [];
      if (priorFacts.length > 0) {
        parts.push('\nRelevant facts from prior research sessions:');
        for (const f of priorFacts.slice(0, 5)) {
          parts.push(`  - ${f.subject} ${f.predicate} ${f.object} (confidence: ${f.confidence.toFixed(2)})`);
        }
      }
    } else {
      parts.push(`Iteration ${iteration}. Continue researching: ${this.question}`);
    }

    if (this.facts.length > 0) {
      parts.push(`\nFacts gathered so far (${this.facts.length}):`);
      for (const f of this.facts.slice(-10)) {
        parts.push(`  - ${f}`);
      }
    }

    parts.push(`\nSources consulted: ${[...this.sourcesConsulted].join(', ') || 'none yet'}`);

    const padIndex = this.scratchpad.formatIndex();
    if (!padIndex.includes('empty')) {
      parts.push('\n' + padIndex);
    }

    parts.push('\nWhat tool should you use next? Respond with JSON: { "thought": "...", "action": "tool_name", "input": { ... } }');

    return parts.join('\n');
  }

  _extractFacts(text, source) {
    const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 20);
    return sentences.slice(0, 5).map(s => `[${source}] ${s}`);
  }

  _extractAction(text) {
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    } catch { /* fall through */ }

    const thoughtMatch = text.match(/thought["\s:]+([^"]+)/i);
    const actionMatch = text.match(/action["\s:]+([a-z_]+)/i);
    if (actionMatch) {
      return {
        thought: thoughtMatch?.[1] || '',
        action: actionMatch[1],
        input: {},
      };
    }
    return { thought: text.slice(0, 200), action: null, input: {} };
  }

  get finalReport() { return this._finalReport; }
  get trace() { return this._toolHistory; }
  get factCount() { return this.facts.length; }
  get sourceCount() { return this.sourcesConsulted.size; }
}
