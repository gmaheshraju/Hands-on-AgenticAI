import { getToolDescriptions, executeTool } from './tools.js';
import { Guardrails } from './guardrails.js';
import { ContextManager } from './context.js';
import { AgentObserver } from './tracer.js';
import config from './config.js';

const { agent: agentCfg, features } = config;

export async function* runAgent(userMessage, threadMessages, opts) {
  const { llm, db, threadId, parentMsgId, abortSignal } = opts;

  const guardrails = features.guardrails ? new Guardrails(db) : null;
  const contextMgr = features.contextCompression ? new ContextManager(db, llm) : null;
  const observer = features.tracing ? new AgentObserver(db) : null;
  const run = observer?.startRun(threadId, userMessage);

  const inputScan = guardrails
    ? guardrails.scanInput(userMessage, threadId)
    : { allowed: true, flags: [], redactedText: userMessage };

  if (guardrails) {
    yield { event: 'guardrail', data: { type: 'input', flags: inputScan.flags, allowed: inputScan.allowed } };
  }

  if (!inputScan.allowed) {
    const blockedMsg = db.addMessage(threadId, 'user', userMessage, { parentId: parentMsgId });
    yield { event: 'user_saved', data: { messageId: blockedMsg.id } };

    const blockResponse = `I can't process that request. ${inputScan.reason}`;
    const blockMsg = db.addMessage(threadId, 'assistant', blockResponse, {
      parentId: blockedMsg.id,
      harnessMeta: JSON.stringify({ blocked: true, reason: inputScan.reason }),
    });
    yield { event: 'token', data: { text: blockResponse } };
    yield { event: 'done', data: { messageId: blockMsg.id, parentId: blockedMsg.id, harness: { blocked: true, reason: inputScan.reason } } };
    run?.end('', { totalTokensIn: 0, totalTokensOut: 0, provider: null, outcome: 'blocked' });
    return;
  }

  const safeMessage = inputScan.redactedText;
  const piiRedacted = safeMessage !== userMessage;

  const userMsg = db.addMessage(threadId, 'user', userMessage, { parentId: parentMsgId });
  yield { event: 'user_saved', data: { messageId: userMsg.id } };

  // threadMessages already contains the conversation history
  // ContextManager handles summarization and windowing

  if (features.auditTrail) {
    db.addAuditEntry({
      type: 'llm_request',
      threadId,
      detail: JSON.stringify({
        messageId: userMsg.id,
        inputLength: userMessage.length,
        piiRedacted,
        threadMessageCount: threadMessages.length,
      }),
    });
  }

  let systemPrompt = agentCfg.systemPrompt + '\n\n## Tools\n' + getToolDescriptions();

  if (features.factExtraction) {
    const relevantFacts = db.searchFacts(userMessage);
    if (relevantFacts.length > 0) {
      systemPrompt += '\n## Known facts from prior conversations\n';
      for (const f of relevantFacts.slice(0, agentCfg.maxFacts)) {
        systemPrompt += `- ${f.subject} ${f.predicate} ${f.object}\n`;
      }
    }
  }

  const lessons = features.toolIntelligence ? db.getRelevantLessons(userMessage, agentCfg.maxLessons) : [];
  if (lessons.length > 0) {
    systemPrompt += '\n## Learned tool patterns (from prior usage)\n';
    for (const l of lessons) {
      const verdict = l.was_useful ? 'useful' : 'not helpful';
      systemPrompt += `- ${l.tool_name} for "${l.query_pattern}" was ${verdict} (${l.latency_ms}ms)${l.context ? ` — ${l.context}` : ''}\n`;
    }
  }

  let interrupted = null;
  if (features.interruptResume) {
    interrupted = db.getInterruptedContext(threadId);
    if (interrupted) {
      systemPrompt += '\n## Resumed context (user stopped previous generation)\n';
      if (interrupted.partial_answer) {
        systemPrompt += `Previous partial answer: "${interrupted.partial_answer.slice(0, 300)}..."\n`;
        systemPrompt += 'Continue from where you left off. Do NOT repeat what was already said.\n';
      }
      if (interrupted.tool_calls) {
        systemPrompt += `Tools already called: ${interrupted.tool_calls}\n`;
      }
      db.clearInterruptedContext(threadId);
    }
  }

  let messages, contextSummarized, contextResult;
  if (contextMgr) {
    contextResult = await contextMgr.buildContext(threadMessages, safeMessage, systemPrompt);
    messages = contextResult.messages;
    contextSummarized = contextResult.summarized;
  } else {
    messages = [{ role: 'system', content: systemPrompt }];
    for (const m of threadMessages) messages.push({ role: m.role, content: m.content });
    messages.push({ role: 'user', content: safeMessage });
    contextSummarized = false;
  }

  if (contextSummarized) {
    yield { event: 'context_compressed', data: {
      originalCount: contextResult.originalCount,
      compressedFrom: contextResult.compressedFrom,
    }};
  }

  const allReasoning = [];
  const allToolCalls = [];
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let provider = null;
  const startTime = Date.now();

  for (let i = 0; i < agentCfg.maxToolRounds; i++) {
    if (abortSignal?.()) {
      saveInterrupted(db, threadId, userMessage, allReasoning, allToolCalls, '', messages);
      return;
    }

    const reasonStart = Date.now();
    let response;
    try {
      response = await llm.chat(messages, { jsonMode: true, temperature: agentCfg.reasoningTemperature });
      totalTokensIn += response.tokensIn || 0;
      totalTokensOut += response.tokensOut || 0;
      provider = response.provider;
    } catch (err) {
      run?.end('', { totalTokensIn, totalTokensOut, provider, outcome: 'error' });
      yield { event: 'error', data: { code: 'llm_error', message: err.message } };
      return;
    }

    const parsed = response.parsed || extractAction(response.text);
    const decisionHandle = run?.recordDecision({
      thought: parsed?.thought || '',
      action: parsed?.action || 'respond',
      input: parsed?.input || {},
      tokensIn: response.tokensIn,
      tokensOut: response.tokensOut,
      latencyMs: Date.now() - reasonStart,
      provider: response.provider,
    });

    if (parsed?.thought) {
      allReasoning.push(parsed.thought);
      yield { event: 'reasoning', data: { thought: parsed.thought, iteration: i + 1 } };
    }

    if (!parsed?.action || parsed.action === 'respond') break;

    const toolName = parsed.action;
    const toolInput = parsed.input || {};

    yield { event: 'tool_start', data: { name: toolName, input: toolInput } };

    const toolStart = Date.now();
    const toolResult = await executeTool(toolName, toolInput);
    const durationMs = Date.now() - toolStart;

    if (run && decisionHandle) {
      run.attachToolResult(decisionHandle, {
        result: toolResult.result,
        durationMs,
        error: toolResult.metadata?.error || null,
      });
    }

    if (features.toolIntelligence) {
      const wasUseful = !toolResult.metadata?.error;
      const queryPattern = userMessage.slice(0, 80);
      const lessonContext = wasUseful
        ? (toolResult.result.length > 100 ? 'returned substantial content' : 'returned brief content')
        : 'returned error';
      db.addToolLesson(toolName, queryPattern, wasUseful, durationMs, lessonContext);
    }

    const truncResult = toolResult.result.slice(0, agentCfg.toolResultMaxLength);
    yield { event: 'tool_result', data: { name: toolName, result: truncResult, durationMs } };

    allToolCalls.push({
      name: toolName,
      input: toolInput,
      result: truncResult,
      durationMs,
    });

    if (features.factExtraction && toolName === 'wikipedia_article' && !toolResult.metadata?.error) {
      const sentences = toolResult.result.split(/[.!?]+/).filter(s => s.trim().length > 20).slice(0, 3);
      for (const s of sentences) {
        db.addFact(toolInput.title, 'states', s.trim().slice(0, agentCfg.factSliceLength), 0.8);
      }
    }

    messages.push({ role: 'assistant', content: response.text });

    let resultContent = `Tool result from ${toolName}:\n${toolResult.result.slice(0, agentCfg.toolResultContextLength)}`;
    if (toolName === 'wikipedia_search' && toolResult.metadata?.titles?.length > 0) {
      resultContent += `\n\nNow read one of these articles using wikipedia_article. Or if you have enough information, use {"thought": "...", "action": "respond"} to answer.`;
    }
    if (i >= agentCfg.forceRespondAfterRounds && allToolCalls.length >= agentCfg.forceRespondAfterRounds) {
      resultContent += `\n\nYou've gathered enough information. Please respond to the user now with {"thought": "...", "action": "respond"}.`;
    }
    messages.push({ role: 'user', content: resultContent });
  }

  if (abortSignal?.()) {
    saveInterrupted(db, threadId, userMessage, allReasoning, allToolCalls, '', messages);
    return;
  }

  yield { event: 'stream_answer_start', data: {} };

  const answerMessages = [
    ...messages,
    {
      role: 'user',
      content: 'Now give a clear, comprehensive answer to the original question. Do NOT output JSON — write a natural language response for the user.',
    },
  ];

  let fullAnswer = '';
  try {
    for await (const chunk of llm.chatStream(answerMessages, { temperature: agentCfg.answerTemperature })) {
      if (abortSignal?.()) {
        saveInterrupted(db, threadId, userMessage, allReasoning, allToolCalls, fullAnswer, messages);
        break;
      }
      if (chunk.token) {
        fullAnswer += chunk.token;
        yield { event: 'token', data: { text: chunk.token } };
      }
    }
  } catch (err) {
    if (!fullAnswer) {
      yield { event: 'error', data: { code: 'stream_error', message: err.message } };
      return;
    }
  }

  if (!fullAnswer.trim()) {
    fullAnswer = 'I apologize, but I was unable to generate a response. Please try again.';
    yield { event: 'token', data: { text: fullAnswer } };
  }

  const runReport = run?.end(fullAnswer, {
    totalTokensIn,
    totalTokensOut,
    provider,
    outcome: 'answered',
  });

  let outputPiiRedacted = false;
  if (guardrails) {
    const outputScan = guardrails.scanOutput(fullAnswer, threadId);
    if (outputScan.flags.length > 0) {
      fullAnswer = outputScan.cleanedText;
      outputPiiRedacted = outputScan.flags.some(f => f.type === 'pii_leak');
      yield { event: 'guardrail', data: { type: 'output', flags: outputScan.flags } };
    }
  }

  const totalLatencyMs = Date.now() - startTime;

  if (features.auditTrail) {
    db.addAuditEntry({
      type: 'llm_response',
      threadId,
      detail: JSON.stringify({
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
        provider,
        latencyMs: totalLatencyMs,
        toolCalls: allToolCalls.length,
        outputPiiRedacted,
      }),
    });
  }

  const harnessMeta = {
    tokensIn: totalTokensIn,
    tokensOut: totalTokensOut,
    totalTokens: totalTokensIn + totalTokensOut,
    provider,
    latencyMs: totalLatencyMs,
    toolCallCount: allToolCalls.length,
    reasoningSteps: allReasoning.length,
    lessonsUsed: lessons.length,
    resumedFromInterrupt: !!interrupted,
    traceId: run?.runId || null,
    strategy: runReport?.strategy || null,
    toolRoi: runReport?.toolRoi ?? null,
    coherence: runReport?.coherence ?? null,
    productiveDecisions: runReport?.productive ?? null,
    wastedDecisions: runReport?.wasted ?? null,
  };

  const assistantMsg = db.addMessage(threadId, 'assistant', fullAnswer, {
    parentId: userMsg.id,
    reasoning: JSON.stringify(allReasoning),
    toolCalls: allToolCalls.length > 0 ? JSON.stringify(allToolCalls) : null,
    harnessMeta: JSON.stringify(harnessMeta),
  });

  if (!db.getThread(threadId).title && fullAnswer.length > 10) {
    const title = userMessage.slice(0, 60) + (userMessage.length > 60 ? '...' : '');
    db.updateThreadTitle(threadId, title);
  }

  yield {
    event: 'done',
    data: {
      messageId: assistantMsg.id,
      parentId: userMsg.id,
      harness: harnessMeta,
      traceId: run?.runId || null,
    },
  };
}

function saveInterrupted(db, threadId, userMessage, reasoning, toolCalls, partialAnswer, messages) {
  db.saveInterruptedContext(
    threadId,
    userMessage,
    JSON.stringify(reasoning),
    JSON.stringify(toolCalls.map(tc => tc.name)),
    partialAnswer,
    JSON.stringify(messages.slice(-4))
  );
}

function extractAction(text) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch { /* fall through */ }

  const actionMatch = text.match(/action["\s:]+([a-z_]+)/i);
  if (actionMatch) {
    return {
      thought: text.slice(0, 200),
      action: actionMatch[1],
      input: {},
    };
  }
  return { thought: text.slice(0, 200), action: 'respond', input: {} };
}
