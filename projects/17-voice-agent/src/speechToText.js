/**
 * Speech-to-Text interface.
 *
 * MockSTT  — works without any API key; simulates transcription with latency.
 * WhisperSTT — structured for OpenAI Whisper API (requires OPENAI_API_KEY).
 */

/**
 * Mock STT: accepts audio chunks, returns a fake transcript after a delay.
 * In demo mode the transcript is set explicitly via setNextTranscript().
 */
export class MockSTT {
  constructor() {
    this._nextTranscript = null;
    this._audioBuffer = [];
    // Simulated phrases when no explicit transcript is set
    this._fallbackPhrases = [
      'Hello, how are you today?',
      'Can you tell me about the weather?',
      'What time is it?',
      'Tell me a joke.',
      'What can you help me with?',
    ];
    this._phraseIdx = 0;
  }

  /** Pre-set the next transcript (used by simulate-voice) */
  setNextTranscript(text) {
    this._nextTranscript = text;
  }

  /** Accept an audio chunk (ArrayBuffer). In mock mode we just count them. */
  feedAudio(chunk) {
    this._audioBuffer.push(chunk);
  }

  /** Finalize and return a transcript. Simulates 200-400ms latency. */
  async transcribe() {
    const latency = 200 + Math.random() * 200;
    await delay(latency);

    let transcript;
    if (this._nextTranscript) {
      transcript = this._nextTranscript;
      this._nextTranscript = null;
    } else if (this._audioBuffer.length > 0) {
      transcript = this._fallbackPhrases[this._phraseIdx % this._fallbackPhrases.length];
      this._phraseIdx++;
    } else {
      transcript = '';
    }
    this._audioBuffer = [];
    return { text: transcript, confidence: 0.92, latencyMs: latency };
  }

  reset() {
    this._audioBuffer = [];
    this._nextTranscript = null;
  }
}

/**
 * Whisper STT — structured for real OpenAI Whisper API usage.
 * Requires OPENAI_API_KEY env var. Left as a template.
 */
export class WhisperSTT {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY;
    this._audioBuffer = [];
    if (!this.apiKey) {
      console.warn('[WhisperSTT] No OPENAI_API_KEY — falling back to MockSTT behavior');
    }
  }

  feedAudio(chunk) {
    this._audioBuffer.push(chunk);
  }

  async transcribe() {
    if (!this.apiKey) {
      // Graceful fallback
      return { text: '[no API key — use MockSTT]', confidence: 0, latencyMs: 0 };
    }

    // Real implementation structure:
    // 1. Concatenate audio chunks into a single WAV/WebM blob
    // 2. POST to https://api.openai.com/v1/audio/transcriptions
    //    with model: 'whisper-1', file: audioBlob
    // 3. Parse response.text
    //
    // const formData = new FormData();
    // formData.append('file', audioBlob, 'audio.webm');
    // formData.append('model', 'whisper-1');
    // const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    //   method: 'POST',
    //   headers: { Authorization: `Bearer ${this.apiKey}` },
    //   body: formData,
    // });
    // const data = await res.json();
    // return { text: data.text, confidence: 1.0, latencyMs: ... };

    return { text: '[Whisper integration placeholder]', confidence: 0, latencyMs: 0 };
  }

  reset() {
    this._audioBuffer = [];
  }
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}
