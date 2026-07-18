const API = '/api';
let currentThreadId = null;
let currentStreamMsgId = null;
let eventSource = null;

// ── DOM refs ──────────────────────────────────────────────────────

const $messages = document.getElementById('messages');
const $input = document.getElementById('message-input');
const $sendBtn = document.getElementById('send-btn');
const $stopBtn = document.getElementById('stop-btn');
const $threadList = document.getElementById('thread-list');
const $chatTitle = document.getElementById('chat-title');
const $streamStatus = document.getElementById('stream-status');
const $newChatBtn = document.getElementById('new-chat-btn');
const $providerSelect = document.getElementById('provider-select');
const $themeToggle = document.getElementById('theme-toggle');

// ── Init ──────────────────────────────────────────────────────────

async function init() {
  initTheme();
  await loadProviders();
  await loadThreads();
  await loadHarnessStats();

  const hash = window.location.hash.slice(1);
  if (hash) {
    await loadThread(hash);
  } else {
    showEmptyState();
  }

  $input.addEventListener('keydown', handleInputKey);
  $sendBtn.addEventListener('click', sendMessage);
  $stopBtn.addEventListener('click', stopGeneration);
  $newChatBtn.addEventListener('click', newChat);
  $providerSelect.addEventListener('change', handleProviderChange);
  $themeToggle.addEventListener('click', toggleTheme);

  $input.addEventListener('input', autoResize);

  window.addEventListener('hashchange', async () => {
    const id = window.location.hash.slice(1);
    if (id && id !== currentThreadId) await loadThread(id);
  });
}

// ── Theme ─────────────────────────────────────────────────────────

function initTheme() {
  const saved = localStorage.getItem('agent-chat-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const isDark = current === 'dark' ||
    (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const next = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('agent-chat-theme', next);
}

// ── Providers ─────────────────────────────────────────────────────

async function loadProviders() {
  try {
    const res = await fetch(`${API}/providers`);
    const health = await res.json();
    for (const opt of $providerSelect.options) {
      const available = health[opt.value];
      opt.textContent = `${opt.value.charAt(0).toUpperCase() + opt.value.slice(1)} ${available ? '●' : '○'}`;
    }
  } catch { /* ignore */ }
}

async function handleProviderChange() {
  if (!currentThreadId) return;
  try {
    await fetch(`${API}/threads/${currentThreadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: $providerSelect.value }),
    });
  } catch { /* ignore */ }
}

// ── Threads ───────────────────────────────────────────────────────

async function loadThreads() {
  try {
    const res = await fetch(`${API}/threads`);
    const threads = await res.json();
    renderThreadList(threads);
  } catch { /* ignore */ }
}

function renderThreadList(threads) {
  $threadList.innerHTML = '';
  for (const t of threads) {
    const el = document.createElement('div');
    el.className = `thread-item${t.id === currentThreadId ? ' active' : ''}`;
    el.textContent = t.title || 'New conversation';
    el.onclick = () => {
      window.location.hash = t.id;
    };
    $threadList.appendChild(el);
  }
}

async function loadThread(threadId) {
  closeStream();
  currentThreadId = threadId;

  try {
    const res = await fetch(`${API}/threads/${threadId}`);
    if (!res.ok) { showEmptyState(); return; }
    const thread = await res.json();

    $chatTitle.textContent = thread.title || 'New Conversation';
    $providerSelect.value = thread.provider || 'ollama';

    $messages.innerHTML = '';
    for (const msg of thread.messages) {
      renderMessage(msg);
    }
    scrollToBottom();

    if (thread.streaming && thread.activeStreamMsgId) {
      connectToStream(thread.activeStreamMsgId);
    }

    await loadThreads();
  } catch (err) {
    console.error('Failed to load thread:', err);
  }
}

async function newChat() {
  closeStream();
  try {
    const res = await fetch(`${API}/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: $providerSelect.value }),
    });
    const thread = await res.json();
    currentThreadId = thread.id;
    window.location.hash = thread.id;
    $messages.innerHTML = '';
    showEmptyState();
    $chatTitle.textContent = 'New Conversation';
    await loadThreads();
    $input.focus();
  } catch (err) {
    console.error('Failed to create thread:', err);
  }
}

// ── Messages ──────────────────────────────────────────────────────

