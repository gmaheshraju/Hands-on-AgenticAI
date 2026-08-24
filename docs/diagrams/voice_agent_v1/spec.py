"""Spec — 17-voice-agent, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
 "id": "hoa_voice_agent_v1",
 "name": "17 Real-Time Voice Agent — Architecture",
 "desc": "One Node process serving HTTP and WebSocket on the same port, with a per-connection "
 "set of four objects (TurnManager, MockSTT, ConversationEngine, MockTTS), the browser "
 "capture and playback halves it talks to, and two real-provider templates that no "
 "caller constructs. Every element cites a source line in FACTS.md.",
 "theme": "hoa-default.json",
 "drawio": "HOA_VoiceAgent_v1.drawio",
 "svg": "voice-agent.svg",
 "w": 1700, "h": 1000, "svg_h": 800,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_entry","③ Entry — WS clients","boundary.datasource", 40, 232, 176, 208),
 ("z_proc", "① 17-voice-agent server process (Node ESM, one port)","boundary.primary",
 280, 96, 1016, 680),
 ("z_flow", "Per-connection instances — one set per socket · server.js","boundary.functional",
 320, 200, 936, 264),
 ("z_ext", "② Real-provider templates — constructed by no caller","boundary.external",
 1360, 232, 296, 240),
 ("z_out", "④ Browser playback (public/voice.js)","boundary.observability",
 1360, 584, 296, 176),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 ("n_mic","component.entry",
 "<b>mic capture</b><br>PCM → base64 → ws<br>voice.js", 56, 252, 144, 64),
 ("n_demo","component.entry",
 "<b>demo.js</b><br>4 scripted turns<br>", 56, 356, 144, 64),
 ("n_static","component.service",
 "<b>express.static</b><br>public/ → browser<br>server.js", 320, 124, 176, 56),
 ("n_ws","component.service",
 "<b>ws message router</b><br>7 branches · safeSend<br>server.js", 344, 252, 176, 64),
 ("n_turn","component.agent",
 "<b>TurnManager</b><br>5 states · VAD · timer<br>", 576, 252, 176, 64),
 ("n_engine","component.service",
 "<b>ConversationEngine</b><br>8 rules · 20-turn ctx<br>", 808, 252, 176, 64),
 ("n_tts","component.service",
 "<b>MockTTS</b><br>3-word chunks · 16kHz<br>", 1040, 252, 176, 64),
 ("n_stt","component.service",
 "<b>MockSTT</b><br>buffers only · 5 phrases<br>", 576, 372, 176, 64),
 ("n_whisper","component.mock",
 "<b>WhisperSTT</b><br>OPENAI_API_KEY · whisper-1<br>speechToText.js", 1384, 268, 248, 64),
 ("n_cloud","component.mock",
 "<b>CloudTTS</b><br>alloy · tts-1 · pcm stream<br>textToSpeech.js", 1384, 380, 248, 64),
 ("n_play","component.artifact",
 "<b>playback queue</b><br>sequential · onended<br>voice.js", 1384, 620, 248, 56),
 ("n_ui","component.artifact",
 "<b>transcript + waveform</b><br>voice.js", 1384, 692, 248, 48),

 ("card_in","card.invariant",
 "<b>CLIENT → SERVER — every switch branch, in code order</b><br>"
 "1 start — stt.reset · engine.reset · startConversation<br>"
 "2 stop — tts.cancel · endConversation<br>"
 "3 audio — base64 → Float32 → RMS → feedAudio + onAudioEnergy<br>"
 "4 simulate — setNextTranscript → onCompleteUtterance → pipeline<br>"
 "5 interrupt — only while SPEAKING: onAudioEnergy(1.0)<br>"
 "6 get_history — undocumented in the protocol block<br>"
 "7 default — unknown type; malformed JSON errors earlier at",
 304, 488, 456, 124),

 ("card_out","card.primitive",
 "<b>SERVER → CLIENT — all 6 types and their only emitters</b><br>"
 "state — on every stateChange, and once on connect<br>"
 "transcript user assistant<br>"
 "tts_chunk — Float32 → Buffer → base64, index/total<br>"
 "tts_done interrupted=true interrupted=false<br>"
 "history empty on start on get_history<br>"
 "error pipeline throw bad JSON unknown type<br>"
 "the browser handles exactly these six — voice.js",
 792, 488, 456, 124),

 ("card_dead","card.failure",
 "<b>MIC AUDIO CANNOT PRODUCE A TRANSCRIPT — the wired path</b><br>"
 "1 audio feedAudio() buffers the chunk — nothing drains it<br>"
 "2 MockSTT.transcribe() speechToText.js — no caller exists<br>"
 "3 onEndpointWithTranscript turnManager.js — no caller exists<br>"
 "4 partialTranscript is written only by onCompleteUtterance<br>"
 "5 endpointDetected therefore carries transcript = ''<br>"
 "6 server.js returns early on falsy — the turn ends silently<br>"
 "mic drives VAD only; only 'simulate' reaches the engine",
 548, 636, 456, 124),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 ("e_get","n_mic","n_static","GET / · public/","edge.data_in",(0.5,0),(0,0.5),[(128,152)]),
 ("e_audio","n_mic","n_ws","{type:'audio'} base64 PCM","edge.primary",(1,0.5),(0,0.5),[]),
 ("e_demo","n_demo","n_ws","{type:'simulate'} demo.js","edge.primary",(1,0.5),(0.25,1),[(388,388)]),
 ("e_feed","n_ws","n_stt","feedAudio · setNextTranscript","edge.data_in",(0.75,1),(0,0.5),[(476,404)]),
 ("e_energy","n_ws","n_turn","onAudioEnergy · onCompleteUtterance","edge.primary",(1,0.5),(0,0.5),[]),
 ("e_end","n_turn","n_engine","endpointDetected → processUserInput","edge.primary",(1,0.5),(0,0.5),[]),
 ("e_gen","n_engine","n_tts","response.text → synthesize","edge.primary",(1,0.5),(0,0.5),[]),
 ("e_chunk","n_tts","n_play","tts_chunk","edge.artifact",(1,0.5),(0,0.5),[(1320,284),(1320,648)]),
 ("e_state","n_turn","n_ui","stateChange → {type:'state'}","edge.call",(0.75,0),(0,0.5),
 [(708,228),(1296,228),(1296,716)]),
 ("e_cancel","n_turn","n_tts","INTERRUPTED → tts.cancel()","edge.stop",(0.25,1),(0.5,1),
 [(620,344),(1128,344)]),
]
