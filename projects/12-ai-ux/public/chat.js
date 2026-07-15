/**
 * Production Chat UI — Client-side SSE handling, HITL flow, error states.
 */

// ── State ────────────────────────────────────────────────────────────
let currentMessageId = null;   // active streaming message ID
let currentEventSource = null; // active SSE connection
let isStreaming = false;
let citationCounter = 0;       // tracks citation numbers within a message
let collectedSources = [];     // sources for the current message

const STORAGE_KEY = "chat_history_v1";

// ── DOM refs ─────────────────────────────────────────────────────────
const messagesEl = document.getElementById("messages");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const stopBtn = document.getElementById("stopBtn");
const newChatBtn = document.getElementById("newChatBtn");
const connectionStatus = document.getElementById("connectionStatus");

// ── Init ─────────────────────────────────────────────────────────────
loadHistory();
if (messagesEl.children.length === 0) {
  showWelcome();
}
chatInput.focus();

// ── Event listeners ──────────────────────────────────────────────────
sendBtn.addEventListener("click", sendMessage);
stopBtn.addEventListener("click", stopGeneration);
newChatBtn.addEventListener("click", newChat);

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Auto-resize textarea
chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
});

// ── Send message ─────────────────────────────────────────────────────
function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || isStreaming) return;

  // Add user message
  appendUserMessage(text);
  chatInput.value = "";
  chatInput.style.height = "auto";

  // Start streaming
  currentMessageId = "msg_" + Date.now();
  citationCounter = 0;
  collectedSources = [];
  startStreaming(text, currentMessageId);
}

// ── SSE streaming ────────────────────────────────────────────────────
function startStreaming(message, messageId) {
  isStreaming = true;
  sendBtn.disabled = true;
  stopBtn.classList.add("visible");

  const url = `/api/chat/stream?message=${encodeURIComponent(message)}&id=${encodeURIComponent(messageId)}`;
  const eventSource = new EventSource(url);
  currentEventSource = eventSource;

  let agentBubble = null;
  let thinkingEl = null;
  let bubbleTextContent = ""; // raw text accumulated

  eventSource.addEventListener("stream_start", () => {
    // Create agent message container
    const wrapper = createAgentMessageWrapper();
    messagesEl.appendChild(wrapper);
    agentBubble = wrapper.querySelector(".message-bubble");
    scrollToBottom();
  });

  eventSource.addEventListener("thinking", (e) => {
    const data = JSON.parse(e.data);
    // Remove previous thinking indicator if any
    if (thinkingEl) thinkingEl.remove();
    thinkingEl = createThinkingIndicator(data.step);
    // Insert thinking before the bubble or at the wrapper
    const wrapper = agentBubble
      ? agentBubble.closest(".message")
      : messagesEl.lastElementChild;
    if (wrapper) {
      if (agentBubble) {
        agentBubble.parentElement.insertBefore(thinkingEl, agentBubble);
      } else {
        wrapper.appendChild(thinkingEl);
      }
    }
    scrollToBottom();
  });

  eventSource.addEventListener("token", (e) => {
    const data = JSON.parse(e.data);
    // Remove thinking indicator on first token
    if (thinkingEl) {
      thinkingEl.remove();
      thinkingEl = null;
    }
    if (!agentBubble) return;

    // Append token with confidence wrapping
    appendToken(agentBubble, data.text, data.confidence);
    bubbleTextContent += data.text;
    scrollToBottom();
  });

  eventSource.addEventListener("citation", (e) => {
    const source = JSON.parse(e.data);
    if (!agentBubble) return;
    citationCounter++;
    collectedSources.push({ ...source, number: citationCounter });
    appendCitation(agentBubble, source, citationCounter);
    scrollToBottom();
  });

  eventSource.addEventListener("hitl_request", (e) => {
    const action = JSON.parse(e.data);
    if (thinkingEl) { thinkingEl.remove(); thinkingEl = null; }
    if (!agentBubble) return;

    // Remove streaming cursor
    removeCursor(agentBubble);

    const hitlCard = createHITLCard(action);
    agentBubble.appendChild(hitlCard);
    scrollToBottom();

    // Keep the SSE connection open — server is waiting for approval
    // The HITL buttons will call resolveHITL()
  });

  eventSource.addEventListener("error_event", (e) => {
    // Note: we renamed to error_event to avoid SSE built-in "error"
    handleAgentError(JSON.parse(e.data), agentBubble);
  });

  // Also listen on "error" data events from our server
  eventSource.addEventListener("error", (e) => {
    // SSE spec "error" event — could be server data or connection loss
    if (e.data) {
      try {
        const data = JSON.parse(e.data);
        if (data.code) {
          if (thinkingEl) { thinkingEl.remove(); thinkingEl = null; }
          handleAgentError(data, agentBubble);
          return;
        }
      } catch (_) { /* not JSON, real connection error */ }
    }
    // Real connection error
    if (eventSource.readyState === EventSource.CLOSED) {
      finishStreaming();
      if (thinkingEl) { thinkingEl.remove(); thinkingEl = null; }
    }
  });

  eventSource.addEventListener("stream_stop", () => {
    if (thinkingEl) { thinkingEl.remove(); thinkingEl = null; }
    if (agentBubble) {
      removeCursor(agentBubble);
      appendStoppedIndicator(agentBubble);
    }
    finishStreaming();
    saveHistory();
  });

  eventSource.addEventListener("done", () => {
    if (thinkingEl) { thinkingEl.remove(); thinkingEl = null; }
    if (agentBubble) {
      removeCursor(agentBubble);
      // Append sources list if we have citations
      if (collectedSources.length > 0) {
        appendSourcesList(agentBubble, collectedSources);
      }
    }
    finishStreaming();
    saveHistory();
  });
}

