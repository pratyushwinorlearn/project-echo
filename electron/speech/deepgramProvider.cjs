'use strict';

const WebSocket = require('ws');

const DEEPGRAM_ENDPOINT = 'wss://api.deepgram.com/v1/listen';
const DEFAULT_SAMPLE_RATE = 16000;

function cleanKeyterms(values) {
  if (!Array.isArray(values)) return [];

  const seen = new Set();
  const result = [];

  for (const value of values) {
    if (typeof value !== 'string') continue;
    const term = value.trim().replace(/\s+/g, ' ');
    if (!term || term.length > 80) continue;

    const key = term.toLocaleLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(term);
    if (result.length >= 30) break;
  }

  return result;
}

class DeepgramSpeechSession {
  constructor({ apiKey, language = 'en-IN', keyterms = [], onEvent = () => {} }) {
    if (!apiKey || typeof apiKey !== 'string') {
      throw new Error('DEEPGRAM_API_KEY is missing. Add it to the project .env file.');
    }

    this.apiKey = apiKey.trim();
    this.language = typeof language === 'string' ? language : 'en-IN';
    this.keyterms = cleanKeyterms(keyterms);
    this.onEvent = onEvent;

    this.socket = null;
    this.keepAliveTimer = null;
    this.lastAudioAt = 0;
    this.stopped = false;
    this.opened = false;
    this.stopPromise = null;
  }

  emit(event) {
    try {
      this.onEvent(event);
    } catch (error) {
      // UI notification failures must not interrupt the audio stream.
      console.error('[Deepgram] Event callback failed:', error?.message || error);
    }
  }

  buildUrl() {
    const url = new URL(DEEPGRAM_ENDPOINT);
    url.searchParams.set('model', 'nova-3');
    url.searchParams.set('language', this.language);
    url.searchParams.set('encoding', 'linear16');
    url.searchParams.set('sample_rate', String(DEFAULT_SAMPLE_RATE));
    url.searchParams.set('channels', '1');
    url.searchParams.set('interim_results', 'true');
    url.searchParams.set('punctuate', 'true');
    url.searchParams.set('smart_format', 'true');
    url.searchParams.set('endpointing', '300');
    url.searchParams.set('utterance_end_ms', '1000');
    url.searchParams.set('vad_events', 'true');

    for (const term of this.keyterms) {
      url.searchParams.append('keyterm', term);
    }

    return url.toString();
  }

