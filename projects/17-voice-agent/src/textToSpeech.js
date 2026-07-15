/**
 * Text-to-Speech interface.
 *
 * MockTTS   — generates synthetic audio chunks (sine wave beeps) without any API.
 * CloudTTS  — structured for real TTS API (OpenAI, Google, ElevenLabs).
 */

/**
 * MockTTS: converts text to a series of audio chunks (simple sine wave PCM).
 * Each chunk represents ~100ms of audio. Supports cancellation for interruption handling.
 */
export class MockTTS {
  constructor() {
    this._cancelled = false;
    this._speaking = false;
    // Audio params
    this.sampleRate = 16000;
    this.chunkDurationMs = 100;
  }

  get isSpeaking() {
    return this._speaking;
  }

  /**
   * Synthesize text into audio chunks.
   * Yields chunks via the onChunk callback. Returns when done or cancelled.
   *
   * @param {string} text - Text to speak
   * @param {function} onChunk - Called with { audio: Float32Array, index, total, text }
   * @returns {Promise<{ completed: boolean, chunksDelivered: number }>}
   */
  async synthesize(text, onChunk) {
    this._cancelled = false;
    this._speaking = true;

    // Split text into word groups (~3-4 words per chunk to simulate streaming)
    const words = text.split(/\s+/);
    const wordsPerChunk = 3;
    const chunks = [];
    for (let i = 0; i < words.length; i += wordsPerChunk) {
      chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
    }

    const totalChunks = chunks.length;
    let delivered = 0;

    for (let i = 0; i < totalChunks; i++) {
      if (this._cancelled) {
        this._speaking = false;
        return { completed: false, chunksDelivered: delivered };
      }

      // Generate a short sine wave for this chunk
      const audio = this._generateTone(200 + (i % 5) * 50, this.chunkDurationMs);

      onChunk({
        audio,
        index: i,
        total: totalChunks,
        text: chunks[i],
        sampleRate: this.sampleRate,
      });

      delivered++;

      // Simulate streaming delay (real TTS would have network latency)
      await delay(80 + Math.random() * 40);
    }

    this._speaking = false;
    return { completed: true, chunksDelivered: delivered };
  }

  /** Cancel current synthesis — used for interruption handling */
  cancel() {
    this._cancelled = true;
  }

  /** Generate a sine wave tone as Float32Array */
  _generateTone(freqHz, durationMs) {
    const numSamples = Math.floor(this.sampleRate * durationMs / 1000);
    const samples = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      const t = i / this.sampleRate;
      // Sine wave with fade-in/out envelope
      const envelope = Math.min(i / 100, 1, (numSamples - i) / 100);
      samples[i] = Math.sin(2 * Math.PI * freqHz * t) * 0.3 * envelope;
    }
    return samples;
  }
}

/**
 * CloudTTS — structured for a real TTS API.
 * Placeholder for OpenAI TTS, Google Cloud TTS, or ElevenLabs.
 */
export class CloudTTS {
  constructor(apiKey, opts = {}) {
    this.apiKey = apiKey;
    this.voice = opts.voice || 'alloy';
    this.model = opts.model || 'tts-1';
    this._cancelled = false;
    this._speaking = false;
  }

  get isSpeaking() {
    return this._speaking;
  }

  async synthesize(text, onChunk) {
    if (!this.apiKey) {
      console.warn('[CloudTTS] No API key — cannot synthesize');
      return { completed: false, chunksDelivered: 0 };
    }

    this._cancelled = false;
    this._speaking = true;

    // Real implementation structure (OpenAI TTS):
    //
    // const res = await fetch('https://api.openai.com/v1/audio/speech', {
    //   method: 'POST',
    //   headers: {
    //     Authorization: `Bearer ${this.apiKey}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     model: this.model,
    //     input: text,
    //     voice: this.voice,
    //     response_format: 'pcm',  // raw PCM for streaming
    //   }),
    // });
    //
    // const reader = res.body.getReader();
    // let index = 0;
    // while (true) {
    //   if (this._cancelled) break;
    //   const { done, value } = await reader.read();
    //   if (done) break;
    //   onChunk({ audio: new Float32Array(value.buffer), index: index++, ... });
    // }

    this._speaking = false;
    return { completed: false, chunksDelivered: 0 };
  }

  cancel() {
    this._cancelled = true;
  }
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}
