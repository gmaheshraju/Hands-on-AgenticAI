/**
 * Mock agent that produces streaming responses with confidence levels,
 * citations, thinking steps, HITL actions, and error scenarios.
 *
 * Each "scenario" is a scripted sequence of SSE events the server
 * can replay token-by-token.
 */

const SOURCES = [
  {
    id: 1,
    title: "Company Refund Policy v4.2",
    url: "https://internal.example.com/policies/refund-v4.2",
    passage: "All purchases are eligible for a full refund within 30 calendar days of the original transaction date, provided the item is returned in its original condition with proof of purchase."
  },
  {
    id: 2,
    title: "Customer Support Handbook",
    url: "https://internal.example.com/handbook/support",
    passage: "Exceptions to the standard refund policy may be granted by a supervisor for orders exceeding $500, or when the customer has been a member for more than 2 years."
  },
  {
    id: 3,
    title: "FTC Guidelines on Consumer Returns",
    url: "https://www.ftc.gov/consumer-returns",
    passage: "Federal law does not require merchants to accept returns, but merchants must clearly disclose their return policy at the point of sale."
  },
  {
    id: 4,
    title: "Q2 2026 Sales Report",
    url: "https://internal.example.com/reports/q2-2026",
    passage: "Customer satisfaction scores improved 12% after implementing the extended return window, while return rates increased by only 3%."
  },
  {
    id: 5,
    title: "Stripe API Documentation",
    url: "https://stripe.com/docs/api/refunds",
    passage: "To create a refund, call POST /v1/refunds with the charge ID and an optional amount parameter for partial refunds."
  }
];

/**
 * Scenario definitions.
 * Each scenario is an array of events the server streams.
 * Event types: thinking, token, citation, confidence, hitl, error, done
 */
const SCENARIOS = {
  refund_policy: {
    trigger: /refund|return|money back/i,
    events: buildRefundScenario
  },
  send_email: {
    trigger: /send.*email|email.*customer|notify/i,
    events: buildEmailScenario
  },
  database_query: {
    trigger: /database|sql|query|records|delete/i,
    events: buildDatabaseScenario
  },
  rate_limit: {
    trigger: /rate.?limit|too many|429/i,
    events: buildRateLimitScenario
  },
  context_long: {
    trigger: /context.*long|too long|summarize/i,
    events: buildContextLongScenario
  },
  timeout: {
    trigger: /timeout|slow|taking long/i,
    events: buildTimeoutScenario
  },
  network_error: {
    trigger: /network|disconnect|offline/i,
    events: buildNetworkErrorScenario
  },
  default: {
    trigger: /.*/,
    events: buildDefaultScenario
  }
};

function buildRefundScenario() {
  return [
    { type: "thinking", step: "Searching knowledge base...", duration: 800 },
    { type: "thinking", step: "Reading 3 documents...", duration: 1200 },
    { type: "thinking", step: "Cross-referencing refund policies...", duration: 600 },
    { type: "thinking", step: "Generating response...", duration: 400 },
    // Stream the response token by token
    ...tokenize(
      "Based on our current refund policy",
      "high"
    ),
    { type: "citation", sourceId: 1 },
    ...tokenize(
      ", all purchases are eligible for a full refund within 30 calendar days of the original transaction date. The item must be returned in its original condition with proof of purchase.",
      "high"
    ),
    ...tokenize(
      "\n\nThere are some exceptions worth noting: ",
      null
    ),
    ...tokenize(
      "orders exceeding $500 or customers with 2+ years of membership may qualify for extended return windows",
      "medium"
    ),
    { type: "citation", sourceId: 2 },
    ...tokenize(
      ". These exceptions require supervisor approval.",
      "medium"
    ),
    ...tokenize(
      "\n\nFrom a regulatory standpoint, ",
      null
    ),
    ...tokenize(
      "federal law does not actually require merchants to accept returns, but merchants must clearly disclose their return policy at the point of sale",
      "high"
    ),
    { type: "citation", sourceId: 3 },
    ...tokenize(". ", null),
    ...tokenize(
      "\n\nIt's worth noting that our extended return window has had positive results — customer satisfaction improved 12% while return rates only increased 3%",
      "medium"
    ),
    { type: "citation", sourceId: 4 },
    ...tokenize(".", null),
    ...tokenize(
      "\n\nI'm not entirely certain whether the 30-day window applies to digital purchases as well — you may want to check with the digital products team for confirmation on that.",
      "low"
    ),
    { type: "done" }
  ];
}