function finishStreaming() {
  isStreaming = false;
  sendBtn.disabled = false;
  stopBtn.classList.remove("visible");
  if (currentEventSource) {
    currentEventSource.close();
    currentEventSource = null;
  }
  chatInput.focus();
}

// ── Stop generation ──────────────────────────────────────────────────
function stopGeneration() {
  if (!currentMessageId) return;
  fetch("/api/chat/stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageId: currentMessageId })
  });
}

// ── DOM Builders ─────────────────────────────────────────────────────
function appendUserMessage(text) {
  const msg = document.createElement("div");
  msg.className = "message user";
  msg.innerHTML = `
    <div class="message-avatar">U</div>
    <div class="message-content">
      <div class="message-bubble">${escapeHtml(text)}</div>
      <div class="message-time">${formatTime()}</div>
    </div>
  `;
  messagesEl.appendChild(msg);
  scrollToBottom();
  saveHistory();
}

function createAgentMessageWrapper() {
  const msg = document.createElement("div");
  msg.className = "message agent";
  msg.innerHTML = `
    <div class="message-avatar">AI</div>
    <div class="message-content">
      <div class="message-bubble"><span class="streaming-cursor"></span></div>
      <div class="message-time">${formatTime()}</div>
    </div>
  `;
  return msg;
}

function appendToken(bubble, text, confidence) {
  // Remove cursor temporarily
  const cursor = bubble.querySelector(".streaming-cursor");

  // Process text for basic markdown (bold, italic)
  let html = processMarkdown(escapeHtml(text));

  // Wrap in confidence span if applicable
  if (confidence && confidence !== "high") {
    const span = document.createElement("span");
    span.className = `confidence-${confidence}`;
    span.innerHTML = html;
    if (cursor) bubble.insertBefore(span, cursor);
    else bubble.appendChild(span);

    // Add badge for medium/low
    if (confidence === "low") {
      const badge = document.createElement("span");
      badge.className = "confidence-badge low";
      badge.textContent = "uncertain";
      if (cursor) bubble.insertBefore(badge, cursor);
      else bubble.appendChild(badge);
    }
  } else {
    const span = document.createElement("span");
    if (confidence === "high") span.className = "confidence-high";
    span.innerHTML = html;
    if (cursor) bubble.insertBefore(span, cursor);
    else bubble.appendChild(span);
  }
}