function renderMessage(msg) {
  removeEmptyState();
  const wrapper = document.createElement('div');
  wrapper.className = `message message-${msg.role}`;
  wrapper.dataset.msgId = msg.id;
  wrapper.dataset.parentId = msg.parentId || '';

  if (msg.role === 'user') {
    wrapper.innerHTML = `
      <div class="message-content">${escapeHtml(msg.content)}</div>
      <div class="message-actions">
        <button class="action-btn edit-btn" onclick="editMessage('${msg.id}', this)">Edit</button>
      </div>
    `;
    if (msg.branchPoint) {
      appendBranchSwitcher(wrapper, msg);
    }
  } else {
    let html = '';

    if (msg.reasoning && msg.reasoning.length > 0) {
      html += renderReasoningBlock(msg.reasoning);
    }

    if (msg.toolCalls && msg.toolCalls.length > 0) {
      html += renderToolCards(msg.toolCalls);
    }

    html += `<div class="message-content">${formatMarkdown(msg.content)}</div>`;

    if (msg.harness) {
      html += renderHarnessMeta(msg.harness, msg.harness.traceId);
    }

    html += `
      <div class="message-actions">
        <button class="action-btn feedback-btn" data-msg="${msg.id}" data-thread="${msg.threadId}" data-run="${msg.harness?.traceId || ''}" data-rating="1" onclick="sendFeedback(this)">&#9650;</button>
        <button class="action-btn feedback-btn" data-msg="${msg.id}" data-thread="${msg.threadId}" data-run="${msg.harness?.traceId || ''}" data-rating="-1" onclick="sendFeedback(this)">&#9660;</button>
        <button class="action-btn" onclick="regenerateMessage('${msg.id}')">Regenerate</button>
      </div>
    `;

    wrapper.innerHTML = html;

    if (msg.branchPoint) {
      appendBranchSwitcher(wrapper, msg);
    }
  }

  $messages.appendChild(wrapper);
}

function renderReasoningBlock(reasoning) {
  const steps = reasoning.map((r, i) =>
    `<div class="reasoning-step"><span class="step-num">${i + 1}</span>${escapeHtml(r)}</div>`
  ).join('');

  return `
    <div class="reasoning-block">
      <button class="reasoning-toggle" onclick="toggleReasoning(this)" aria-expanded="false">
        <span class="arrow">▶</span>
        Reasoning (${reasoning.length} step${reasoning.length !== 1 ? 's' : ''})
      </button>
      <div class="reasoning-body">${steps}</div>
    </div>
  `;
}

function renderToolCards(toolCalls) {
  const cards = toolCalls.map(tc => `
    <div class="tool-card">
      <div class="tool-card-header">
        <span class="tool-name">${escapeHtml(tc.name)}</span>
        <span class="tool-duration">${tc.durationMs}ms</span>
      </div>
      <div class="tool-input">${escapeHtml(JSON.stringify(tc.input))}</div>
      <div class="tool-result">${escapeHtml(tc.result)}</div>
    </div>
  `).join('');

  return `<div class="tool-cards">${cards}</div>`;
}

window.toggleReasoning = function(btn) {
  const expanded = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', String(!expanded));
  btn.nextElementSibling.classList.toggle('open');
};

// ── Branch Switcher ───────────────────────────────────────────────

async function appendBranchSwitcher(wrapper, msg) {
  try {
    const isRootSibling = !msg.parentId && msg.role === 'user';
    const queryId = isRootSibling ? '__root__' : msg.id;

    const res = await fetch(`${API}/threads/${currentThreadId}/branches/${queryId}`);
    const children = await res.json();
    if (children.length <= 1) return;

    const currentChild = isRootSibling ? msg.id : wrapper.dataset.msgId;
    const idx = children.findIndex(c => c.id === currentChild);
    const currentIdx = idx >= 0 ? idx : children.length - 1;

    const switcher = document.createElement('div');
    switcher.className = 'branch-switcher';
    switcher.innerHTML = `
      <button class="branch-btn" data-dir="prev" ${currentIdx === 0 ? 'disabled' : ''}>&lt;</button>
      <span class="branch-label">${currentIdx + 1}/${children.length}</span>
      <button class="branch-btn" data-dir="next" ${currentIdx === children.length - 1 ? 'disabled' : ''}>&gt;</button>
    `;

    switcher.querySelectorAll('.branch-btn').forEach(btn => {
      btn.onclick = async () => {
        const dir = btn.dataset.dir;
        const newIdx = dir === 'prev' ? currentIdx - 1 : currentIdx + 1;
        if (newIdx < 0 || newIdx >= children.length) return;
        await switchBranch(children[newIdx].id);
      };
    });

    wrapper.appendChild(switcher);
  } catch { /* ignore */ }
}

