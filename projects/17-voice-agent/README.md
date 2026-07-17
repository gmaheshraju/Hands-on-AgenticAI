# Project 17: Real-Time Voice Agent

A Node.js + browser-based real-time voice agent with interruption handling, turn-taking, and live transcript visualization.

## Architecture

```
Browser (Web Audio API)          WebSocket           Node.js Server
┌─────────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│  Microphone capture  │───>│  audio chunks    │───>│  Speech-to-Text     │
│  Waveform visualizer │    │  (base64 PCM)    │    │  (MockSTT/Whisper)  │
│  Audio playback queue│<───│  tts_chunk/state  │<───│  ConversationEngine │
│  Simulate voice input│───>│  simulate text   │───>│  Text-to-Speech     │
└─────────────────────┘    └──────────────────┘    │  TurnManager (FSM)  │
                                                    └─────────────────────┘
```

## Quick Start

```bash
npm install
npm start        # Server at http://localhost:3000
npm run demo     # Headless demo with simulated conversation
```

## Files

| File | Purpose |
|------|---------|
| `src/server.js` | Express + WebSocket server, message routing |
| `src/turnManager.js` | State machine, endpointing, interruption detection |
| `src/speechToText.js` | STT interface (MockSTT + WhisperSTT template) |
| `src/conversationEngine.js` | Response generation, multi-turn context |
| `src/textToSpeech.js` | TTS interface (MockTTS + CloudTTS template) |
| `src/demo.js` | Headless demo with simulated voice interaction |
| `public/index.html` | Voice agent UI |
| `public/styles.css` | Dark theme UI with state-colored indicators |
| `public/voice.js` | Web Audio API, WebSocket client, audio playback |

## Demo Mode

No microphone or API keys needed. Use the "Simulate Voice" input or quick-phrase buttons to send text through the full pipeline:

1. Text → MockSTT (simulated transcription)
2. Transcript → ConversationEngine (pattern-matched responses)
3. Response → MockTTS (sine wave audio chunks)
4. Audio streamed back via WebSocket → browser playback

## Key Concepts

- **Interruption handling**: VAD during SPEAKING state triggers immediate TTS cancellation
- **Endpointing**: Silence threshold (1500ms default) determines when user finished speaking
- **Turn-taking protocol**: Prevents agent and user from talking simultaneously
- **Audio streaming**: Chunked PCM over WebSocket with base64 encoding
- **Backpressure**: Audio playback queue with sequential consumption
