/**
 * Voice Agent — Browser client.
 *
 * Handles:
 *   - WebSocket connection to server
 *   - Web Audio API microphone capture + RMS computation
 *   - Audio playback queue for TTS chunks
 *   - Waveform visualization on canvas
 *   - Simulate-voice mode (text input → server pipeline)
 */

/* ── State ────────────────────────────────────────────────── */
let ws = null;
let audioContext = null;
let micStream = null;
let micProcessor = null;
let analyserNode = null;
let isRecording = false;
let agentState = 'IDLE';
let animFrameId = null;

// Audio playback queue
let playbackQueue = [];
let isPlaying = false;

/* ── DOM refs (set in init) ───────────────────────────────── */
let dom = {};

/* ── Init ─────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  dom = {
    btnStart:     document.getElementById('btn-start'),
    btnStop:      document.getElementById('btn-stop'),
    btnMic:       document.getElementById('btn-mic'),
    btnInterrupt: document.getElementById('btn-interrupt'),
    simInput:     document.getElementById('sim-input'),
    btnSimSend:   document.getElementById('btn-sim-send'),
    transcript:   document.getElementById('transcript'),
    canvas:       document.getElementById('waveform'),
    connDot:      document.getElementById('conn-dot'),
    connText:     document.getElementById('conn-text'),
    statePills:   document.querySelectorAll('.state-pill'),
    metaState:    document.getElementById('meta-state'),
    metaInterrupt:document.getElementById('meta-interrupts'),
    quickPhrases: document.querySelectorAll('.quick-phrase'),
  };

  dom.btnStart.addEventListener('click', startConversation);
  dom.btnStop.addEventListener('click', stopConversation);
  dom.btnMic.addEventListener('click', toggleMic);
  dom.btnInterrupt.addEventListener('click', sendInterrupt);
  dom.btnSimSend.addEventListener('click', sendSimulatedVoice);
  dom.simInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendSimulatedVoice();
  });
  dom.quickPhrases.forEach(el => {
    el.addEventListener('click', () => {
      dom.simInput.value = el.dataset.text;
      sendSimulatedVoice();
    });
  });

  connectWebSocket();
  initCanvas();
});

/* ── WebSocket ────────────────────────────────────────────── */
function connectWebSocket() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}`);

  ws.onopen = () => {
    dom.connDot.classList.add('connected');
    dom.connText.textContent = 'Connected';
    updateButtons();
  };

  ws.onclose = () => {
    dom.connDot.classList.remove('connected');
    dom.connText.textContent = 'Disconnected';
    agentState = 'IDLE';
    updateState();
    setTimeout(connectWebSocket, 2000);
  };

  ws.onerror = () => {};

  ws.onmessage = (evt) => {
    const msg = JSON.parse(evt.data);
    handleServerMessage(msg);
  };
}

function wsSend(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

/* ── Server message handling ──────────────────────────────── */
function handleServerMessage(msg) {
  switch (msg.type) {
    case 'state':
      agentState = msg.state;
      updateState();
      dom.metaInterrupt.innerHTML = `Interruptions: <strong>${msg.interruptionCount}</strong>`;
      break;

    case 'transcript':
      addTranscriptTurn(msg.role, msg.content, msg.interrupted);
      break;

    case 'tts_chunk':
      enqueueTTSChunk(msg);
      break;

    case 'tts_done':
      if (msg.interrupted) {
        // Clear playback queue on interruption
        playbackQueue = [];
        isPlaying = false;
      }
      break;

    case 'history':
      renderHistory(msg.turns);
      break;

    case 'error':
      console.error('[Server]', msg.message);
      break;
  }
}

/* ── State UI update ──────────────────────────────────────── */
function updateState() {
  dom.statePills.forEach(pill => {
    pill.classList.toggle('active', pill.dataset.state === agentState);
  });
  dom.metaState.innerHTML = `Current: <strong>${agentState}</strong>`;
  updateButtons();
}

function updateButtons() {
  const connected = ws && ws.readyState === WebSocket.OPEN;
  const active = agentState !== 'IDLE';

  dom.btnStart.disabled = !connected || active;
  dom.btnStop.disabled = !connected || !active;
  dom.btnMic.disabled = !connected || !active;
  dom.btnInterrupt.disabled = !connected || agentState !== 'SPEAKING';
  dom.btnSimSend.disabled = !connected || !active;
  dom.simInput.disabled = !connected || !active;
}

/* ── Conversation controls ────────────────────────────────── */
function startConversation() {
  wsSend({ type: 'start' });
  dom.transcript.innerHTML = '<div class="transcript-empty">Conversation started. Speak or type below.</div>';
}

function stopConversation() {
  stopMic();
  wsSend({ type: 'stop' });
  playbackQueue = [];
  isPlaying = false;
}

/* ── Microphone ───────────────────────────────────────────── */
async function toggleMic() {
  if (isRecording) {
    stopMic();
  } else {
    await startMic();
  }
}

async function startMic() {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const source = audioContext.createMediaStreamSource(micStream);

    // Analyser for visualization
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;
    source.connect(analyserNode);

    // ScriptProcessor for sending audio chunks (deprecated but widely supported)
    micProcessor = audioContext.createScriptProcessor(4096, 1, 1);
    micProcessor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const float32 = new Float32Array(inputData);

      // Convert to base64
      const buffer = new ArrayBuffer(float32.byteLength);
      new Float32Array(buffer).set(float32);
      const base64 = arrayBufferToBase64(buffer);

      wsSend({ type: 'audio', data: base64 });
    };

    source.connect(micProcessor);
    micProcessor.connect(audioContext.destination);

    isRecording = true;
    dom.btnMic.textContent = 'Stop Mic';
    dom.btnMic.classList.add('btn-danger');
    dom.btnMic.classList.remove('btn-green');

    startWaveformAnimation();
  } catch (err) {
    console.error('Microphone error:', err);
    alert('Could not access microphone. Use the simulate input instead.');
  }
}

function stopMic() {
  if (micProcessor) { micProcessor.disconnect(); micProcessor = null; }
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  if (audioContext) { audioContext.close(); audioContext = null; }
  analyserNode = null;
  isRecording = false;

  dom.btnMic.textContent = 'Start Mic';
  dom.btnMic.classList.remove('btn-danger');
  dom.btnMic.classList.add('btn-green');

  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
}

/* ── Simulate voice ───────────────────────────────────────── */
function sendSimulatedVoice() {
  const text = dom.simInput.value.trim();
  if (!text) return;
  wsSend({ type: 'simulate', text });
  dom.simInput.value = '';
}

function sendInterrupt() {
  wsSend({ type: 'interrupt' });
}

/* ── TTS audio playback ──────────────────────────────────── */
function enqueueTTSChunk(chunk) {
  playbackQueue.push(chunk);
  if (!isPlaying) playNext();
}

async function playNext() {
  if (playbackQueue.length === 0) {
    isPlaying = false;
    return;
  }
  isPlaying = true;
  const chunk = playbackQueue.shift();

  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const raw = base64ToArrayBuffer(chunk.audio);
    const float32 = new Float32Array(raw);

    const buffer = ctx.createBuffer(1, float32.length, chunk.sampleRate || 16000);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => {
      ctx.close();
      playNext();
    };
    source.start();
  } catch (e) {
    console.error('Playback error:', e);
    playNext();
  }
}

/* ── Transcript rendering ─────────────────────────────────── */
function addTranscriptTurn(role, content, interrupted) {
  // Remove "conversation started" placeholder
  const empty = dom.transcript.querySelector('.transcript-empty');
  if (empty) empty.remove();

  const div = document.createElement('div');
  div.className = 'turn';

  const badge = document.createElement('span');
  badge.className = `turn-badge ${role}`;
  badge.textContent = role === 'user' ? 'YOU' : 'AI';

  const text = document.createElement('span');
  text.className = `turn-content${interrupted ? ' interrupted' : ''}`;
  text.textContent = content;

  div.appendChild(badge);
  div.appendChild(text);
  dom.transcript.appendChild(div);
  dom.transcript.scrollTop = dom.transcript.scrollHeight;
}

function renderHistory(turns) {
  dom.transcript.innerHTML = '';
  if (turns.length === 0) {
    dom.transcript.innerHTML = '<div class="transcript-empty">Conversation started. Speak or type below.</div>';
    return;
  }
  turns.forEach(t => addTranscriptTurn(t.role, t.content, t.interrupted));
}

/* ── Waveform visualization ───────────────────────────────── */
function initCanvas() {
  const canvas = dom.canvas;
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth * 2;
  canvas.height = canvas.offsetHeight * 2;
  ctx.scale(2, 2);
  drawIdleWaveform(ctx, canvas.offsetWidth, canvas.offsetHeight);
}

function drawIdleWaveform(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#2e3345';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();
}

function startWaveformAnimation() {
  const canvas = dom.canvas;
  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth;
  const h = canvas.offsetHeight;

  function draw() {
    if (!analyserNode) return;

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserNode.getByteTimeDomainData(dataArray);

    ctx.clearRect(0, 0, w, h);

    // Color based on state
    let color;
    switch (agentState) {
      case 'LISTENING':   color = '#34d399'; break;
      case 'PROCESSING':  color = '#fbbf24'; break;
      case 'SPEAKING':    color = '#6c63ff'; break;
      case 'INTERRUPTED': color = '#f87171'; break;
      default:            color = '#2e3345';
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    const sliceWidth = w / bufferLength;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * h) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Glow effect
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;

    animFrameId = requestAnimationFrame(draw);
  }

  draw();
}

/* ── Utilities ────────────────────────────────────────────── */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