async function switchBranch(messageId) {
  try {
    const res = await fetch(`${API}/threads/${currentThreadId}/chain/${messageId}`);
    const chain = await res.json();

    let lastId = chain[chain.length - 1]?.id;
    while (lastId) {
      const childRes = await fetch(`${API}/threads/${currentThreadId}/branches/${lastId}`);
      const children = await childRes.json();
      if (children.length === 0) break;
      const latest = children[children.length - 1];
      chain.push(latest);
      lastId = latest.id;
    }

    $messages.innerHTML = '';
    for (const msg of chain) renderMessage(msg);
    scrollToBottom();
  } catch (err) {
    console.error('Branch switch failed:', err);
  }
}

// ── Edit & Regenerate ─────────────────────────────────────────────

window.editMessage = function(msgId, btn) {
  const wrapper = btn.closest('.message');
  const content = wrapper.querySelector('.message-content').textContent;
  const parentId = wrapper.dataset.parentId || '__root__';

  const overlay = document.createElement('div');
  overlay.className = 'edit-overlay';
  overlay.innerHTML = `
    <div class="edit-modal">
      <h3>Edit message</h3>
      <textarea>${escapeHtml(content)}</textarea>
      <div class="edit-modal-actions">
        <button class="btn-cancel">Cancel</button>
        <button class="btn-submit">Send</button>
      </div>
    </div>
  `;

  overlay.querySelector('.btn-cancel').onclick = () => overlay.remove();
  overlay.querySelector('.btn-submit').onclick = async () => {
    const newContent = overlay.querySelector('textarea').value.trim();
    overlay.remove();
    if (!newContent) return;
    await sendMessageWithParent(newContent, parentId);
  };

  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
  overlay.querySelector('textarea').focus();
};

window.regenerateMessage = async function(msgId) {
  closeStream();
  try {
    const res = await fetch(`${API}/threads/${currentThreadId}/regenerate/${msgId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const { messageId } = await res.json();
    connectToStream(messageId);
  } catch (err) {
    console.error('Regenerate failed:', err);
  }
};

// ── Send ──────────────────────────────────────────────────────────

async function sendMessage() {
  const content = $input.value.trim();
  if (!content) return;

  if (!currentThreadId) {
    await newChat();
  }

  $input.value = '';
  autoResize();
  await sendMessageWithParent(content, null);
}

async function sendMessageWithParent(content, parentId) {
  closeStream();

  try {
    const res = await fetch(`${API}/threads/${currentThreadId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, parentId }),
    });
    const { messageId } = await res.json();
    connectToStream(messageId);
  } catch (err) {
    console.error('Send failed:', err);
  }
}

// ── SSE Stream ────────────────────────────────────────────────────

