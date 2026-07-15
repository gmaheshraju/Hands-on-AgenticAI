import { useState } from 'react';
import { Link } from 'react-router-dom';
import Decision, { Pill } from '../../components/Decision';
import Insight from '../../components/Insight';
import CodeBlock from '../../components/CodeBlock';
import FadeIn from '../../components/FadeIn';

const STREAMING_HOOK_CODE = `function useStreamingResponse() {
  const [state, setState] = useState('idle');
  const [tokens, setTokens] = useState('');
  const [toolResults, setToolResults] = useState([]);

  async function send(message) {
    setState('thinking');
    setTokens('');

    const res = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
      headers: { 'Content-Type': 'application/json' },
    });

    setState('streaming');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const events = chunk
        .split('\\n')
        .filter(line => line.startsWith('data: '))
        .map(line => JSON.parse(line.slice(6)));

      for (const evt of events) {
        if (evt.type === 'token') {
          setTokens(prev => prev + evt.text);
        } else if (evt.type === 'tool_start') {
          setState('tool_executing');
        } else if (evt.type === 'tool_result') {
          setToolResults(prev => [...prev, evt.result]);
          setState('streaming');
        }
      }
    }
    setState('complete');
  }

  return { state, tokens, toolResults, send };
}

// Usage in a chat component
function ChatMessage({ state, tokens }) {
  return (
    <div className="message ai">
      {state === 'thinking' && <TypingIndicator />}
      {state === 'streaming' && (
        <>
          <MarkdownRenderer content={tokens} />
          <BlinkingCursor />
        </>
      )}
      {state === 'tool_executing' && (
        <ToolSpinner label="Searching your orders..." />
      )}
      {state === 'complete' && (
        <>
          <MarkdownRenderer content={tokens} />
          <ActionBar actions={['copy', 'share', 'regenerate']} />
        </>
      )}
    </div>
  );
}`;

const STREAMING_HOOK_OUTPUT = `State transitions for "What's my order status?":
  idle -> thinking (200ms)
  thinking -> streaming (TTFT: 340ms)
  streaming -> tool_executing ("Let me check...")
  tool_executing -> streaming (tool took 890ms)
  streaming -> complete (total: 2.8s)

User perception: "Fast -- I saw it working the whole time"
Reality: 2.8s total, but zero dead time.

Key metric: Time To First Token (TTFT)
  GPT-4o:       ~300ms
  Claude 3.5:   ~400ms
  Gemini 1.5:   ~350ms
  Self-hosted Llama 3: ~100ms (but slower total)

Rule of thumb: if TTFT < 500ms and you stream,
users rate the experience "instant" regardless of
total generation time (even 10s+).`;

const CONFIDENCE_FORMATTER_CODE = `function formatResponse(answer, confidence, sources) {
  // High confidence: direct statement, no hedging
  if (confidence >= 0.9) {
    return {
      text: answer,
      style: 'direct',
      showSources: false,
      actions: ['copy', 'share'],
    };
  }

  // Medium confidence: qualified with source attribution
  if (confidence >= 0.7) {
    return {
      text: \`Based on the available information: \${answer}\`,
      style: 'qualified',
      showSources: true,
      sources: sources.map(s => ({
        title: s.title,
        url: s.url,
        relevance: s.score,
      })),
      actions: ['copy', 'verify', 'share'],
    };
  }

  // Low confidence: explicit uncertainty + human option
  if (confidence >= 0.4) {
    return {
      text: \`I'm not fully certain, but: \${answer}\`,
      style: 'uncertain',
      showSources: true,
      sources,
      actions: ['verify', 'ask_human', 'rephrase'],
      suggestion: 'Would you like me to connect you with a specialist?',
    };
  }

  // No confidence: abstain entirely
  return {
    text: "I don't have enough information to answer this accurately.",
    style: 'abstain',
    alternatives: generateRelatedTopics(answer),
    actions: ['ask_human', 'rephrase'],
  };
}

// Visual treatment per confidence band
const CONFIDENCE_STYLES = {
  direct:    { border: 'none',             icon: null,       bg: 'transparent' },
  qualified: { border: '1px solid #e5e7eb', icon: 'info',    bg: '#f9fafb' },
  uncertain: { border: '1px solid #fbbf24', icon: 'warning', bg: '#fffbeb' },
  abstain:   { border: '1px solid #ef4444', icon: 'stop',    bg: '#fef2f2' },
};`;

const CONFIDENCE_FORMATTER_OUTPUT = `> formatResponse("Your order ships tomorrow", 0.95, [])
{ text: "Your order ships tomorrow",
  style: "direct", showSources: false }

> formatResponse("The refund takes 5-7 days", 0.78, sources)
{ text: "Based on the available information: The refund takes 5-7 days",
  style: "qualified", showSources: true,
  sources: [{ title: "Refund Policy v3", relevance: 0.89 }] }

> formatResponse("Coverage includes accidental damage", 0.55, [])
{ text: "I'm not fully certain, but: Coverage includes accidental damage",
  style: "uncertain",
  suggestion: "Would you like me to connect you with a specialist?" }

> formatResponse("I'm not sure about the warranty", 0.25, [])
{ text: "I don't have enough information to answer this accurately.",
  style: "abstain",
  alternatives: ["Warranty coverage", "Return policy", "Product specs"] }`;

