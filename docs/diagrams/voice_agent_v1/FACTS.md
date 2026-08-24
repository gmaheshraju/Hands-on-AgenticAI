# FACTS — 17-voice-agent (L1 architecture, extracted 2026-08-24)

Source of truth: `projects/17-voice-agent/src/` (n=5 files, 659 lines) and
`projects/17-voice-agent/public/voice.js` (401 lines).
**Every element in the diagram appears below with a `file:line` citation. The
diagram may contain nothing that is not on this page, and this page may contain
nothing without a citation.** The project README ships an ASCII diagram
(README.md lines 7-16); it was treated as a **claim**, not as evidence — and two
of its arrows do not survive contact with the code (see the MIC DEAD PATH card
below). Every fact here was read from source.

Altitude: **L1 — space** (where things live, what talks to what, what crosses a
boundary), per `DIAGRAM_RULES.md`. The five-state turn-taking FSM is an **L2**
concern (states + legal transitions) and is deliberately NOT drawn here; only
the box that owns it is.

---

## Process & transport — `src/server.js`

| Fact | Citation |
|---|---|
| One Node ESM process; `"type": "module"`, entry `src/server.js` | package.json (`main`, `scripts.start`) |
| Express app; static file serving of `public/` | server.js:40, :41 |
| HTTP server created from the Express app | server.js:43 |
| `WebSocketServer` attached to the **same** HTTP server (one port, two protocols) | server.js:47 |
| Port is `process.env.PORT \|\| 3000` | server.js:36 |
| Per-connection handler `wss.on('connection', …)` | server.js:49 |
| Inbound message handler + JSON parse guard | server.js:135, :140 |
| `safeSend` — every outbound write is gated on `readyState === OPEN` | server.js:224-227 |
| `computeRMS(samples)` — energy of one audio chunk, computed server-side | server.js:215-222 |
| `httpServer.listen(PORT)` | server.js:232 |

### Per-connection instances — four objects, constructed fresh per socket

| Instance | Citation |
|---|---|
| `new TurnManager({ silenceThresholdMs: 1500, vadThreshold: 0.02 })` | server.js:53 |
| `new MockSTT()` | server.js:54 |
| `new ConversationEngine()` | server.js:55 |
| `new MockTTS()` | server.js:56 |

No state is shared between connections — every one of the four is created inside
the `connection` callback (server.js:49, :52-56).

### The response pipeline — `processUtterance(text)`

| Step | Citation |
|---|---|
| Declared | server.js:88 |
| 1. emit user transcript | server.js:91 |
| 2. `engine.processUserInput(text)` | server.js:94 |
| 3. abort if state is INTERRUPTED or LISTENING | server.js:97-100 |
| 4. `turnManager.onResponseReady()` → SPEAKING | server.js:103 |
| 5. emit assistant transcript | server.js:106 |
| 6. `tts.synthesize(text, onChunk)` streams chunks | server.js:109 |
| 7. `tts_done` + `onSpeakingComplete()` only when `result.completed` | server.js:123, :124, :125 |
| any throw → `{ type: 'error' }` to the client | server.js:127-130 |

## Turn-taking — `src/turnManager.js`

| Fact | Citation |
|---|---|
| `export class TurnManager` | turnManager.js:35 |
| Five frozen states: IDLE, LISTENING, PROCESSING, SPEAKING, INTERRUPTED | turnManager.js:21-27 |
| `DEFAULT_SILENCE_THRESHOLD_MS = 1500` (endpointing) | turnManager.js:30 |
| `DEFAULT_VAD_THRESHOLD = 0.02` (RMS 0-1 scale) | turnManager.js:33 |
| `interruptionCount` — quality metric, per connection | turnManager.js:48 |
| `partialTranscript` — initialised to `''` | turnManager.js:50 |
| `onAudioEnergy(rmsLevel)` — the only VAD entry point | turnManager.js:80, :81 |
| Endpointing timer set on each speech frame while LISTENING | turnManager.js:83-87, :151-158 |
| `onCompleteUtterance(text)` — skips endpointing | turnManager.js:105 |
| `onEndpointWithTranscript(transcript)` | turnManager.js:116 |
| `onResponseReady()` → SPEAKING | turnManager.js:122 |
| `onSpeakingComplete()` → LISTENING | turnManager.js:127 |
| `getStatus()` — the exact payload the client receives | turnManager.js:134-140 |
| `_transition` is a no-op when `prev === newState` (no self-edges emitted) | turnManager.js:144-149 |
| `_emit` swallows listener throws into `console.error` | turnManager.js:167-172 |