function connectToStream(msgId) {
  closeStream();
  currentStreamMsgId = msgId;

  setStreaming(true);
  let streamingEl = null;
  let reasoningSteps = [];
  let toolCards = [];
  let answerStarted = false;

  eventSource = new EventSource(`${API}/threads/${currentThreadId}/stream?msgId=${msgId}`);

  eventSource.addEventListener('user_saved', (e) => {
    const data = JSON.parse(e.data);
    const lastMsg = $messages.querySelector(`[data-msg-id="${data.messageId}"]`);
    if (lastMsg) return;

    removeEmptyState();
    const wrapper = document.createElement('div');
    wrapper.className = 'message message-user';
    wrapper.dataset.msgId = data.messageId;

    const existing = $messages.querySelectorAll('.message-user');
    const lastUser = existing[existing.length - 1];
    const content = lastUser ? 'Sending...' : 'Sending...';

    wrapper.innerHTML = `<div class="message-content">...</div>`;
    $messages.appendChild(wrapper);
    scrollToBottom();
  });

  eventSource.addEventListener('guardrail', (e) => {
    const data = JSON.parse(e.data);
    if (!data.allowed && data.type === 'input') {
      const banner = document.createElement('div');
      banner.className = 'guardrail-banner guardrail-blocked';
      banner.textContent = 'Blocked: Potential prompt injection detected';
      $messages.appendChild(banner);
      scrollToBottom();
    } else if (data.flags?.length > 0) {
      const banner = document.createElement('div');
      banner.className = 'guardrail-banner guardrail-info';
      const types = data.flags.map(f => f.type === 'pii' || f.type === 'pii_leak' ? 'PII redacted' : f.detail).join(', ');
      banner.textContent = `Guardrail: ${types}`;
      $messages.appendChild(banner);
      scrollToBottom();
    }
  });

  eventSource.addEventListener('context_compressed', (e) => {
    const data = JSON.parse(e.data);
    const banner = document.createElement('div');
    banner.className = 'guardrail-banner guardrail-info';
    banner.textContent = `Context compressed: ${data.compressedFrom} older messages summarized`;
    $messages.appendChild(banner);
    scrollToBottom();
  });

  eventSource.addEventListener('stream_start', () => {
    streamingEl = document.createElement('div');
    streamingEl.className = 'message message-assistant';
    streamingEl.dataset.msgId = 'streaming';
    $messages.appendChild(streamingEl);
    scrollToBottom();
  });

  eventSource.addEventListener('reasoning', (e) => {
    const data = JSON.parse(e.data);
    reasoningSteps.push(data.thought);
    updateStreamingMessage(streamingEl, reasoningSteps, toolCards, '', false);
    scrollToBottom();
  });

  eventSource.addEventListener('tool_start', (e) => {
    const data = JSON.parse(e.data);
    toolCards.push({ name: data.name, input: data.input, result: null, durationMs: null });
    updateStreamingMessage(streamingEl, reasoningSteps, toolCards, '', false);
    scrollToBottom();
  });

  eventSource.addEventListener('tool_result', (e) => {
    const data = JSON.parse(e.data);
    const card = toolCards.find(tc => tc.name === data.name && tc.result === null);
    if (card) {
      card.result = data.result;
      card.durationMs = data.durationMs;
    }
    updateStreamingMessage(streamingEl, reasoningSteps, toolCards, '', false);
    scrollToBottom();
  });

  eventSource.addEventListener('stream_answer_start', () => {
    answerStarted = true;
  });

  eventSource.addEventListener('token', (e) => {
    const data = JSON.parse(e.data);
    if (!streamingEl) return;

    let contentEl = streamingEl.querySelector('.answer-content');
    if (!contentEl) {
      const div = document.createElement('div');
      div.className = 'message-content streaming-cursor answer-content';
      streamingEl.appendChild(div);
    }
    contentEl = streamingEl.querySelector('.answer-content');
    contentEl.textContent += data.text;
    scrollToBottom();
  });

  eventSource.addEventListener('done', async (e) => {
    const data = JSON.parse(e.data);
    closeStream();

    if (data.harness && streamingEl) {
      appendHarnessMeta(streamingEl, data.harness, data.traceId);
    }

    await loadThread(currentThreadId);
    await loadHarnessStats();
  });

  eventSource.addEventListener('error', (e) => {
    if (e.data) {
      const data = JSON.parse(e.data);
      console.error('Stream error:', data);
      if (streamingEl) {
        streamingEl.innerHTML += `<div class="message-content" style="color:var(--danger)">Error: ${escapeHtml(data.message)}</div>`;
      }
    }
    closeStream();
  });

  eventSource.addEventListener('history', (e) => {
    const data = JSON.parse(e.data);
    $messages.innerHTML = '';
    for (const msg of data.messages) renderMessage(msg);
    scrollToBottom();
  });

  eventSource.addEventListener('no_stream', () => {
    closeStream();
  });

  eventSource.onerror = () => {
    if (currentStreamMsgId === msgId) {
      setTimeout(() => {
        if (currentStreamMsgId === msgId) {
          connectToStream(msgId);
        }
      }, 2000);
    }
  };
}

