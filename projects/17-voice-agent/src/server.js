/**
 * Real-Time Voice Agent — WebSocket + Express server.
 *
 * Protocol (client ↔ server JSON messages over WebSocket):
 *
 *   Client → Server:
 *     { type: 'audio',       data: base64-encoded PCM chunk }
 *     { type: 'simulate',    text: 'user utterance' }
 *     { type: 'start' }
 *     { type: 'stop' }
 *     { type: 'interrupt' }
 *
 *   Server → Client:
 *     { type: 'state',       state, interruptionCount, partialTranscript }
 *     { type: 'transcript',  role, content, interrupted }
 *     { type: 'tts_chunk',   audio: base64, index, total, text }
 *     { type: 'tts_done' }
 *     { type: 'history',     turns: [...] }
 *     { type: 'error',       message }
 */

import { createServer } from 'http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { TurnManager, STATES } from './turnManager.js';
import { MockSTT } from './speechToText.js';
import { ConversationEngine } from './conversationEngine.js';
import { MockTTS } from './textToSpeech.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3000;

/* ── Express setup ────────────────────────────────────────── */

const app = express();
app.use(express.static(join(__dirname, '..', 'public')));

const httpServer = createServer(app);

/* ── WebSocket setup ──────────────────────────────────────── */

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');

  // Per-connection instances
  const turnManager = new TurnManager({ silenceThresholdMs: 1500, vadThreshold: 0.02 });
  const stt = new MockSTT();
  const engine = new ConversationEngine();
  const tts = new MockTTS();

  // Send state updates to client
  const sendState = () => {
    safeSend(ws, { type: 'state', ...turnManager.getStatus() });
  };

  // ── TurnManager event wiring ──────────────────────────────

  turnManager.on('stateChange', ({ from, to }) => {
    console.log(`[State] ${from} → ${to}`);
    sendState();

    if (to === STATES.INTERRUPTED) {
      // Cancel TTS immediately
      tts.cancel();
      engine.handleInterruption();
      safeSend(ws, { type: 'tts_done', interrupted: true });
    }
  });

  turnManager.on('endpointDetected', async ({ transcript }) => {
    if (!transcript) return;
    await processUtterance(transcript);
  });

  turnManager.on('interruptionDetected', ({ count }) => {
    console.log(`[Interrupt] #${count} detected`);
  });

  // ── Core pipeline ─────────────────────────────────────────

  async function processUtterance(text) {
    try {
      // 1. Send user transcript to client
      safeSend(ws, { type: 'transcript', role: 'user', content: text });

      // 2. Conversation engine generates response
      const response = await engine.processUserInput(text);

      // 3. If we were interrupted during processing, abort
      if (turnManager.currentState === STATES.INTERRUPTED ||
          turnManager.currentState === STATES.LISTENING) {
        return;
      }

      // 4. Transition to SPEAKING
      turnManager.onResponseReady();

      // 5. Send assistant transcript
      safeSend(ws, { type: 'transcript', role: 'assistant', content: response.text });

      // 6. Stream TTS chunks
      const result = await tts.synthesize(response.text, (chunk) => {
        // Convert Float32Array to base64 for transport
        const buffer = Buffer.from(chunk.audio.buffer);
        safeSend(ws, {
          type: 'tts_chunk',
          audio: buffer.toString('base64'),
          index: chunk.index,
          total: chunk.total,
          text: chunk.text,
          sampleRate: chunk.sampleRate,
        });
      });

      // 7. TTS finished (or was cancelled by interruption)
      if (result.completed) {
        safeSend(ws, { type: 'tts_done', interrupted: false });
        turnManager.onSpeakingComplete();
      }
    } catch (err) {
      console.error('[Pipeline] Error:', err);
      safeSend(ws, { type: 'error', message: err.message });
    }
  }

  // ── Message handler ───────────────────────────────────────

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return safeSend(ws, { type: 'error', message: 'Invalid JSON' });
    }

    switch (msg.type) {
      case 'start':
        stt.reset();
        engine.reset();
        turnManager.startConversation();
        safeSend(ws, { type: 'history', turns: [] });
        break;

      case 'stop':
        tts.cancel();
        turnManager.endConversation();
        break;

      case 'audio': {
        // Decode base64 audio and compute RMS energy
        const buffer = Buffer.from(msg.data, 'base64');
        const float32 = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
        const rms = computeRMS(float32);

        stt.feedAudio(float32);
        turnManager.onAudioEnergy(rms);
        break;
      }

      case 'simulate': {
        // Simulate voice input with text — full pipeline without microphone
        const text = msg.text?.trim();
        if (!text) break;

        stt.setNextTranscript(text);

        if (turnManager.currentState === STATES.IDLE) {
          turnManager.startConversation();
        }

        // Use onCompleteUtterance which handles interruption if SPEAKING
        turnManager.onCompleteUtterance(text);

        // Now process it
        await processUtterance(text);
        break;
      }

      case 'interrupt': {
        // Manual interruption trigger (for testing)
        if (turnManager.currentState === STATES.SPEAKING) {
          turnManager.onAudioEnergy(1.0); // Simulate loud voice activity
        }
        break;
      }

      case 'get_history':
        safeSend(ws, { type: 'history', turns: engine.getHistory() });
        break;

      default:
        safeSend(ws, { type: 'error', message: `Unknown message type: ${msg.type}` });
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
    tts.cancel();
    turnManager.endConversation();
  });

  // Send initial state
  sendState();
});

/* ── Helpers ──────────────────────────────────────────────── */

function computeRMS(samples) {
  if (!samples || samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

function safeSend(ws, data) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

/* ── Start ────────────────────────────────────────────────── */

httpServer.listen(PORT, () => {
  console.log(`\n  Voice Agent server running at http://localhost:${PORT}\n`);
});

export { app, httpServer, wss };