function buildEmailScenario() {
  return [
    { type: "thinking", step: "Understanding request...", duration: 500 },
    { type: "thinking", step: "Looking up customer record...", duration: 900 },
    { type: "thinking", step: "Drafting email...", duration: 1100 },
    ...tokenize(
      "I've drafted a follow-up email to the customer regarding their refund request. Before I send it, I'd like you to review it:",
      null
    ),
    {
      type: "hitl",
      action: {
        id: "email_" + Date.now(),
        type: "send_email",
        title: "Send Follow-up Email",
        description: "Send a refund confirmation email to the customer",
        preview: {
          to: "jane.doe@example.com",
          subject: "Your Refund Has Been Processed — Order #8847",
          body: "Hi Jane,\n\nThank you for reaching out to us. We've reviewed your refund request for Order #8847 and are happy to confirm that a full refund of $149.99 has been processed.\n\nThe refund will appear on your original payment method within 5-7 business days.\n\nIf you have any questions, please don't hesitate to reach out.\n\nBest regards,\nSupport Team"
        },
        editable_fields: ["subject", "body"]
      }
    }
    // After HITL approval, the server sends a continuation
  ];
}

function buildEmailContinuation(approved, edits) {
  if (!approved) {
    return [
      ...tokenize("\n\nUnderstood — I won't send the email. Let me know if you'd like me to revise it or take a different approach.", null),
      { type: "done" }
    ];
  }
  return [
    ...tokenize("\n\nThe email has been sent successfully to jane.doe@example.com. ", null),
    ...tokenize("The customer should receive it within a few minutes. I've also logged this interaction in the CRM.", "high"),
    { type: "done" }
  ];
}

function buildDatabaseScenario() {
  return [
    { type: "thinking", step: "Analyzing request...", duration: 400 },
    { type: "thinking", step: "Building SQL query...", duration: 800 },
    { type: "thinking", step: "Checking permissions...", duration: 600 },
    ...tokenize(
      "I can help you clean up those duplicate records. I've identified 23 duplicate entries in the customers table. Here's the query I'd like to run:",
      null
    ),
    {
      type: "hitl",
      action: {
        id: "sql_" + Date.now(),
        type: "execute_sql",
        title: "Execute Database Cleanup",
        description: "Delete 23 duplicate customer records (keeps the most recent entry for each email)",
        preview: {
          query: "DELETE c1 FROM customers c1\nINNER JOIN customers c2\nWHERE c1.email = c2.email\n  AND c1.created_at < c2.created_at\n  AND c1.id != c2.id;",
          affected_rows: 23,
          database: "production_db",
          warning: "This operation cannot be undone. A backup was created at 2026-07-15T10:30:00Z."
        },
        editable_fields: ["query"]
      }
    }
  ];
}

function buildDatabaseContinuation(approved) {
  if (!approved) {
    return [
      ...tokenize("\n\nGood call — I've cancelled the query. Would you like me to run it on a staging database first, or modify the query?", null),
      { type: "done" }
    ];
  }
  return [
    { type: "thinking", step: "Executing query...", duration: 1500 },
    ...tokenize("\n\nDone! The cleanup query executed successfully:", null),
    ...tokenize("\n- **23 duplicate records** removed", null),
    ...tokenize("\n- **Backup** created before execution", null),
    ...tokenize("\n- **No errors** encountered", null),
    ...tokenize("\n\nThe customers table now has 1,847 unique records.", "high"),
    { type: "done" }
  ];
}

