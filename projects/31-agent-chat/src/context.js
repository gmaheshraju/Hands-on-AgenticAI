import config from './config.js';

const { context: cfg, features } = config;

export class ContextManager {
  constructor(db, llm) {
    this.db = db;
    this.llm = llm;
  }

  async buildContext(threadMessages, userMessage, systemPrompt) {
    const messages = [{ role: 'system', content: systemPrompt }];

    if (threadMessages.length <= cfg.maxMessages) {
      for (const m of threadMessages) {
        messages.push({ role: m.role, content: m.content });
      }
      messages.push({ role: 'user', content: userMessage });
      return { messages, summarized: false, originalCount: threadMessages.length };
    }

    const threadId = threadMessages[0]?.thread_id;
    const oldMessages = threadMessages.slice(0, -cfg.summaryThreshold);
    const recentMessages = threadMessages.slice(-cfg.summaryThreshold);

    let summary = threadId ? this.db.getContextSummary(threadId) : null;

    if (!summary || summary.message_count < oldMessages.length) {
      const summaryText = await this._summarize(oldMessages, threadId);
      if (threadId) {
        this.db.saveContextSummary(threadId, summaryText, oldMessages.length);
      }
      summary = { summary: summaryText, message_count: oldMessages.length };
    }

    messages.push({
      role: 'user',
      content: `[Context summary of ${summary.message_count} earlier messages]\n${summary.summary}`,
    });
    messages.push({
      role: 'assistant',
      content: 'I understand the context from our earlier conversation. I\'ll continue from here.',
    });

    for (const m of recentMessages) {
      messages.push({ role: m.role, content: m.content });
    }
    messages.push({ role: 'user', content: userMessage });

    if (features.auditTrail) {
      this.db.addAuditEntry({
        type: 'context_compression',
        threadId,
        detail: JSON.stringify({
          originalMessages: threadMessages.length,
          summarizedCount: oldMessages.length,
          keptRecent: recentMessages.length,
        }),
      });
    }

    return {
      messages,
      summarized: true,
      originalCount: threadMessages.length,
      compressedFrom: oldMessages.length,
    };
  }

  async _summarize(messages, threadId) {
    const conversation = messages.map(m =>
      `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, cfg.messageSliceLength)}`
    ).join('\n\n');

    const prompt = [
      {
        role: 'system',
        content: 'You are a conversation summarizer. Create a concise summary preserving: key facts discussed, decisions made, user preferences expressed, and any unanswered questions. Use bullet points. Be factual, not interpretive.',
      },
      {
        role: 'user',
        content: `Summarize this conversation in under ${cfg.summaryMaxWords} words:\n\n${conversation}`,
      },
    ];

    try {
      const response = await this.llm.chat(prompt, { temperature: cfg.summaryTemperature });

      if (features.auditTrail) {
        this.db.addAuditEntry({
          type: 'context_summary_generated',
          threadId,
          detail: JSON.stringify({
            messagesProcessed: messages.length,
            summaryLength: response.text.length,
            tokensUsed: (response.tokensIn || 0) + (response.tokensOut || 0),
          }),
        });
      }

      return response.text;
    } catch (err) {
      return messages.map(m =>
        `- ${m.role}: ${m.content.slice(0, 100)}`
      ).join('\n');
    }
  }
}