const HITL_APPROVAL_CODE = `class ApprovalFlow {
  constructor({ riskThresholds, autoApproveBelow }) {
    this.thresholds = riskThresholds;
    this.autoApprove = autoApproveBelow;
  }

  async evaluate(action) {
    const risk = this.assessRisk(action);

    // Low risk: auto-execute, log for audit
    if (risk.score < this.autoApprove) {
      const result = await action.execute();
      await this.audit(action, result, 'auto_approved');
      return result;
    }

    // Medium risk: inline confirmation
    if (risk.score < this.thresholds.requireHuman) {
      const confirmed = await this.requestConfirmation({
        action: action.describe(),
        risk: risk.summary,
        reversible: action.isReversible(),
      });
      if (!confirmed) return { status: 'cancelled_by_user' };
      const result = await action.execute();
      await this.audit(action, result, 'user_confirmed');
      return result;
    }

    // High risk: human specialist required
    return this.escalateToHuman(action, risk);
  }

  assessRisk(action) {
    let score = 0;
    if (action.involvesMoney)        score += 40;
    if (action.affectsOtherUsers)    score += 30;
    if (!action.isReversible())      score += 25;
    if (action.touchesPII)           score += 20;
    if (action.isDeleteOperation)    score += 15;

    return {
      score: Math.min(score, 100),
      summary: this.summarizeRisk(score, action),
      factors: action.riskFactors,
    };
  }

  async escalateToHuman(action, risk) {
    // Transfer full context -- never make the user re-explain
    return {
      status: 'escalated',
      handoff: {
        conversationHistory: action.context.messages,
        userIntent: action.context.intent,
        attemptedActions: action.context.attempts,
        riskAssessment: risk,
        suggestedSpecialist: this.routeToTeam(action.category),
      },
    };
  }
}

// Usage
const flow = new ApprovalFlow({
  riskThresholds: { requireHuman: 60 },
  autoApproveBelow: 20,
});

// Auto-approved: read-only lookup
await flow.evaluate(new Action('lookup_order', { orderId: 456 }));

// Needs confirmation: cancel an order
await flow.evaluate(new Action('cancel_order', {
  orderId: 456,
  refundAmount: 8999,
  involvesMoney: true,
  isReversible: () => false,
}));

// Escalated: account deletion
await flow.evaluate(new Action('delete_account', {
  userId: 789,
  involvesMoney: true,
  affectsOtherUsers: true,
  isReversible: () => false,
}));`;

const HITL_APPROVAL_OUTPUT = `> flow.evaluate(lookupOrder)    // risk: 0
{ status: "completed", audit: "auto_approved" }

> flow.evaluate(cancelOrder)    // risk: 65 (money + irreversible)
  -> Shows: "Cancel order #456 for ₹8,999 refund? This can't be undone."
  -> [Confirm] [Cancel]
  -> User clicks Confirm
{ status: "completed", audit: "user_confirmed" }

> flow.evaluate(deleteAccount)  // risk: 95
{ status: "escalated",
  handoff: {
    suggestedSpecialist: "account_security",
    conversationHistory: [...14 messages...],
    userIntent: "Delete account and all data",
    riskAssessment: { score: 95, factors: ["money", "affects_others", "irreversible"] }
  }
}

Good handoff: "Connecting you with Sarah from Account Security.
She can see your request to delete your account and our full
conversation, so you won't need to re-explain."

Bad handoff: "Transferring you to an agent."
(User has to start over. Trust destroyed.)`;

const ERROR_RECOVERY_CODE = `class AIErrorRecovery {
  constructor({ models, maxRetries = 2 }) {
    this.models = models; // ordered by capability: [primary, fallback, minimal]
    this.maxRetries = maxRetries;
  }

  async execute(request) {
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const model = this.models[Math.min(attempt, this.models.length - 1)];

      try {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          model.timeout  // primary: 10s, fallback: 15s
        );

        const result = await model.complete(request, {
          signal: controller.signal,
        });
        clearTimeout(timeout);

        // Validate response before returning
        const validation = this.validate(result, request);
        if (!validation.ok) {
          // Hallucination or bad output detected -- retry with explicit instruction
          request = this.augmentRequest(request, validation.issues);
          continue;
        }

        return { result, model: model.name, attempt, fromCache: false };

      } catch (err) {
        if (err.name === 'AbortError') {
          // Timeout -- try faster model
          this.emit('degraded', { model: model.name, reason: 'timeout' });
          continue;
        }
        if (err.status === 429) {
          // Rate limited -- wait and retry same model
          await this.backoff(attempt);
          attempt--; // don't consume a model downgrade
          continue;
        }
        if (err.status >= 500) {
          // Provider down -- skip to next model
          this.emit('provider_error', { model: model.name, status: err.status });
          continue;
        }
        throw err; // Unknown error -- don't swallow
      }
    }

    // All retries exhausted: graceful degradation
    return this.gracefulFallback(request);
  }

  gracefulFallback(request) {
    return {
      result: {
        text: "I'm having trouble processing this right now. " +
              "Here's what I can tell you from cached information:",
        partial: this.getCachedResponse(request),
        actions: ['retry', 'contact_support'],
      },
      degraded: true,
    };
  }
}

const recovery = new AIErrorRecovery({
  models: [
    { name: 'claude-sonnet-4', timeout: 10000 },
    { name: 'claude-haiku-3.5', timeout: 15000 },
    { name: 'cached-responses', timeout: 1000 },
  ],
});`;