function buildRateLimitScenario() {
  return [
    { type: "thinking", step: "Processing request...", duration: 300 },
    {
      type: "error",
      error: {
        code: "rate_limit",
        message: "Rate limit exceeded",
        retry_after: 5
      }
    }
  ];
}

function buildContextLongScenario() {
  return [
    { type: "thinking", step: "Processing request...", duration: 300 },
    {
      type: "error",
      error: {
        code: "context_too_long",
        message: "This conversation has exceeded the context window limit.",
        suggestion: "I'll summarize our conversation so far and continue with a fresh context."
      }
    }
  ];
}

function buildTimeoutScenario() {
  return [
    { type: "thinking", step: "Processing complex request...", duration: 2000 },
    { type: "thinking", step: "Still working...", duration: 3000 },
    {
      type: "error",
      error: {
        code: "timeout",
        message: "The request is taking longer than expected.",
        elapsed: 15
      }
    }
  ];
}

function buildNetworkErrorScenario() {
  return [
    { type: "thinking", step: "Connecting to API...", duration: 500 },
    {
      type: "error",
      error: {
        code: "network_error",
        message: "Connection to the AI service was lost."
      }
    }
  ];
}

function buildDefaultScenario() {
  return [
    { type: "thinking", step: "Processing your request...", duration: 600 },
    { type: "thinking", step: "Generating response...", duration: 400 },
    ...tokenize(
      "I can help you with several things. Try asking me about:\n\n",
      null
    ),
    ...tokenize("- **Refund policies** — I'll search our knowledge base and cite sources with confidence levels\n", null),
    ...tokenize("- **Send an email** — I'll draft it and ask for your approval before sending (HITL flow)\n", null),
    ...tokenize("- **Database query** — I'll show the SQL and ask for approval before executing\n", null),
    ...tokenize("- **Rate limit** — see the auto-retry countdown\n", null),
    ...tokenize("- **Context too long** — see the summarization prompt\n", null),
    ...tokenize("- **Timeout** — see the timeout recovery flow\n", null),
    ...tokenize("- **Network error** — see the reconnection handler\n", null),
    ...tokenize(
      "\nEach scenario demonstrates a different production UX pattern.",
      null
    ),
    { type: "done" }
  ];
}

/**
 * Convert a string into an array of token events, each with an optional
 * confidence level.
 */
function tokenize(text, confidence) {
  // Split into small chunks (2-4 words) for realistic streaming
  const words = text.split(/(\s+)/);
  const tokens = [];
  let chunk = "";
  let wordCount = 0;

  for (const word of words) {
    chunk += word;
    if (word.trim()) wordCount++;
    if (wordCount >= 2 + Math.floor(Math.random() * 3)) {
      tokens.push({
        type: "token",
        text: chunk,
        confidence: confidence
      });
      chunk = "";
      wordCount = 0;
    }
  }
  if (chunk) {
    tokens.push({ type: "token", text: chunk, confidence });
  }
  return tokens;
}

/**
 * Match user input to a scenario.
 */
export function matchScenario(userMessage) {
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    if (name === "default") continue;
    if (scenario.trigger.test(userMessage)) {
      return { name, events: scenario.events() };
    }
  }
  return { name: "default", events: SCENARIOS.default.events() };
}

/**
 * Get the continuation events after HITL resolution.
 */
export function getHITLContinuation(scenarioName, approved, edits) {
  if (scenarioName === "send_email") {
    return buildEmailContinuation(approved, edits);
  }
  if (scenarioName === "database_query") {
    return buildDatabaseContinuation(approved, edits);
  }
  return [
    ...tokenize(approved ? "\n\nAction completed." : "\n\nAction cancelled.", null),
    { type: "done" }
  ];
}

export { SOURCES };