### INTERRUPTION — the cancellation chain, complete and in execution order

Three listeners are registered on the TurnManager (server.js:65, :77, :82); the
interruption path uses two of them.

| # | Step | Citation |
|---|---|---|
| 1 | `state === SPEAKING && rms > vadThreshold` | turnManager.js:91 |
| 2 | `interruptionCount++` | turnManager.js:93 |
| 3 | emit `interruptionDetected` | turnManager.js:94 |
| 4 | transition → INTERRUPTED | turnManager.js:95 |
| 5 | transition → LISTENING **immediately**, in the same call | turnManager.js:97 |
| 6 | server's `stateChange` listener sees `to === INTERRUPTED` | server.js:69 |
| 7 | `tts.cancel()` | server.js:71 |
| 8 | `engine.handleInterruption()` — called with **no** argument | server.js:72 |
| 9 | `{ type: 'tts_done', interrupted: true }` to client | server.js:73 |
| 10 | TTS loop reads `_cancelled` at the top of the next chunk | textToSpeech.js:49 |
| 11 | returns `{ completed: false }`, so step 7 of the pipeline is skipped | textToSpeech.js:51, server.js:123 |
| 12 | client empties `playbackQueue` and clears `isPlaying` | voice.js:118-122 |

`onCompleteUtterance` runs the same first four steps for text input
(turnManager.js:106-110), and the manual `interrupt` message fakes RMS = 1.0
(server.js:189).

## Speech-to-text — `src/speechToText.js`

| Fact | Citation |
|---|---|
| `export class MockSTT` | speechToText.js:12 |
| Five fallback phrases | speechToText.js:17-23 |
| `setNextTranscript(text)` | speechToText.js:28 |
| `feedAudio(chunk)` — pushes onto `_audioBuffer` | speechToText.js:33-35 |
| `transcribe()` — 200-400 ms simulated latency, returns `{text, confidence, latencyMs}` | speechToText.js:38, :39, :53 |
| `reset()` | speechToText.js:56 |
| `export class WhisperSTT` — template, needs `OPENAI_API_KEY` | speechToText.js:66, :68 |
| Warns and degrades when the key is absent | speechToText.js:71, :82 |
| Real call shape documented only in comments (`POST /v1/audio/transcriptions`, `whisper-1`) | speechToText.js:87, :88 |

## Text-to-speech — `src/textToSpeech.js`

| Fact | Citation |
|---|---|
| `export class MockTTS` | textToSpeech.js:12 |
| `sampleRate = 16000`, `chunkDurationMs = 100` | textToSpeech.js:17, :18 |
| `synthesize(text, onChunk)` | textToSpeech.js:33 |
| Text split into **3-word** chunks | textToSpeech.js:38, :39 |
| Cancellation checked at the top of every chunk iteration | textToSpeech.js:49 |
| Chunk payload `{ audio, index, total, text, sampleRate }` | textToSpeech.js:57-63 |
| 80-120 ms simulated inter-chunk delay | textToSpeech.js:68 |
| `cancel()` sets `_cancelled` | textToSpeech.js:76 |
| `_generateTone` — sine wave, 200-400 Hz, fade envelope | textToSpeech.js:81-91 |
| `export class CloudTTS` — template; `voice: 'alloy'`, `model: 'tts-1'` | textToSpeech.js:98, :101, :102 |
| Returns `{ completed: false, chunksDelivered: 0 }` unconditionally | textToSpeech.js:146 |
| Real call shape documented only in comments (`/v1/audio/speech`, `response_format: 'pcm'`) | textToSpeech.js:122, :132 |

## Conversation — `src/conversationEngine.js`

| Fact | Citation |
|---|---|
| `export class ConversationEngine` | conversationEngine.js:8 |
| `history` array of `{role, content, timestamp}` | conversationEngine.js:11, :18-22 |
| `maxContextTurns = 20`; history trimmed to the last 40 entries | conversationEngine.js:13, :36-37 |
| `processUserInput(transcript)` pushes user turn, generates, pushes assistant turn | conversationEngine.js:17, :23, :26, :33 |
| `handleInterruption(partialResponse)` marks the last assistant turn | conversationEngine.js:47, :52 |
| `getHistory()` projection sent to the client | conversationEngine.js:59-66 |
| `reset()` | conversationEngine.js:69 |
| `_generateResponse` — 150-400 ms simulated latency | conversationEngine.js:75, :77 |
| **8 pattern rules**, first match wins: hello, weather, time, joke, interrupt, help, state-machine, bye | conversationEngine.js:82, :85, :88, :92, :100, :105, :110, :115 |
| Default branch echoes the input | conversationEngine.js:120 |