const ERROR_RECOVERY_OUTPUT = `Scenario 1: Primary model succeeds
  attempt 0: claude-sonnet-4 -> 200 OK (1.2s)
  Result: full quality response

Scenario 2: Primary times out, fallback succeeds
  attempt 0: claude-sonnet-4 -> TIMEOUT (10s)
  attempt 1: claude-haiku-3.5 -> 200 OK (2.1s)
  Result: slightly lower quality, but user waited 12s total
  UX: "Taking a moment..." shown at 2s mark

Scenario 3: Rate limited, retry works
  attempt 0: claude-sonnet-4 -> 429 (rate limited)
  backoff: 1s wait
  attempt 0 (retry): claude-sonnet-4 -> 200 OK (1.8s)
  Result: full quality, user waited ~3s total
  UX: "High demand, your request is queued..."

Scenario 4: Everything fails
  attempt 0: claude-sonnet-4 -> TIMEOUT
  attempt 1: claude-haiku-3.5 -> 500
  attempt 2: cached-responses -> partial match
  Result: cached answer + "retry" + "contact support"
  UX: "I'm having trouble right now. Here's what I know
       from earlier: [cached answer]. Want to try again?"

Never shown to user: "Error 500", "Model unavailable",
"AbortError", raw JSON, or a blank screen.`;

const TRUST_PATTERNS_CODE = `class TrustableAI {
  constructor({ memoryStore, feedbackStore }) {
    this.memory = memoryStore;
    this.feedback = feedbackStore;
  }

  // Pattern 1: Source attribution -- "show your work"
  formatWithSources(answer, chunks) {
    const cited = answer.replace(
      /\\[([0-9]+)\\]/g,
      (_, num) => {
        const chunk = chunks[parseInt(num) - 1];
        return chunk
          ? \`[\${num}](\${chunk.url} "\${chunk.title}")\`
          : \`[\${num}]\`;
      }
    );

    return {
      answer: cited,
      sourcePanel: chunks.map((c, i) => ({
        index: i + 1,
        title: c.title,
        snippet: c.text.slice(0, 200),
        url: c.url,
        lastUpdated: c.updatedAt,
      })),
      dataFreshness: this.computeFreshness(chunks),
    };
  }

  // Pattern 2: Explicit memory with user control
  async handleMemory(userId, action, data) {
    switch (action) {
      case 'ask_to_remember':
        // Always ask -- never silently remember
        return {
          prompt: \`Would you like me to remember that \${data.summary}?\`,
          actions: ['yes_remember', 'no_this_time_only'],
        };

      case 'show_memories':
        const memories = await this.memory.list(userId);
        return {
          memories,
          actions: memories.map(m => ({
            id: m.id,
            text: m.summary,
            canEdit: true,
            canDelete: true,
          })),
        };

      case 'forget':
        await this.memory.delete(userId, data.memoryId);
        return { confirmation: 'Deleted. I won\\'t use this information anymore.' };
    }
  }

  // Pattern 3: Disagree/feedback button
  async handleFeedback(responseId, feedback) {
    await this.feedback.record({
      responseId,
      type: feedback.type,     // 'wrong', 'unhelpful', 'outdated', 'offensive'
      detail: feedback.detail,  // optional user explanation
      timestamp: Date.now(),
    });

    // Immediate action based on feedback type
    if (feedback.type === 'wrong') {
      return {
        message: "Thanks for flagging this. Let me try a different approach.",
        action: 'regenerate_with_constraint',
        constraint: \`Previous answer was marked incorrect: \${feedback.detail || 'no details'}\`,
      };
    }

    return { message: "Thanks for the feedback. This helps me improve." };
  }

  // Pattern 4: Temporal honesty
  computeFreshness(chunks) {
    const oldest = Math.min(...chunks.map(c => c.updatedAt));
    const ageInDays = (Date.now() - oldest) / 86400000;

    if (ageInDays > 180) {
      return {
        warning: \`This information was last updated \${Math.round(ageInDays)} days ago. It may be outdated.\`,
        severity: 'stale',
      };
    }
    if (ageInDays > 30) {
      return {
        note: \`Last updated \${Math.round(ageInDays)} days ago.\`,
        severity: 'aging',
      };
    }
    return { severity: 'fresh' };
  }
}`;

const TRUST_PATTERNS_OUTPUT = `// Source attribution
> ai.formatWithSources("Your order ships tomorrow [1].", chunks)
{
  answer: "Your order ships tomorrow [1](https://... \\"Order #456\\").",
  sourcePanel: [{ index: 1, title: "Order #456",
    snippet: "Shipped via BlueDart, expected delivery..." }],
  dataFreshness: { severity: "fresh" }
}

// Memory control
> ai.handleMemory(user, 'ask_to_remember', { summary: "you prefer dark roast" })
{ prompt: "Would you like me to remember that you prefer dark roast?",
  actions: ["yes_remember", "no_this_time_only"] }

> ai.handleMemory(user, 'show_memories')
{ memories: [
    { id: "m1", text: "Prefers dark roast", canEdit: true, canDelete: true },
    { id: "m2", text: "Ships to Mumbai office", canEdit: true, canDelete: true },
  ]
}

// Feedback handling
> ai.handleFeedback("resp_42", { type: "wrong", detail: "Ships Thursday not tomorrow" })
{ message: "Thanks for flagging this. Let me try a different approach.",
  action: "regenerate_with_constraint" }

// Temporal honesty
> ai.computeFreshness(chunks)  // chunks from 7 months ago
{ warning: "This information was last updated 214 days ago. It may be outdated.",
  severity: "stale" }`;


const TABS = ['Streaming & Speed', 'Confidence & Uncertainty', 'Human-in-the-Loop', 'Error States & Recovery', 'Trust Patterns'];