function updateStreamingMessage(el, reasoning, tools, answer, streaming) {
  if (!el) return;

  let html = '';

  if (reasoning.length > 0) {
    html += renderReasoningBlock(reasoning);
    const toggle = el.querySelector('.reasoning-toggle');
    if (!toggle) {
      const block = el.querySelector('.reasoning-block');
      if (block) {
        const btn = block.querySelector('.reasoning-toggle');
        if (btn) btn.setAttribute('aria-expanded', 'true');
        const body = block.querySelector('.reasoning-body');
        if (body) body.classList.add('open');
      }
    }
  }

  if (tools.length > 0) {
    const cards = tools.map(tc => {
      if (tc.result === null) {
        return `
          <div class="tool-card">
            <div class="tool-card-header">
              <span class="tool-name">${escapeHtml(tc.name)}</span>
              <span class="tool-spinner"></span>
            </div>
            <div class="tool-input">${escapeHtml(JSON.stringify(tc.input))}</div>
          </div>
        `;
      }
      return `
        <div class="tool-card">
          <div class="tool-card-header">
            <span class="tool-name">${escapeHtml(tc.name)}</span>
            <span class="tool-duration">${tc.durationMs}ms</span>
          </div>
          <div class="tool-input">${escapeHtml(JSON.stringify(tc.input))}</div>
          <div class="tool-result">${escapeHtml(tc.result)}</div>
        </div>
      `;
    }).join('');
    html += `<div class="tool-cards">${cards}</div>`;
  }

  const existingAnswer = el.querySelector('.answer-content');
  const answerText = existingAnswer ? existingAnswer.textContent : '';

  el.innerHTML = html;

  if (answerText) {
    const div = document.createElement('div');
    div.className = 'message-content streaming-cursor answer-content';
    div.textContent = answerText;
    el.appendChild(div);
  }

  const newToggle = el.querySelector('.reasoning-toggle');
  if (newToggle) {
    newToggle.setAttribute('aria-expanded', 'true');
    const body = newToggle.nextElementSibling;
    if (body) body.classList.add('open');
  }
}

function closeStream() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  currentStreamMsgId = null;
  setStreaming(false);

  const cursor = $messages.querySelector('.streaming-cursor');
  if (cursor) cursor.classList.remove('streaming-cursor');
}