## Browser client — `public/voice.js`

| Fact | Citation |
|---|---|
| Wires DOM and connects on `DOMContentLoaded` | voice.js:30, :63 |
| `connectWebSocket()` — ws/wss by page protocol, auto-reconnect after 2 s | voice.js:68, :70, :83 |
| `handleServerMessage` switch — 6 cases | voice.js:101, :102 |
| `AudioContext({ sampleRate: 16000 })` + `getUserMedia` | voice.js:180, :181 |
| Analyser node for the waveform | voice.js:186, :187 |
| `createScriptProcessor(4096,1,1)`; `onaudioprocess` → Float32 → base64 → `{type:'audio'}` | voice.js:191, :192, :199, :201 |
| Simulate-voice text input → `{type:'simulate'}` | voice.js:234, :237 |
| Manual `{type:'interrupt'}` button | voice.js:241 |
| Playback queue: `enqueueTTSChunk` / `playNext`, sequential via `source.onended` | voice.js:246, :251, :257, :270, :274 |
| Transcript rendering | voice.js:282 |
| Waveform animation, colour keyed to agent state | voice.js:333, :350-356 |

## Headless client — `src/demo.js`

| Fact | Citation |
|---|---|
| Imports `./server.js` for its side effect (starts the server in-process) | demo.js:9 |
| Opens a WebSocket to `ws://localhost:${PORT}` | demo.js:15 |
| Four scripted turns — hello, help, state-machine, goodbye | demo.js:51, :56, :61, :69 |
| …driven by five `simulate` sends: turn 3 fires a second utterance 500 ms in, to interrupt itself | demo.js:62, :64 |
| Sends `stop`, then exits | demo.js:80, :83 |

---

## INVARIANT CARD 1 — CLIENT → SERVER: every switch branch, in code order

`switch (msg.type)` at server.js:143. Seven branches, six named + default.

| # | Branch | What it does | Citation |
|---|---|---|---|
| 1 | `start` | `stt.reset()` · `engine.reset()` · `startConversation()` · empty `history` | server.js:144, :145, :146, :147, :148 |
| 2 | `stop` | `tts.cancel()` · `endConversation()` | server.js:151, :152, :153 |
| 3 | `audio` | base64 → `Float32Array` → `computeRMS` → `feedAudio` + `onAudioEnergy` | server.js:156, :158, :159, :160, :162, :163 |
| 4 | `simulate` | `setNextTranscript` · auto-start if IDLE · `onCompleteUtterance` · `processUtterance` | server.js:167, :172, :174, :179, :182 |
| 5 | `interrupt` | only when state is SPEAKING → `onAudioEnergy(1.0)` | server.js:186, :188, :189 |
| 6 | `get_history` | `engine.getHistory()` | server.js:194, :195 |
| 7 | `default` | `{type:'error', message:'Unknown message type: …'}` | server.js:198, :199 |

Malformed JSON never reaches the switch — it returns an `error` at server.js:140.
**`get_history` is absent from the protocol docblock** at server.js:6-11, which
lists only five client message types (server.js:7, :8, :9, :10, :11).

## INVARIANT CARD 2 — SERVER → CLIENT: all 6 types and their only emitters

Declared server.js:13-19. Every emitter site below is exhaustive for that type.

| Type | Emitted at | Trigger |
|---|---|---|
| `state` | server.js:60 | every `stateChange` (server.js:65) and once on connect (server.js:210) |
| `transcript` | server.js:91 (user), server.js:106 (assistant) | pipeline steps 1 and 5 |
| `tts_chunk` | server.js:112-119 | per MockTTS chunk; `Float32Array` → `Buffer` → base64 (server.js:111) |
| `tts_done` | server.js:73 (`interrupted: true`), server.js:124 (`interrupted: false`) | interruption / natural end |
| `history` | server.js:148 (empty, on `start`), server.js:195 (on `get_history`) | — |
| `error` | server.js:129 (pipeline throw), server.js:140 (bad JSON), server.js:199 (unknown type) | — |

