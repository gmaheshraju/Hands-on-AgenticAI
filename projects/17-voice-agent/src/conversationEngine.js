/**
 * ConversationEngine — manages multi-turn conversation context and generates responses.
 *
 * Uses a simple rule-based responder for demo mode.
 * Structured for easy swap to an LLM API (OpenAI, Anthropic, etc.).
 */

export class ConversationEngine {
  constructor() {
    /** Full conversation history: [{ role: 'user'|'assistant', content, timestamp }] */
    this.history = [];
    /** Max turns to keep in context window */
    this.maxContextTurns = 20;
  }

  /** Add a user utterance and generate a response */
  async processUserInput(transcript) {
    const userTurn = {
      role: 'user',
      content: transcript,
      timestamp: Date.now(),
    };
    this.history.push(userTurn);

    // Generate response
    const responseText = await this._generateResponse(transcript);

    const assistantTurn = {
      role: 'assistant',
      content: responseText,
      timestamp: Date.now(),
    };
    this.history.push(assistantTurn);

    // Trim history if it gets too long
    if (this.history.length > this.maxContextTurns * 2) {
      this.history = this.history.slice(-this.maxContextTurns * 2);
    }

    return {
      text: responseText,
      turnIndex: Math.floor(this.history.length / 2),
    };
  }

  /** Handle an interruption — note it in history */
  handleInterruption(partialResponse) {
    // Mark the last assistant turn as interrupted
    if (this.history.length > 0) {
      const last = this.history[this.history.length - 1];
      if (last.role === 'assistant') {
        last.interrupted = true;
        last.content = partialResponse || last.content;
      }
    }
  }

  /** Get conversation summary for the client */
  getHistory() {
    return this.history.map(t => ({
      role: t.role,
      content: t.content,
      interrupted: t.interrupted || false,
      timestamp: t.timestamp,
    }));
  }

  /** Reset conversation */
  reset() {
    this.history = [];
  }

  /* ── Response generation ────────────────────────────────── */

  async _generateResponse(input) {
    // Simulate processing latency
    await delay(150 + Math.random() * 250);

    const lower = input.toLowerCase().trim();

    // Pattern-matched responses for demo
    if (lower.match(/\bhello\b|\bhi\b|\bhey\b/)) {
      return "Hello! I'm your voice assistant. How can I help you today?";
    }
    if (lower.match(/\bweather\b/)) {
      return "I'd check the weather for you, but I'm running in demo mode. It's always sunny in simulation land!";
    }
    if (lower.match(/\btime\b/)) {
      const now = new Date().toLocaleTimeString();
      return `The current time is ${now}.`;
    }
    if (lower.match(/\bjoke\b/)) {
      const jokes = [
        "Why do programmers prefer dark mode? Because light attracts bugs.",
        "There are only 10 types of people in the world: those who understand binary and those who don't.",
        "A SQL query walks into a bar, sees two tables, and asks: Can I join you?",
      ];
      return jokes[Math.floor(Math.random() * jokes.length)];
    }
    if (lower.match(/\binterrupt\b/)) {
      return "Interruption handling is a key feature of real-time voice agents. When you speak while I'm talking, " +
        "my TTS playback stops immediately, your new input is processed, and the conversation continues naturally. " +
        "The state machine transitions from SPEAKING to INTERRUPTED to LISTENING in rapid succession.";
    }
    if (lower.match(/\bhelp\b|\bwhat can you\b/)) {
      return "I can demonstrate real-time voice interaction with interruption handling. " +
        "Try saying hello, ask about the weather or time, request a joke, or ask about interruptions. " +
        "You can also interrupt me mid-sentence to test the interruption state machine!";
    }
    if (lower.match(/\bstate\b.*\bmachine\b|\bstates?\b/)) {
      return "The turn-taking state machine has five states: IDLE, LISTENING, PROCESSING, SPEAKING, and INTERRUPTED. " +
        "The critical transition is SPEAKING to INTERRUPTED — triggered by voice activity detection while the agent is speaking. " +
        "This immediately cancels TTS playback and re-enters LISTENING to capture the user's new input.";
    }
    if (lower.match(/\bbye\b|\bgoodbye\b|\bend\b/)) {
      return "Goodbye! It was nice talking to you. The conversation has ended.";
    }

    // Default: echo back with a conversational wrapper
    return `I heard you say: "${input}". In a production system, this would be processed by an LLM ` +
      `like Claude or GPT to generate a contextual response based on our ${Math.floor(this.history.length / 2)} turns of conversation.`;
  }
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}