async function stopGeneration() {
  if (!currentStreamMsgId) return;
  try {
    await fetch(`${API}/chat/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: currentStreamMsgId }),
    });
  } catch { /* ignore */ }
  closeStream();
}

// ── UI Helpers ─────────────────────────────────────────────────────

function setStreaming(active) {
  $sendBtn.classList.toggle('hidden', active);
  $stopBtn.classList.toggle('hidden', !active);
  $streamStatus.classList.toggle('hidden', !active);
  $streamStatus.textContent = active ? 'Generating...' : '';
  $input.disabled = active;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    $messages.scrollTop = $messages.scrollHeight;
  });
}

function autoResize() {
  $input.style.height = 'auto';
  $input.style.height = Math.min($input.scrollHeight, 200) + 'px';
}

function handleInputKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function showEmptyState() {
  $messages.innerHTML = `
    <div class="empty-state">
      <h2>Agent Chat</h2>
      <p>A production-grade AI agent with streaming reasoning, tool execution, conversation branching, and stream reconnection.</p>
      <div class="features-grid">
        <div class="feature-card">
          <h3>Streaming Reasoning</h3>
          <p>Watch the agent think step-by-step before answering</p>
        </div>
        <div class="feature-card">
          <h3>Reconnection</h3>
          <p>Refresh the page mid-stream — it picks up where it left off</p>
        </div>
        <div class="feature-card">
          <h3>Branching</h3>
          <p>Edit any message to fork the conversation, switch between branches</p>
        </div>
      </div>
    </div>
  `;
}

function removeEmptyState() {
  const empty = $messages.querySelector('.empty-state');
  if (empty) empty.remove();
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMarkdown(text) {
  if (!text) return '';
  let html = escapeHtml(text);

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  return `<p>${html}</p>`;
}

// ── Harness Meta ─────────────────────────────────────────────────

function renderHarnessMeta(h, traceId) {
  const parts = [];

  if (h.strategy) {
    const stratLabel = { direct: 'direct', single_tool: '1 tool', multi_tool: 'multi-tool', iterative: 'iterative' }[h.strategy] || h.strategy;
    parts.push(stratLabel);
  }
  if (h.totalTokens) parts.push(`${h.totalTokens} tok`);
  if (h.latencyMs) parts.push(`${(h.latencyMs / 1000).toFixed(1)}s`);
  if (h.toolRoi !== null && h.toolRoi !== undefined && h.toolCallCount > 0) {
    const roiPct = Math.round(h.toolRoi * 100);
    parts.push(`ROI ${roiPct}%`);
  }
  if (h.coherence !== null && h.coherence !== undefined) {
    const cPct = Math.round(h.coherence * 100);
    parts.push(`coherence ${cPct}%`);
  }
  if (h.provider) parts.push(h.provider);
  if (h.resumedFromInterrupt) parts.push('resumed');
  if (traceId) parts.push(`<a class="trace-link" onclick="showTrace('${traceId}')">Inspect run</a>`);

  if (parts.length === 0) return '';
  return `<div class="harness-meta">${parts.join(' · ')}</div>`;
}

function appendHarnessMeta(el, harness, traceId) {
  if (!el) return;
  const existing = el.querySelector('.harness-meta');
  if (existing) existing.remove();
  const html = renderHarnessMeta(harness, traceId);
  if (html) el.insertAdjacentHTML('beforeend', html);
}

// ── Harness Stats Panel ──────────────────────────────────────────

async function loadHarnessStats() {
  try {
    const res = await fetch(`${API}/harness/stats`);
    const stats = await res.json();
    renderHarnessStats(stats);
  } catch { /* ignore */ }
}

function renderHarnessStats(stats) {
  const panel = document.getElementById('harness-panel');
  if (!panel) return;

  if (!stats.tools || stats.tools.length === 0) {
    panel.innerHTML = '<div class="harness-empty">No tool usage yet</div>';
    return;
  }

  const rows = stats.tools.map(t => `
    <div class="harness-stat-row">
      <span class="harness-stat-name">${escapeHtml(t.tool_name)}</span>
      <span class="harness-stat-calls">${t.total_calls}x</span>
      <span class="harness-stat-rate">${t.success_rate}%</span>
      <span class="harness-stat-latency">${t.avg_latency_ms}ms</span>
    </div>
  `).join('');

  panel.innerHTML = `
    <div class="harness-stats-header">Tool Intelligence</div>
    <div class="harness-stats-total">${stats.totalLessons} lessons learned</div>
    ${rows}
  `;
}

// ── Feedback ────────────────────────────────────────────────────

window.sendFeedback = async function(btn) {
  const messageId = btn.dataset.msg;
  const threadId = btn.dataset.thread;
  const runId = btn.dataset.run || null;
  const rating = parseInt(btn.dataset.rating, 10);

  const actions = btn.closest('.message-actions');
  const allBtns = actions.querySelectorAll('.feedback-btn');
  allBtns.forEach(b => b.classList.remove('feedback-active-up', 'feedback-active-down'));

  btn.classList.add(rating === 1 ? 'feedback-active-up' : 'feedback-active-down');

  try {
    await fetch(`${API}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId, threadId, runId, rating }),
    });
  } catch (err) {
    console.error('Feedback failed:', err);
  }
};

// ── Trace Viewer ────────────────────────────────────────────────

window.showTrace = async function(traceId) {
  if (!traceId) return;
  try {
    const res = await fetch(`${API}/runs/${traceId}`);
    const run = await res.json();
    renderRunModal(run);
  } catch (err) {
    console.error('Failed to load agent run:', err);
  }
};