The browser handles exactly these six and nothing else — voice.js:102-132
(`state` :103, `transcript` :109, `tts_chunk` :113, `tts_done` :117,
`history` :125, `error` :129).

## INVARIANT CARD 3 — MIC AUDIO CANNOT PRODUCE A TRANSCRIPT

The README's arrow "Microphone capture → audio chunks → Speech-to-Text"
(README.md:10) does not exist in the wired code. Traced end to end:

| # | Link | Citation |
|---|---|---|
| 1 | `case 'audio'` calls `stt.feedAudio(float32)` — chunks accumulate in `_audioBuffer` | server.js:162, speechToText.js:33-35 |
| 2 | `MockSTT.transcribe()` is the only drain — and **no caller exists**; `stt.` appears in server.js only as `reset`, `feedAudio`, `setNextTranscript` | speechToText.js:38, server.js:145, :162, :172 |
| 3 | `TurnManager.onEndpointWithTranscript()` — the STT→FSM hand-off — also has **no caller** | turnManager.js:116 |
| 4 | `partialTranscript` is therefore written only by `onCompleteUtterance`, i.e. only by `simulate` | turnManager.js:111, server.js:179 |
| 5 | The silence timer fires `endpointDetected` carrying that same `partialTranscript` | turnManager.js:153-155 |
| 6 | The server's listener returns early on a falsy transcript — the turn ends silently | server.js:77, :78 |

Consequence: microphone audio drives **VAD only** — endpointing
(turnManager.js:83-87) and interruption (turnManager.js:91). Language, per
CLAUDE.md's contract rule: this path is **UNREHEARSED for speech** — the only
path that reaches the ConversationEngine is `simulate` (server.js:167-183).

---

## Artifacts

This project writes **no** files at runtime. Its durable outputs are the two
long-lived client-side structures and the server console log:

| Output | Written by | Citation |
|---|---|---|
| Rendered transcript DOM | browser | voice.js:282, :304 |
| Audio playback queue (in-memory, sequential) | browser | voice.js:246, :251 |
| Conversation history (in-memory, per connection, ≤40 entries) | ConversationEngine | conversationEngine.js:11, :36-37 |
| stdout state log `[State] from → to` | server | server.js:66, :233 |

---

## Deliberately NOT drawn (L1 scope discipline)

- **The five-state FSM and its seven documented transitions** (turnManager.js:11-18,
  :21-27) — that is **L2 legality**, a different altitude, per
  `DIAGRAM_RULES_LLD.md`. Only the box that owns the FSM appears.
- **The interruption race over time** (who cancels first, what arrives after the
  cancel) — **L2b**, a sequence diagram. Card 3 states its *outcome*, not its
  choreography.
- `conversationEngine._generateResponse`'s eight regex bodies, `_generateTone`'s
  sine maths, `arrayBufferToBase64`/`base64ToArrayBuffer` — function-level detail
  excluded by the L1 content rules.
- The static UI files `public/index.html` and `public/styles.css` — served, not
  architectural participants.

---

## Portability notes — rules bent for this domain

Recorded because "rules bent per new domain" is the harness's portability metric.
Carrying forward the two renames already made for `agent_harness_v1`
(`edge.money → edge.primary`, `component.store → component.artifact`), this
diagram needed three more accommodations:

1. **`component.artifact` had no referent.** This project writes zero files. The
   token was reused for *client-side durable state* (playback queue, transcript
   DOM) inside a `boundary.observability` zone. The vocabulary wants a
   `component.ui` or `component.sink` for "the thing at the far end that renders".
2. **`component.mock` vs `component.external` collapsed.** In `agent_harness_v1`
   the mocks were a data corpus behind a tool surface. Here the mocks *are* the
   services (`MockSTT`, `MockTTS`) and the real providers are unreferenced
   templates. Mocks were drawn with `component.service` (they are the running
   system) and the templates with `component.mock` — the inverse of the exemplar.
   A `component.unwired` token would say this honestly instead.
3. **No token expresses "no edge, on purpose."** `WhisperSTT` and `CloudTTS` are
   drawn deliberately unconnected: an edge would assert a call that does not
   exist. The zone label carries the fact, which is weaker than a token would be.
4. **Two processes, one diagram.** Browser and Node are separate runtimes; only
   `boundary.datasource` / `boundary.observability` were available to fence the
   browser halves, so the browser appears as two zones (capture, playback) rather
   than one runtime split by the WebSocket. A `boundary.peer_runtime` token would
   fix this.