function appendCitation(bubble, source, number) {
  const cursor = bubble.querySelector(".streaming-cursor");
  const ref = document.createElement("a");
  ref.className = "citation-ref";
  ref.href = "#";
  ref.setAttribute("role", "button");
  ref.setAttribute("aria-label", `Citation ${number}: ${source.title}`);
  ref.textContent = number;
  ref.onclick = (e) => e.preventDefault();

  // Tooltip
  const tooltip = document.createElement("div");
  tooltip.className = "citation-tooltip";
  tooltip.innerHTML = `
    <div class="citation-tooltip-title">${escapeHtml(source.title)}</div>
    <div class="citation-tooltip-passage">"${escapeHtml(source.passage)}"</div>
  `;
  ref.appendChild(tooltip);

  if (cursor) bubble.insertBefore(ref, cursor);
  else bubble.appendChild(ref);
}

function appendSourcesList(bubble, sources) {
  const list = document.createElement("div");
  list.className = "sources-list";
  list.innerHTML = `<div class="sources-list-title">Sources</div>`;
  for (const src of sources) {
    const item = document.createElement("div");
    item.className = "source-item";
    item.innerHTML = `
      <span class="citation-ref" style="cursor:default; font-size:10px; width:16px; height:16px;">${src.number}</span>
      <a href="${escapeHtml(src.url)}" target="_blank" rel="noopener">${escapeHtml(src.title)}</a>
    `;
    list.appendChild(item);
  }
  bubble.appendChild(list);
}

function appendStoppedIndicator(bubble) {
  const el = document.createElement("div");
  el.style.cssText = "margin-top:8px; font-size:12px; color:var(--text-tertiary); font-style:italic;";
  el.textContent = "Response stopped by user";
  bubble.appendChild(el);
}

function removeCursor(bubble) {
  const cursor = bubble.querySelector(".streaming-cursor");
  if (cursor) cursor.remove();
}

// ── Thinking indicator ───────────────────────────────────────────────
function createThinkingIndicator(step) {
  const el = document.createElement("div");
  el.className = "thinking-indicator";
  el.setAttribute("role", "status");
  el.setAttribute("aria-label", step);
  el.innerHTML = `
    <div class="thinking-dots"><span></span><span></span><span></span></div>
    <span>${escapeHtml(step)}</span>
  `;
  return el;
}