function renderRunModal(run) {
  const overlay = document.createElement('div');
  overlay.className = 'edit-overlay';

  const roiPct = Math.round((run.tool_roi_score || 0) * 100);
  const coherencePct = Math.round((run.reasoning_coherence || 0) * 100);
  const totalDecisions = run.total_decisions || 0;
  const productive = run.productive_decisions || 0;
  const wasted = run.wasted_decisions || 0;
  const productivityPct = totalDecisions > 0 ? Math.round((productive / totalDecisions) * 100) : 100;

  const outcomeClass = run.outcome === 'answered' ? 'run-ok' : run.outcome === 'blocked' ? 'run-blocked' : 'run-error';
  const strategyLabel = { direct: 'Direct answer', single_tool: 'Single tool', multi_tool: 'Multi-tool', iterative: 'Iterative' }[run.strategy] || run.strategy;

  const scoreBar = (label, value, color) => `
    <div class="score-row">
      <span class="score-label">${label}</span>
      <div class="score-bar-track">
        <div class="score-bar-fill" style="width:${value}%;background:${color}"></div>
      </div>
      <span class="score-value">${value}%</span>
    </div>
  `;

  const decisionRows = (run.decisions || []).map((d, i) => {
    const prodIcon = d.productive === true ? '&#10003;' : d.productive === false ? '&#10007;' : '&#8212;';
    const prodClass = d.productive === true ? 'decision-productive' : d.productive === false ? 'decision-wasted' : 'decision-neutral';
    const signals = (d.confidenceSignals || []).map(s =>
      `<span class="signal-chip signal-${s}">${s.replace('_', ' ')}</span>`
    ).join('');

    const toolInfo = d.action !== 'respond' && d.tool_result
      ? `<div class="decision-tool">
          <span class="decision-tool-name">${escapeHtml(d.action)}</span>
          ${d.tool_duration_ms ? `<span class="decision-tool-lat">${d.tool_duration_ms}ms</span>` : ''}
          <span class="decision-tool-roi ${d.toolResultUsed ? 'roi-used' : 'roi-unused'}">${d.toolResultUsed ? 'Used in answer' : 'Not used'}</span>
        </div>`
      : '';

    return `
      <div class="decision-row ${prodClass}">
        <div class="decision-header">
          <span class="decision-seq">${i + 1}</span>
          <span class="decision-prod-icon ${prodClass}">${prodIcon}</span>
          <span class="decision-action">${d.action === 'respond' ? 'Respond' : escapeHtml(d.action)}</span>
          <span class="decision-latency">${d.latency_ms}ms</span>
          <span class="decision-tokens">${d.tokens_in + d.tokens_out} tok</span>
        </div>
        <div class="decision-thought">${escapeHtml(d.thought)}</div>
        ${signals ? `<div class="decision-signals">${signals}</div>` : ''}
        ${toolInfo}
      </div>
    `;
  }).join('');

  overlay.innerHTML = `
    <div class="run-modal">
      <div class="run-modal-header">
        <h3>Agent Run</h3>
        <button class="trace-close" onclick="this.closest('.edit-overlay').remove()">&times;</button>
      </div>

      <div class="run-query">${escapeHtml(run.user_message)}</div>

      <div class="run-report-card">
        <div class="report-row">
          <div class="report-metric">
            <span class="report-metric-label">Outcome</span>
            <span class="report-metric-value ${outcomeClass}">${run.outcome}</span>
          </div>
          <div class="report-metric">
            <span class="report-metric-label">Strategy</span>
            <span class="report-metric-value">${strategyLabel}</span>
          </div>
          <div class="report-metric">
            <span class="report-metric-label">Duration</span>
            <span class="report-metric-value">${((run.duration_ms || 0) / 1000).toFixed(1)}s</span>
          </div>
          <div class="report-metric">
            <span class="report-metric-label">Tokens</span>
            <span class="report-metric-value">${(run.tokens_in || 0) + (run.tokens_out || 0)}</span>
          </div>
        </div>

        <div class="report-scores">
          ${scoreBar('Decision quality', productivityPct, productivityPct >= 80 ? '#22C55E' : productivityPct >= 50 ? '#F97316' : '#EF4444')}
          ${scoreBar('Tool ROI', roiPct, roiPct >= 80 ? '#22C55E' : roiPct >= 50 ? '#F97316' : '#EF4444')}
          ${scoreBar('Reasoning coherence', coherencePct, coherencePct >= 80 ? '#22C55E' : coherencePct >= 50 ? '#F97316' : '#EF4444')}
        </div>

        <div class="report-summary-row">
          <span class="report-chip productive-chip">${productive} productive</span>
          ${wasted > 0 ? `<span class="report-chip wasted-chip">${wasted} wasted</span>` : ''}
          ${run.provider ? `<span class="report-chip">${run.provider}</span>` : ''}
        </div>
      </div>

      <div class="decision-chain-header">Decision Chain</div>
      <div class="decision-chain">
        ${decisionRows || '<div class="decision-empty">No decisions recorded</div>'}
      </div>
    </div>
  `;

  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}

// ── Boot ──────────────────────────────────────────────────────────

init();