export default function AiUxPatterns() {
  const [tab, setTab] = useState(0);

  return (
    <div className="page-content">
      <Link to="/blog" style={styles.back}>&larr; AI Engineering</Link>
      <p style={styles.eyebrow}>Post 12</p>
      <h1 style={styles.h1}>AI UX Patterns</h1>
      <p style={styles.subtitle}>
        Streaming, confidence indicators, human-in-the-loop flows, progressive disclosure,
        and error states — the product engineering that makes AI feel trustworthy instead of magical.
      </p>

      <div style={styles.tabWrap}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} style={{ ...styles.tabBtn, ...(tab === i ? styles.tabActive : {}) }}>{t}</button>
        ))}
      </div>

      {tab === 0 && <StreamingPanel />}
      {tab === 1 && <ConfidencePanel />}
      {tab === 2 && <HumanInTheLoopPanel />}
      {tab === 3 && <ErrorStatesPanel />}
      {tab === 4 && <TrustPatternsPanel />}

      <FadeIn><div style={{ marginTop: 48, padding: '24px 28px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
        <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Capstone Project</p>
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-h)', marginBottom: 6 }}>Production Chat UI with Trust Signals</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Build the real thing. Production-grade project brief with architecture requirements, evaluation criteria, and staff+ interview angles.</p>
        <a href="https://github.com/gmaheshraju/Hands-on-AgenticAI/blob/main/projects/12-ai-ux.md" target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--text-accent)', textDecoration: 'none', fontWeight: 500 }}>View project brief on GitHub →</a>
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

function StreamingPanel() {
  return (
    <div>
      <SectionHead
        title="Streaming turns latency into engagement"
        desc="Users abandon after 3 seconds of nothing. A 5-second buffered response feels slow. A 5-second streamed response feels instant. Streaming is a 1-day engineering investment that transforms perceived performance by 10x."
      />

      <FadeIn><Decision question="When to stream vs buffer the LLM response?">
        <Pill type="green">Stream always for conversational UI</Pill> User sees tokens appear in real-time. Perceived wait drops from 4s to 200ms (time to first token). This is the ChatGPT/Claude pattern. Streaming dramatically reduces perceived latency complaints despite zero change to actual generation time — users judge responsiveness by when they see the first token, not when the last one arrives.
        <br /><br />
        <Pill type="amber">Buffer for structured output</Pill> If you need to validate, format, or filter the response before showing it — content moderation, JSON schema validation, tool call parsing — buffer until validation passes. Showing the user a half-formed JSON blob or a response that gets yanked back after moderation is worse than a 2-second wait.
        <br /><br />
        <Pill type="green">Hybrid: stream text, buffer tool results</Pill> &quot;Let me look that up for you...&quot; (streamed) then a loading spinner while the tool executes, then &quot;Found 3 matching orders&quot; (buffered after tool completes). The user sees progress at every stage. This is how Claude, ChatGPT, and Copilot all handle tool use.
        <br /><br />
        <strong>Staff+ signal:</strong> Know the difference between Server-Sent Events (SSE) and WebSockets for streaming. SSE is unidirectional, simpler, works through CDNs, and is what OpenAI/Anthropic APIs use. WebSockets are bidirectional — overkill for streaming LLM responses but needed if the user can interrupt/cancel mid-stream.
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="How to handle streaming UX states?">
        <Pill type="green">4-state machine: idle, thinking, streaming, complete</Pill> Each state needs distinct visual treatment. Idle: empty or last message. Thinking: typing indicator (dots or pulsing ring) — this appears during the TTFT window (200-500ms). Streaming: tokens appearing with a blinking cursor/caret at the end. Complete: cursor disappears, action buttons (copy, share, edit, regenerate) fade in.
        <br /><br />
        <Pill type="red">Never show action buttons while streaming</Pill> If you show a &quot;copy&quot; button while tokens are still arriving, the user copies an incomplete response. If you show &quot;regenerate&quot; mid-stream, clicking it fires a second API call before the first finishes — wasted tokens. Actions appear only on state === &apos;complete&apos;.
        <br /><br />
        <Pill type="amber">Tool execution as a 5th state</Pill> When the model calls a tool (search, API lookup, code execution), show a specific spinner with a label: &quot;Searching your order history...&quot; not just a generic loading indicator. Users tolerate 3-5 seconds of tool execution if they understand what is happening.
      </Decision></FadeIn>

      <FadeIn delay={160}><Decision question="Progressive content reveal patterns?">
        <Pill type="green">Token-by-token</Pill> The standard ChatGPT/Claude pattern. Words appear as generated. Natural for conversation. Implementation: SSE stream where each event contains 1-5 tokens. Client appends to a string and re-renders via React state.
        <br /><br />
        <Pill type="amber">Chunk-by-chunk</Pill> Buffer 2-3 sentences, reveal as a block. Better for structured content — lists, tables, code blocks. Less jarring than word-by-word for non-conversation UI. Notion AI uses this pattern. Implementation: accumulate tokens until you hit a sentence boundary or newline, then flush.
        <br /><br />
        <Pill type="green">Section-by-section</Pill> For long-form content. &quot;Summary&quot; section appears first, then &quot;Details&quot; can expand on click. User gets the answer in 1-2 seconds, full detail is optional. Perplexity uses this — the answer appears immediately, sources expand below. Implementation: stream normally but collapse sections behind accordion UI after completion.
      </Decision></FadeIn>

      <FadeIn>
        <CodeBlock filename="useStreamingResponse.js" code={STREAMING_HOOK_CODE} output={STREAMING_HOOK_OUTPUT} />
      </FadeIn>

      <FadeIn delay={80}><Insight>
        The single most impactful UX improvement for AI products is not a better model — it is streaming. Early GPT-4 shipped with buffered 15-second responses; once streaming was added, the perceived experience transformed overnight despite identical generation speed. The engineering cost is 1-2 days: swap your fetch call for an SSE reader, add a state machine, and render tokens incrementally. Do this before you spend a single dollar on model latency optimization. TTFT under 500ms plus streaming equals &quot;instant&quot; in user perception, regardless of total generation time.
      </Insight></FadeIn>
    </div>
  );
}