// ── HITL Card ────────────────────────────────────────────────────────
function createHITLCard(action) {
  const card = document.createElement("div");
  card.className = "hitl-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", `Action requires approval: ${action.title}`);

  let previewHtml = "";
  if (action.type === "send_email") {
    const p = action.preview;
    previewHtml = `
      <div class="hitl-preview">
        <div class="hitl-preview-label">Email Preview</div>
        <div class="hitl-preview-field"><strong>To:</strong> ${escapeHtml(p.to)}</div>
        <div class="hitl-preview-field"><strong>Subject:</strong> ${escapeHtml(p.subject)}</div>
        <div class="hitl-preview-field">
          <strong>Body:</strong>
          <pre id="hitl-body-preview">${escapeHtml(p.body)}</pre>
        </div>
      </div>
    `;
  } else if (action.type === "execute_sql") {
    const p = action.preview;
    previewHtml = `
      <div class="hitl-preview">
        <div class="hitl-preview-label">SQL Query Preview</div>
        <div class="hitl-preview-field"><strong>Database:</strong> ${escapeHtml(p.database)}</div>
        <div class="hitl-preview-field"><strong>Affected rows:</strong> ${p.affected_rows}</div>
        <div class="hitl-preview-field">
          <strong>Query:</strong>
          <pre id="hitl-query-preview">${escapeHtml(p.query)}</pre>
        </div>
      </div>
      ${p.warning ? `<div class="hitl-warning">&#9888; ${escapeHtml(p.warning)}</div>` : ""}
    `;
  }

  card.innerHTML = `
    <div class="hitl-header">
      <span class="hitl-header-icon">&#9888;</span>
      <span>Action Requires Approval</span>
    </div>
    <div class="hitl-body">
      <div style="font-weight:600; font-size:14px; margin-bottom:6px;">${escapeHtml(action.title)}</div>
      <div class="hitl-description">${escapeHtml(action.description)}</div>
      ${previewHtml}
      <div class="hitl-actions" id="hitl-actions-${action.id}">
        <button class="hitl-btn hitl-btn-approve" onclick="resolveHITL('${action.id}', true)">
          Approve
        </button>
        <button class="hitl-btn hitl-btn-reject" onclick="resolveHITL('${action.id}', false)">
          Reject
        </button>
        <button class="hitl-btn hitl-btn-edit" onclick="toggleHITLEdit('${action.id}', '${action.type}')">
          Edit
        </button>
      </div>
    </div>
  `;

  return card;
}

// ── HITL Edit Toggle ─────────────────────────────────────────────────
window.toggleHITLEdit = function (actionId, actionType) {
  const actionsEl = document.getElementById(`hitl-actions-${actionId}`);
  const card = actionsEl.closest(".hitl-card");

  // Check if already in edit mode
  if (card.querySelector(".hitl-edit-area")) {
    // Remove edit area
    card.querySelectorAll(".hitl-edit-area").forEach(el => el.remove());
    return;
  }

  // Find the preview content to edit
  const preEl = card.querySelector("pre");
  if (preEl) {
    const textarea = document.createElement("textarea");
    textarea.className = "hitl-edit-area";
    textarea.value = preEl.textContent;
    textarea.id = `hitl-edit-${actionId}`;
    preEl.style.display = "none";
    preEl.parentElement.appendChild(textarea);
    textarea.focus();
  }
};

// ── HITL Resolve ─────────────────────────────────────────────────────
window.resolveHITL = async function (actionId, approved) {
  const actionsEl = document.getElementById(`hitl-actions-${actionId}`);
  if (!actionsEl) return;

  // Collect edits if any
  const editArea = document.getElementById(`hitl-edit-${actionId}`);
  const edits = editArea ? { content: editArea.value } : null;

  // Replace buttons with status
  const card = actionsEl.closest(".hitl-body");
  actionsEl.innerHTML = "";
  const statusEl = document.createElement("div");
  statusEl.className = `hitl-resolved ${approved ? "approved" : "rejected"}`;
  statusEl.textContent = approved ? "Approved" : "Rejected";
  card.appendChild(statusEl);

  // Disable edit area
  if (editArea) editArea.disabled = true;

  // Re-add cursor for continuation
  const bubble = card.closest(".message-bubble");
  if (bubble) {
    const cursor = document.createElement("span");
    cursor.className = "streaming-cursor";
    bubble.appendChild(cursor);
  }

  // Send approval to server
  try {
    await fetch("/api/hitl/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionId, approved, edits })
    });
  } catch (err) {
    console.error("Failed to resolve HITL:", err);
  }
};

// ── Error handling ───────────────────────────────────────────────────
function handleAgentError(error, bubble) {
  if (!bubble) return;
  removeCursor(bubble);

  const card = document.createElement("div");
  card.className = "error-card";

  switch (error.code) {
    case "rate_limit": {
      let remaining = error.retry_after || 5;
      card.innerHTML = `
        <div class="error-header">
          <span class="error-icon">&#9201;</span>
          <span class="error-title">Rate Limited</span>
        </div>
        <div class="error-message">Too many requests. Retrying automatically...</div>
        <div class="error-countdown" id="countdown-${Date.now()}">Retrying in ${remaining}s</div>
      `;
      bubble.appendChild(card);
      scrollToBottom();

      // Countdown timer
      const countdownEl = card.querySelector("[id^='countdown-']");
      const interval = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
          clearInterval(interval);
          countdownEl.textContent = "Retrying now...";
        } else {
          countdownEl.textContent = `Retrying in ${remaining}s`;
        }
      }, 1000);
      break;
    }

    case "context_too_long":
      card.innerHTML = `
        <div class="error-header">
          <span class="error-icon">&#128220;</span>
          <span class="error-title">Conversation Too Long</span>
        </div>
        <div class="error-message">${escapeHtml(error.message)}</div>
        <div class="error-actions">
          <button class="error-btn error-btn-primary" onclick="handleSummarize()">Summarize & Continue</button>
          <button class="error-btn" onclick="newChat()">Start New Chat</button>
        </div>
      `;
      bubble.appendChild(card);
      finishStreaming();
      break;

    case "timeout":
      card.innerHTML = `
        <div class="error-header">
          <span class="error-icon">&#9200;</span>
          <span class="error-title">Request Timed Out</span>
        </div>
        <div class="error-message">${escapeHtml(error.message)} (${error.elapsed}s elapsed)</div>
        <div class="error-actions">
          <button class="error-btn error-btn-primary" onclick="retryLastMessage()">Try Again</button>
          <button class="error-btn" onclick="dismissError(this)">Dismiss</button>
        </div>
      `;
      bubble.appendChild(card);
      finishStreaming();
      break;

    case "network_error":
      card.innerHTML = `
        <div class="error-header">
          <span class="error-icon">&#128268;</span>
          <span class="error-title">Connection Lost</span>
        </div>
        <div class="error-message">${escapeHtml(error.message)} Your message was saved -- it will be sent when reconnected.</div>
        <div class="error-actions">
          <button class="error-btn error-btn-primary" onclick="retryLastMessage()">Retry Now</button>
        </div>
      `;
      bubble.appendChild(card);
      connectionStatus.textContent = "Disconnected";
      connectionStatus.style.color = "var(--error-text)";
      finishStreaming();
      break;

    default:
      card.innerHTML = `
        <div class="error-header">
          <span class="error-icon">&#9888;</span>
          <span class="error-title">Something Went Wrong</span>
        </div>
        <div class="error-message">${escapeHtml(error.message || "An unexpected error occurred.")}</div>
        <div class="error-actions">
          <button class="error-btn error-btn-primary" onclick="retryLastMessage()">Try Again</button>
        </div>
      `;
      bubble.appendChild(card);
      finishStreaming();
  }

  scrollToBottom();
  saveHistory();
}

// ── Error action handlers ────────────────────────────────────────────
window.handleSummarize = function () {
  newChat();
  chatInput.value = "Please summarize our previous conversation and continue.";
  sendMessage();
};

window.retryLastMessage = function () {
  connectionStatus.textContent = "Connected";
  connectionStatus.style.color = "";
  // Find last user message
  const userMessages = messagesEl.querySelectorAll(".message.user .message-bubble");
  if (userMessages.length > 0) {
    const lastText = userMessages[userMessages.length - 1].textContent;
    // Remove the last agent message (error response)
    const lastAgent = messagesEl.querySelector(".message.agent:last-child");
    if (lastAgent) lastAgent.remove();
    // Re-send
    currentMessageId = "msg_" + Date.now();
    citationCounter = 0;
    collectedSources = [];
    startStreaming(lastText, currentMessageId);
  }
};

window.dismissError = function (btn) {
  const card = btn.closest(".error-card");
  if (card) card.remove();
};

// ── New Chat ─────────────────────────────────────────────────────────
function newChat() {
  if (isStreaming) stopGeneration();
  messagesEl.innerHTML = "";
  localStorage.removeItem(STORAGE_KEY);
  showWelcome();
  chatInput.focus();
}

function showWelcome() {
  const msg = document.createElement("div");
  msg.className = "message agent";
  msg.innerHTML = `
    <div class="message-avatar">AI</div>
    <div class="message-content">
      <div class="message-bubble">
        <strong>Welcome!</strong> I'm your AI assistant with production UX patterns. Try these scenarios:<br><br>
        <strong>Streaming + Citations:</strong> "What is the refund policy?"<br>
        <strong>HITL Approval:</strong> "Send an email to the customer"<br>
        <strong>SQL Preview:</strong> "Delete duplicate database records"<br>
        <strong>Rate Limit:</strong> "rate limit"<br>
        <strong>Timeout:</strong> "timeout"<br>
        <strong>Network Error:</strong> "network error"
      </div>
      <div class="message-time">${formatTime()}</div>
    </div>
  `;
  messagesEl.appendChild(msg);
}

// ── Persistence ──────────────────────────────────────────────────────
function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, messagesEl.innerHTML);
  } catch (_) { /* localStorage full or unavailable */ }
}

function loadHistory() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      messagesEl.innerHTML = saved;
      // Remove any leftover streaming artifacts
      messagesEl.querySelectorAll(".streaming-cursor").forEach(el => el.remove());
      messagesEl.querySelectorAll(".thinking-indicator").forEach(el => el.remove());
      scrollToBottom();
    }
  } catch (_) { /* localStorage unavailable */ }
}

// ── Utilities ────────────────────────────────────────────────────────
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function processMarkdown(html) {
  // Bold: **text** or __text__
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__(.*?)__/g, "<strong>$1</strong>");
  // Italic: *text* or _text_
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
  // Line breaks
  html = html.replace(/\n/g, "<br>");
  return html;
}

function formatTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}
