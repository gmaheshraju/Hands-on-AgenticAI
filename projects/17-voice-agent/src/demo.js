/**
 * Demo script — starts the server and runs a simulated voice interaction
 * to verify the full pipeline works without a browser or microphone.
 */

import { WebSocket } from 'ws';

// Start the server
await import('./server.js');

// Give the server a moment to bind
await new Promise(r => setTimeout(r, 500));

const PORT = process.env.PORT || 3000;
const ws = new WebSocket(`ws://localhost:${PORT}`);

const responses = [];
let stateLog = [];

ws.on('open', async () => {
  console.log('\n=== Demo: Simulated Voice Interaction ===\n');

  // Helper
  const send = (msg) => ws.send(JSON.stringify(msg));
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  // Listen for messages
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);

    if (msg.type === 'state') {
      stateLog.push(msg.state);
      console.log(`  [State] ${msg.state}  (interruptions: ${msg.interruptionCount})`);
    }
    if (msg.type === 'transcript') {
      const prefix = msg.role === 'user' ? 'USER' : 'AGENT';
      console.log(`  [${prefix}] ${msg.content}`);
      responses.push(msg);
    }
    if (msg.type === 'tts_chunk') {
      // Just note that we received audio
      if (msg.index === 0) console.log(`  [TTS] Streaming ${msg.total} audio chunks...`);
    }
    if (msg.type === 'tts_done') {
      console.log(`  [TTS] Done (interrupted: ${msg.interrupted})`);
    }
  });

  // --- Turn 1: Greeting ---
  console.log('\n--- Turn 1: Hello ---');
  send({ type: 'simulate', text: 'Hello!' });
  await wait(3000);

  // --- Turn 2: Ask for help ---
  console.log('\n--- Turn 2: What can you do? ---');
  send({ type: 'simulate', text: 'What can you help me with?' });
  await wait(4000);

  // --- Turn 3: Interruption test ---
  console.log('\n--- Turn 3: Ask long question then interrupt ---');
  send({ type: 'simulate', text: 'Tell me about the state machine' });
  await wait(500); // Let it start speaking
  console.log('  [Demo] Sending interruption...');
  send({ type: 'simulate', text: 'Actually, tell me a joke instead' });
  await wait(4000);

  // --- Turn 4: Goodbye ---
  console.log('\n--- Turn 4: Goodbye ---');
  send({ type: 'simulate', text: 'Goodbye!' });
  await wait(2000);

  // --- Summary ---
  console.log('\n=== Demo Summary ===');
  console.log(`  Total state transitions: ${stateLog.length}`);
  console.log(`  States visited: ${[...new Set(stateLog)].join(' → ')}`);
  console.log(`  Transcripts exchanged: ${responses.length}`);
  console.log(`  State log: ${stateLog.join(' → ')}`);
  console.log('\n  Open http://localhost:3000 in a browser for the full UI.\n');

  send({ type: 'stop' });
  await wait(500);
  ws.close();
  process.exit(0);
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
  process.exit(1);
});