function ConfidencePanel() {
  return (
    <div>
      <SectionHead
        title="Confidence communication -- when the AI is wrong"
        desc="Foundation models are wrong 10-20% of the time on factual queries. GPT-4 hallucinates at ~3-5% on grounded tasks, 15-20% on open-ended ones. Your UX needs to communicate that honestly instead of presenting every answer with equal authority."
      />

      <FadeIn><Decision question="How to surface confidence to users?">
        <Pill type="green">{'>'}0.9: direct statement, no hedging</Pill> &quot;Your order ships tomorrow.&quot; No qualifiers. High confidence means the answer came from a verified source (database lookup, confirmed RAG chunk with cosine similarity {'>'}0.85). The user sees a clean, authoritative answer.
        <br /><br />
        <Pill type="amber">0.7-0.9: soft qualifiers with source attribution</Pill> &quot;Based on the information I found, your order should ship tomorrow.&quot; Subtle language shift. Show expandable sources so the user can verify. This is the &quot;qualified trust&quot; zone — the answer is probably right but came from fuzzy matching or inference.
        <br /><br />
        <Pill type="amber">0.4-0.7: explicit uncertainty with human option</Pill> &quot;I am not entirely sure, but it looks like your order ships tomorrow. You may want to check the tracking page for confirmation.&quot; Offer a &quot;connect to human&quot; button. The user should not have to guess that the AI is unsure.
        <br /><br />
        <Pill type="green">{'<'}0.4: abstain entirely</Pill> &quot;I do not have enough information to answer that accurately. Here is where you can find it: [link].&quot; Never guess and present it as fact. Abstaining is the highest-trust response when you do not know. Users respect honesty far more than a confident wrong answer.
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="Visual confidence indicators -- what works?">
        <Pill type="green">Source attribution</Pill> &quot;According to your order history...&quot; or &quot;Based on our refund policy (Section 4.2)...&quot; Confidence through traceability. This is Perplexity&apos;s core UX innovation — every statement is grounded in a visible source. Users who want to verify can click through. Users who trust can ignore.
        <br /><br />
        <Pill type="amber">Footnotes/citations</Pill> [1][2][3] with expandable sources. Works well for knowledge-base products and research tools. Google&apos;s AI Overviews use this pattern. Implementation: the LLM outputs citation markers, your UI maps them to source chunks from RAG retrieval.
        <br /><br />
        <Pill type="red">Confidence percentages</Pill> Never show &quot;87% confident&quot; to end users. It creates false precision — the model&apos;s logprob-derived confidence is not calibrated the way humans expect. &quot;87%&quot; does not mean &quot;right 87 out of 100 times.&quot; It means &quot;the next token probability distribution peaked here.&quot; These numbers mislead more than they inform. Reserve them for internal dashboards and eval pipelines.
        <br /><br />
        <Pill type="amber">Color-coded badges</Pill> Green/amber/red confidence bands. Works for dashboards, data analysis, and structured output (e.g., anomaly detection results). Too alarming for conversational UI — a red badge on a chat message feels like an error, not a confidence signal.
      </Decision></FadeIn>

      <FadeIn delay={160}><Decision question="Handling ambiguous user queries?">
        <Pill type="green">Multiple valid interpretations: clarify</Pill> &quot;Did you mean the order from June or July?&quot; Do not guess. A 1-second clarification saves a 10-second wrong answer that the user has to correct. Slot-filling UX: track which parameters are resolved and which are ambiguous.
        <br /><br />
        <Pill type="amber">Close but uncertain: offer alternatives</Pill> &quot;I think you are asking about returns. If you meant something else: refund policy, exchange process, warranty claims.&quot; Show 2-3 alternatives max. More than 3 feels like the AI has no idea.
        <br /><br />
        <Pill type="green">Completely uncertain: redirect to human</Pill> &quot;I would like to connect you with a specialist who can help with this.&quot; No shame in escalation. The shame is in guessing wrong on a medical, legal, or financial question.
      </Decision></FadeIn>

      <FadeIn>
        <CodeBlock filename="confidence-formatter.js" code={CONFIDENCE_FORMATTER_CODE} output={CONFIDENCE_FORMATTER_OUTPUT} />
      </FadeIn>

      <FadeIn delay={80}><Insight>
        Most AI products fail at the edges of confidence. They are great when confident and terrible when uncertain — either silent (showing nothing) or overconfident (showing wrong answers as facts). The staff+ answer: design the uncertainty UX FIRST. If your product is trustworthy when it is wrong, users will trust it when it is right. Trust research consistently shows that a single confidently wrong answer destroys trust far faster than correct answers rebuild it — the asymmetry is severe, and it is the core reason why abstaining when uncertain is always better than guessing.
      </Insight></FadeIn>

      <FadeIn delay={160}><Insight type="warn" tag="Calibration gotcha">
        LLM logprobs are not calibrated confidence scores. A model saying &quot;token probability 0.95&quot; does not mean 95% accuracy on the claim. Calibration varies wildly by model, task, and prompt. For production confidence scoring, use a separate lightweight classifier trained on your domain&apos;s correct/incorrect labels, or use retrieval similarity scores (cosine distance from RAG chunks) as a proxy. Never ship raw logprobs as user-facing confidence.
      </Insight></FadeIn>
    </div>
  );
}

