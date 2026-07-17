/**
 * TurnManager — State machine for voice agent turn-taking and interruption handling.
 *
 * States:
 *   IDLE        — No conversation active
 *   LISTENING   — Capturing user audio, running endpointing
 *   PROCESSING  — User finished speaking, generating response
 *   SPEAKING    — Agent TTS playing back to user
 *   INTERRUPTED — User spoke during agent speech; TTS cancelled, re-entering LISTENING
 *
 * Transitions:
 *   IDLE        → LISTENING    : conversation started / user presses talk
 *   LISTENING   → PROCESSING   : silence threshold met (endpointing)
 *   PROCESSING  → SPEAKING     : response + TTS ready, streaming audio
 *   SPEAKING    → INTERRUPTED  : voice activity detected while agent speaks
 *   INTERRUPTED → LISTENING    : TTS stopped, ready for new user input
 *   SPEAKING    → LISTENING    : agent finished speaking normally
 *   *           → IDLE         : conversation ended
 */

const STATES = Object.freeze({
  IDLE: 'IDLE',
  LISTENING: 'LISTENING',
  PROCESSING: 'PROCESSING',
  SPEAKING: 'SPEAKING',
  INTERRUPTED: 'INTERRUPTED',
});

// How long silence (ms) before we decide the user finished speaking
const DEFAULT_SILENCE_THRESHOLD_MS = 1500;

// How loud the audio must be to count as speech (RMS 0-1 scale)
const DEFAULT_VAD_THRESHOLD = 0.02;

export class TurnManager {
  constructor(opts = {}) {
    this.state = STATES.IDLE;
    this.silenceThresholdMs = opts.silenceThresholdMs ?? DEFAULT_SILENCE_THRESHOLD_MS;
    this.vadThreshold = opts.vadThreshold ?? DEFAULT_VAD_THRESHOLD;

    // Timestamp of last detected voice activity
    this._lastVoiceActivityAt = null;
    // Timer for endpointing
    this._silenceTimer = null;
    // Listeners: { stateChange, endpointDetected, interruptionDetected }
    this._listeners = {};
    // How many times agent was interrupted (quality metric)
    this.interruptionCount = 0;
    // Partial transcript accumulated during LISTENING
    this.partialTranscript = '';
  }

  /* ── public API ─────────────────────────────────────────── */

  get currentState() {
    return this.state;
  }

  /** Register event listeners */
  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }

  /** Start a conversation — move to LISTENING */
  startConversation() {
    this._transition(STATES.LISTENING);
  }

  /** End a conversation — move to IDLE */
  endConversation() {
    this._clearSilenceTimer();
    this._transition(STATES.IDLE);
  }

  /**
   * Called with every audio chunk's RMS energy level.
   * Drives endpointing (silence detection) and interruption detection.
   */
  onAudioEnergy(rmsLevel) {
    const isSpeech = rmsLevel > this.vadThreshold;

    if (this.state === STATES.LISTENING) {
      if (isSpeech) {
        this._lastVoiceActivityAt = Date.now();
        this._resetSilenceTimer();
      }
      // If we've had voice and now silence is running, the timer handles endpointing
    }

    if (this.state === STATES.SPEAKING && isSpeech) {
      // User is speaking while agent is talking — INTERRUPTION
      this.interruptionCount++;
      this._emit('interruptionDetected', { rmsLevel, count: this.interruptionCount });
      this._transition(STATES.INTERRUPTED);
      // Immediately transition to LISTENING so we capture the interruption
      this._transition(STATES.LISTENING);
    }
  }

  /**
   * Called when simulated or real text input arrives (simulate-voice mode).
   * Skips endpointing — treats it as a complete utterance.
   */
  onCompleteUtterance(text) {
    if (this.state === STATES.SPEAKING) {
      this.interruptionCount++;
      this._emit('interruptionDetected', { text, count: this.interruptionCount });
      this._transition(STATES.INTERRUPTED);
    }
    this.partialTranscript = text;
    this._transition(STATES.PROCESSING);
  }

  /** Called when STT produces a transcript and endpointing triggers */
  onEndpointWithTranscript(transcript) {
    this.partialTranscript = transcript;
    this._transition(STATES.PROCESSING);
  }

  /** Called when the conversation engine + TTS are ready to stream */
  onResponseReady() {
    this._transition(STATES.SPEAKING);
  }

  /** Called when agent finishes speaking naturally (TTS complete) */
  onSpeakingComplete() {
    if (this.state === STATES.SPEAKING) {
      this._transition(STATES.LISTENING);
    }
  }

  /** Get a serializable snapshot for the client */
  getStatus() {
    return {
      state: this.state,
      interruptionCount: this.interruptionCount,
      partialTranscript: this.partialTranscript,
    };
  }

  /* ── internals ──────────────────────────────────────────── */

  _transition(newState) {
    const prev = this.state;
    if (prev === newState) return;
    this.state = newState;
    this._emit('stateChange', { from: prev, to: newState });
  }

  _resetSilenceTimer() {
    this._clearSilenceTimer();
    this._silenceTimer = setTimeout(() => {
      if (this.state === STATES.LISTENING && this._lastVoiceActivityAt) {
        this._emit('endpointDetected', { transcript: this.partialTranscript });
      }
    }, this.silenceThresholdMs);
  }

  _clearSilenceTimer() {
    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
    }
  }

  _emit(event, data) {
    const fns = this._listeners[event] || [];
    for (const fn of fns) {
      try { fn(data); } catch (e) { console.error(`TurnManager event ${event} error:`, e); }
    }
  }
}

export { STATES };