  async start() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return { connected: true, model: 'nova-3' };
    }

    this.stopped = false;
    this.opened = false;
    this.socket = new WebSocket(this.buildUrl(), {
      headers: {
        Authorization: `Token ${this.apiKey}`
      },
      handshakeTimeout: 12000,
      perMessageDeflate: false
    });

    const socket = this.socket;

    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { socket.terminate(); } catch { /* ignore */ }
        reject(new Error('Deepgram connection timed out. Check your network and API key.'));
      }, 13000);

      const failStart = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      socket.on('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.opened = true;
        this.lastAudioAt = Date.now();
        this.emit({ type: 'status', status: 'connected', model: 'nova-3' });
        this.startKeepAlive();
        resolve({ connected: true, model: 'nova-3' });
      });

      socket.on('unexpected-response', (_request, response) => {
        let body = '';
        response.on('data', (chunk) => {
          body += chunk.toString();
          if (body.length > 2000) body = body.slice(0, 2000);
        });
        response.on('end', () => {
          const message = `Deepgram rejected the connection (${response.statusCode || 'HTTP error'}): ${body || response.statusMessage || 'Check the API key and project permissions.'}`;
          failStart(new Error(message));
          this.emit({ type: 'error', message, code: response.statusCode || 'HANDSHAKE_FAILED' });
        });
      });

      socket.on('error', (error) => {
        const message = error?.message || 'Deepgram WebSocket error.';
        if (!this.opened) failStart(new Error(message));
        else this.emit({ type: 'error', message, code: 'WEBSOCKET_ERROR' });
      });

      socket.on('message', (data) => this.handleMessage(data));

      socket.on('close', (code, reasonBuffer) => {
        this.clearKeepAlive();
        this.opened = false;
        const reason = reasonBuffer ? reasonBuffer.toString() : '';
        this.emit({
          type: 'status',
          status: this.stopped ? 'stopped' : 'disconnected',
          code,
          reason
        });
      });
    });
  }

  startKeepAlive() {
    this.clearKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
      if (Date.now() - this.lastAudioAt < 3500) return;

      try {
        this.socket.send(JSON.stringify({ type: 'KeepAlive' }));
      } catch (error) {
        this.emit({ type: 'error', message: error?.message || 'Could not keep the stream alive.' });
      }
    }, 4000);
  }

  clearKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  handleMessage(data) {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (message.type === 'Results') {
      const alternative = message.channel?.alternatives?.[0];
      const transcript = alternative?.transcript || '';
      if (!transcript.trim()) return;

      this.emit({
        type: 'transcript',
        transcript,
        isFinal: Boolean(message.is_final),
        speechFinal: Boolean(message.speech_final),
        confidence: Number(alternative?.confidence || 0),
        words: Array.isArray(alternative?.words) ? alternative.words : [],
        start: Number(message.start || 0),
        duration: Number(message.duration || 0),
        receivedAt: Date.now()
      });
      return;
    }

    if (message.type === 'SpeechStarted') {
      this.emit({ type: 'speech-started', timestamp: Date.now() });
      return;
    }

    if (message.type === 'UtteranceEnd') {
      this.emit({ type: 'utterance-end', lastWordEnd: message.last_word_end });
      return;
    }

    if (message.type === 'Error' || message.type === 'error') {
      this.emit({
        type: 'error',
        message: message.description || message.message || 'Deepgram returned an error.',
        code: message.err_code || message.code || 'DEEPGRAM_ERROR'
      });
    }
  }

  sendAudio(input) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || this.stopped) return false;

    let audio;
    if (Buffer.isBuffer(input)) {
      audio = input;
    } else if (input instanceof ArrayBuffer) {
      audio = Buffer.from(input);
    } else if (ArrayBuffer.isView(input)) {
      audio = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
    } else if (input && input.type === 'Buffer' && Array.isArray(input.data)) {
      audio = Buffer.from(input.data);
    } else {
      return false;
    }

    if (audio.byteLength === 0) return false;

    // Drop audio rather than creating an unbounded queue if the network stalls.
    if (this.socket.bufferedAmount > 1024 * 1024) {
      this.emit({ type: 'status', status: 'network-backpressure' });
      return false;
    }

    this.lastAudioAt = Date.now();
    this.socket.send(audio, { binary: true }, (error) => {
      if (error) {
        this.emit({ type: 'error', message: error.message || 'Audio could not be sent.', code: 'AUDIO_SEND_FAILED' });
      }
    });
    return true;
  }

  stop() {
    if (this.stopPromise) return this.stopPromise;

    this.stopPromise = new Promise((resolve) => {
      this.stopped = true;
      this.clearKeepAlive();

      const socket = this.socket;
      if (!socket || socket.readyState === WebSocket.CLOSED) {
        this.emit({ type: 'status', status: 'stopped' });
        resolve();
        return;
      }

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        try {
          if (socket.readyState === WebSocket.OPEN) socket.close(1000, 'Echo session ended');
        } catch { /* ignore */ }
        resolve();
      };

      socket.once('close', () => {
        if (finished) return;
        finished = true;
        resolve();
      });

      if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify({ type: 'Finalize' }));
          setTimeout(() => {
            if (socket.readyState === WebSocket.OPEN) {
              try { socket.send(JSON.stringify({ type: 'CloseStream' })); } catch { /* ignore */ }
            }
          }, 350);
        } catch { /* ignore */ }
      }

      setTimeout(finish, 1100);
    });

    return this.stopPromise;
  }
}

module.exports = { DeepgramSpeechSession };