function HumanInTheLoopPanel() {
  return (
    <div>
      <SectionHead
        title="When the AI should stop and ask a human"
        desc="The hardest UX problem in AI: knowing when to automate and when to escalate. Get it wrong in either direction and you either annoy users with constant confirmations or execute destructive actions without consent."
      />

      <FadeIn><Decision question="When to escalate to a human?">
        <Pill type="green">Confidence below threshold</Pill> The AI does not know the answer. Route to human support. Set the threshold based on your domain — customer support might tolerate 0.6, medical triage should require 0.95+. The threshold is a product decision, not an engineering one.
        <br /><br />
        <Pill type="green">High-stakes actions</Pill> Financial transactions, account deletion, medical advice, legal guidance. Always confirm with the user, optionally route to a human specialist. The cost of a false positive (asking unnecessarily) is 5 seconds of user time. The cost of a false negative (executing wrongly) is a lawsuit or lost money.
        <br /><br />
        <Pill type="amber">Repeated failures</Pill> User has asked 3 times and the AI still cannot help. Auto-escalate before the user gets angry. Track &quot;frustration signals&quot;: rephrased questions, shorter messages, punctuation patterns (!!!), explicit complaints. Three failed attempts = automatic handoff.
        <br /><br />
        <Pill type="red">Emotional/crisis detection</Pill> User is frustrated, angry, or mentions self-harm. Immediate human handoff with full context transfer. No confirmation dialog — just route. Response time SLA for crisis: under 60 seconds to a human. This is non-negotiable for any consumer-facing AI product.
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="Approval flow patterns for AI actions?">
        <Pill type="green">Inline confirmation for simple actions</Pill> &quot;I will cancel your order (#456, Rs.8,999). Confirm?&quot; with [Confirm] [Cancel] buttons. For reversible, single-step actions. The confirmation shows exactly what will happen — amount, target, consequence. No vague &quot;Are you sure?&quot;
        <br /><br />
        <Pill type="green">Review-and-edit for content creation</Pill> AI generates a draft (email, report, code). User reviews, edits, then sends. GitHub Copilot, Notion AI, and Gmail Smart Compose all use this. The AI proposes, the human disposes. Key: make editing frictionless — inline editing, not a separate modal.
        <br /><br />
        <Pill type="amber">Staged execution for multi-step workflows</Pill> AI shows a plan: &quot;Step 1: fetch data. Step 2: calculate totals. Step 3: send report to team.&quot; User approves each stage or approves the full plan. Claude&apos;s computer use and Devin use this pattern. The user stays in control of the overall trajectory while the AI handles execution details.
        <br /><br />
        <Pill type="amber">Silent audit for low-risk, high-volume actions</Pill> AI executes automatically but logs everything. Human reviews a daily summary. Good for: auto-categorizing support tickets, tagging content, generating metadata. Bad for: anything involving money, PII, or external communication.
      </Decision></FadeIn>

      <FadeIn delay={160}><Decision question="Context handoff quality -- the trust moment?">
        <Pill type="red">Bad handoff</Pill> &quot;Transferring you to an agent.&quot; User has to re-explain everything from scratch. Re-explaining the same issue is consistently rated as the most frustrating customer service experience in industry surveys. The conversation history is lost. Trust in the AI system drops permanently.
        <br /><br />
        <Pill type="amber">Good handoff</Pill> &quot;I am connecting you with a specialist. I have shared our conversation so they have full context.&quot; Transfer the conversation history, user intent, and what the AI already tried. The human agent sees the full thread. User does not repeat themselves.
        <br /><br />
        <Pill type="green">Great handoff</Pill> &quot;Connecting you with Sarah from billing. She can see that you are asking about the double charge on your June invoice and that I was unable to resolve it through our automated system.&quot; Specific context about the exact issue, what was attempted, and why escalation was needed. The user feels the handoff is an upgrade, not a downgrade.
      </Decision></FadeIn>

      <FadeIn>
        <CodeBlock filename="approval-flow.js" code={HITL_APPROVAL_CODE} output={HITL_APPROVAL_OUTPUT} />
      </FadeIn>

      <FadeIn delay={80}><Insight>
        The best AI UX pattern is the one users never notice. When the AI knows the answer, it responds instantly. When it does not, it seamlessly hands off to a human without the user feeling &quot;downgraded.&quot; The worst pattern: a modal that says &quot;AI could not help. Would you like to talk to a human?&quot; That is admitting failure. Instead: &quot;Let me get someone who specializes in billing to help with this specific issue.&quot; Reframe the handoff as expertise routing, not AI failure. This framing shift — from &quot;I failed&quot; to &quot;I am connecting you with the right expert&quot; — dramatically increases handoff acceptance rates.
      </Insight></FadeIn>

      <FadeIn delay={160}><Insight type="warn" tag="Anti-pattern">
        The &quot;confirmation fatigue&quot; trap: requiring confirmation for everything. If the AI asks &quot;Are you sure?&quot; for every action, users stop reading the confirmations and click &quot;yes&quot; reflexively — the same phenomenon as cookie banner blindness. Reserve confirmations for genuinely high-risk actions. Low-risk actions should auto-execute with an undo option (the Gmail &quot;undo send&quot; pattern). Risk-score the action, do not default to asking.
      </Insight></FadeIn>
    </div>
  );
}

function ErrorStatesPanel() {
  return (
    <div>
      <SectionHead
        title="What users see when AI breaks"
        desc="AI systems fail in unique ways that traditional error handling doesn't cover. Model timeouts, rate limits, hallucination detection, content filtering, tool failures — each needs a specific recovery pattern. The goal: the user should never see a raw error."
      />

      <FadeIn><Decision question="Error taxonomy for AI products?">
        <Pill type="amber">Model timeout (10-30s)</Pill> &quot;Taking longer than expected. Still working...&quot; plus auto-retry with a faster model. Never show &quot;504 Gateway Timeout&quot; or &quot;AbortError.&quot; Claude Opus times out at ~30s on complex reasoning; if your UI assumes 5s max, you will show errors for perfectly valid requests. Set timeout per model: Haiku 5s, Sonnet 10s, Opus 30s.
        <br /><br />
        <Pill type="amber">Rate limited (429)</Pill> &quot;We are experiencing high demand. Your request is queued. Estimated wait: 30 seconds.&quot; Show position in queue if possible. Implement client-side token bucket to prevent hitting the rate limit in the first place. Anthropic rate limits: 60 RPM on Sonnet for Tier 1, 1000 RPM on Tier 4.
        <br /><br />
        <Pill type="green">Content filtered</Pill> &quot;I cannot help with that specific request. Here is what I can help with: [alternatives].&quot; Never say &quot;content policy violation&quot; to the user — it sounds like you are accusing them of doing something wrong. Frame it as capability limitation, not user fault.
        <br /><br />
        <Pill type="amber">Hallucination detected post-generation</Pill> &quot;I want to make sure I give you accurate information. Let me verify this...&quot; Trigger a fact-check step transparently. Implementation: run the response through a grounding check against your knowledge base. If grounding score is below threshold, regenerate with explicit grounding instructions.
        <br /><br />
        <Pill type="green">Tool failure</Pill> &quot;I was not able to look up your order right now. Would you like to try again, or should I connect you with support?&quot; Give options, never dead-end. If the tool failure is transient, auto-retry once before showing the error. If persistent, degrade gracefully — answer from model knowledge with a caveat.
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="Recovery patterns -- what to do when the primary path fails?">
        <Pill type="green">Auto-retry with model fallback</Pill> Primary model times out or errors? Retry with a faster, cheaper model. claude-sonnet-4 fails, retry with claude-haiku-3.5. 90% of the time, the simpler model&apos;s answer is good enough for the user&apos;s question. Implementation: ordered model list with per-model timeouts and max 2-3 retries total.
        <br /><br />
        <Pill type="green">Graceful degradation</Pill> Tool fails? Answer from the model&apos;s knowledge with a caveat. &quot;Based on general policy, refunds take 5-7 days, but I was not able to check your specific order. Want me to try again?&quot; A partial answer with a disclaimer is better than no answer.
        <br /><br />
        <Pill type="amber">Intelligent retry</Pill> A retry button that does something different — retry with a different model, modified prompt, or different tools. Same input to the same model equals the same output. A &quot;retry&quot; button that replays the exact same request is theater, not engineering.
        <br /><br />
        <Pill type="red">Cache-based fallback</Pill> All models down? Serve a cached response from a similar previous query. Label it clearly: &quot;Based on a similar question we answered previously...&quot; This is the last resort, not the first. Only implement if you have a semantic cache (not exact-match).
      </Decision></FadeIn>

      <FadeIn delay={160}><Decision question="Loading states that build trust vs destroy it?">
        <Pill type="green">Phase 1 (0-500ms): nothing visible</Pill> Most TTFT windows complete here. Showing a loader for a 300ms operation creates visual noise. Only trigger loading UI after 500ms. Implementation: setTimeout with a ref to cancel if the response arrives first.
        <br /><br />
        <Pill type="green">Phase 2 (500ms-2s): subtle typing indicator</Pill> Dots, cursor, or &quot;Thinking...&quot; label. Minimal but present. The user knows the system received their input. No progress bar — you cannot estimate LLM completion time accurately.
        <br /><br />
        <Pill type="amber">Phase 3 (2-5s): contextual progress message</Pill> &quot;Searching your order history...&quot; or &quot;Analyzing the document...&quot; Tell the user what is happening. Map tool calls to human-readable descriptions. This is where most AI-assisted search products live — Perplexity shows &quot;Reading 5 sources...&quot;
        <br /><br />
        <Pill type="red">Phase 4 (5s+): step progress with cancel option</Pill> &quot;Checked 3 of 5 sources...&quot; plus a cancel button. Never a spinner with no context at this duration. A dead spinner for more than 5 seconds is the #1 trust killer in AI UX. Users who see a contextless spinner at this duration are far more likely to abandon permanently than users who see a progress message — the difference between &quot;it is working&quot; and &quot;it is broken&quot; is entirely in the feedback.
      </Decision></FadeIn>

      <FadeIn>
        <CodeBlock filename="error-recovery.js" code={ERROR_RECOVERY_CODE} output={ERROR_RECOVERY_OUTPUT} />
      </FadeIn>

      <FadeIn delay={80}><Insight type="warn" tag="The cardinal sin">
        The infinite spinner. No progress indicator, no status message, no timeout, no cancel button. User stares at a loading animation for 15 seconds, then refreshes the page. They have now lost their conversation context AND their trust. Set a hard timeout per model tier (Haiku: 5s, Sonnet: 10s, Opus: 30s). If the response is not ready, show what you have and explain that more is coming. Always include a cancel button after 3 seconds. Always show what the system is doing after 2 seconds. These are not guidelines — they are requirements.
      </Insight></FadeIn>
    </div>
  );
}

function TrustPatternsPanel() {
  return (
    <div>
      <SectionHead
        title="The trust equation for AI"
        desc="Trust = (Reliability x Transparency) / (Risk x Surprise). Every UX decision maps to one of these four levers. Increase reliability (consistent, accurate answers). Increase transparency (show sources, explain limitations). Decrease risk (confirmation for destructive actions). Decrease surprise (never do something the user didn't expect)."
      />

      <FadeIn><Decision question="Transparency patterns -- how to show the AI's work?">
        <Pill type="green">Source attribution</Pill> &quot;I found this in your order history&quot; plus an expandable source panel. Users trust verifiable answers. Perplexity built a $3B company primarily on this UX innovation — same underlying models as everyone else, but every statement is traceable to a source. Implementation: RAG chunks become footnotes. Each footnote expands to show the source title, a snippet, and a link.
        <br /><br />
        <Pill type="green">Explain limitations upfront</Pill> &quot;I can help with billing and orders. For technical support, I will connect you with our engineering team.&quot; Setting expectations upfront reduces disappointment. Klarna&apos;s AI assistant prominently states what it can and cannot do — setting scope upfront significantly reduces &quot;wrong channel&quot; escalations.
        <br /><br />
        <Pill type="amber">Version/freshness awareness</Pill> &quot;I have information updated as of [date].&quot; For knowledge-base products, tell users how fresh the data is. A 6-month-old answer about API pricing is likely wrong. Show a &quot;stale data&quot; warning when sources are older than your domain&apos;s freshness threshold (e.g., 30 days for support docs, 1 day for pricing).
        <br /><br />
        <Pill type="green">Disagree/feedback button</Pill> Let users flag wrong answers with a thumbs-down or &quot;this is wrong&quot; button. Two purposes: users feel heard, and you get free evaluation data. ChatGPT&apos;s thumbs up/down buttons generate millions of RLHF data points daily. Your feedback loop should trigger an immediate re-generation attempt, not just log the complaint.
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="Personalization vs privacy -- the memory dilemma?">
        <Pill type="green">Explicit memory: always ask first</Pill> &quot;Would you like me to remember your preferences?&quot; Let users opt in. Never silently remember. ChatGPT&apos;s memory feature asks before storing. Users can view, edit, and delete individual memories. This is not just good UX — GDPR Article 17 (right to erasure) and India&apos;s DPDPA Section 12 legally require it for any personal data processing.
        <br /><br />
        <Pill type="green">Session-only context</Pill> Context within a conversation, forgotten after. Safest default for most products. No persistence equals no privacy risk, no compliance burden, no data breach surface. The trade-off: users re-explain preferences every session. For most products, this is acceptable.
        <br /><br />
        <Pill type="amber">Cross-session with full control</Pill> &quot;I remember you prefer dark roast. Change preferences?&quot; Users can see, edit, and delete everything the AI knows about them. This requires a &quot;memory management&quot; UI: a settings page listing all stored preferences with edit/delete buttons. Non-trivial engineering cost (~2-3 weeks for a solid implementation) but high user satisfaction when done right.
        <br /><br />
        <Pill type="red">Silent profiling</Pill> Silently building a user profile and personalizing without disclosure. Even if it makes the product objectively better, it destroys trust when discovered. The Cambridge Analytica effect is the cautionary tale: users who discover they were profiled without consent react with disproportionate anger — churn spikes, reviews tank, and the brand damage outlasts the product benefit by years.
      </Decision></FadeIn>

      <FadeIn delay={160}><Decision question="When should the AI say 'I don't know'?">
        <Pill type="green">No relevant sources found</Pill> Always say &quot;I do not know&quot; instead of guessing. Users respect honesty. Research consistently shows that users rate AI systems that admit uncertainty as more trustworthy than systems that always attempt an answer — even when the always-answer system is right more often overall. Honesty about limitations builds more trust than accuracy alone.
        <br /><br />
        <Pill type="green">Medical, legal, or financial advice</Pill> Always add a disclaimer. &quot;I can share general information, but please consult a professional for advice specific to your situation.&quot; This is not just UX — it is legal liability protection. AI companies that provide unlicensed financial or medical advice face regulatory action in India (SEBI, MCI guidelines).
        <br /><br />
        <Pill type="amber">Conflicting sources</Pill> &quot;I found different answers in different sources. Here are both perspectives...&quot; Let the user decide. Do not silently pick one. Present both with source attribution and let the user evaluate. This is especially important for policy questions where the answer genuinely varies by context.
        <br /><br />
        <Pill type="amber">Outside training data cutoff</Pill> &quot;This happened after my last update. I would recommend checking [current source].&quot; Temporal honesty. Models trained on data from 6 months ago should not answer questions about last week&apos;s events. If you detect a temporal query (dates, &quot;recently,&quot; &quot;latest&quot;), check whether your knowledge base has current data before answering from the model.
      </Decision></FadeIn>

      <FadeIn>
        <CodeBlock filename="trust-patterns.js" code={TRUST_PATTERNS_CODE} output={TRUST_PATTERNS_OUTPUT} />
      </FadeIn>

      <FadeIn delay={80}><Insight>
        The trust equation for AI: Trust = (Reliability x Transparency) / (Risk x Surprise). Map every UX decision to these four levers. Source attribution increases transparency. Confirmation dialogs decrease risk. Consistent response formatting increases reliability. Never auto-executing a destructive action decreases surprise. The companies winning in AI UX — Perplexity, Linear, Notion — optimize all four simultaneously. The companies losing — generic chatbot wrappers with no attribution, no error handling, no confidence signals — optimize none.
      </Insight></FadeIn>

      <FadeIn delay={160}><Insight tag="Interview framing">
        When asked about AI UX in a staff+ interview, structure your answer around the trust equation. &quot;The technical challenge of AI UX is not rendering tokens — it is building calibrated trust. Users should trust the system exactly as much as it deserves to be trusted: highly when it is confident and grounded, cautiously when it is uncertain, and not at all when it does not know. Every UX pattern — streaming, confidence bands, source attribution, error recovery — exists to calibrate that trust signal. The product that gets this right wins, regardless of which underlying model it uses.&quot;
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
