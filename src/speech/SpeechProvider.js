import { AudioCapture } from './audioCapture.js';

export class DeepgramSpeechProvider {
  constructor({
    language = 'en-IN',
    keyterms = [],
    onStatus,
    onTranscript,
    onError
  } = {}) {
    this.language = language;
    this.keyterms = keyterms;

    this.onStatus = typeof onStatus === 'function' ? onStatus : () => {};
    this.onTranscript = typeof onTranscript === 'function' ? onTranscript : () => {};
    this.onError = typeof onError === 'function' ? onError : () => {};

    this.audioCapture = null;
    this.unsubscribe = null;
    this.started = false;
    this.stopping = false;
    this.stopRequested = false;
  }

  emitStatus(status, extra = {}) {
    this.onStatus({ status, ...extra });
  }

  async start() {
    if (this.started) return true;

    const desktop = window.echoDesktop;

    if (
      !desktop?.startDeepgram ||
      !desktop?.sendDeepgramAudio ||
      !desktop?.onDeepgramEvent
    ) {
      throw new Error(
        'Echo desktop speech bridge is missing. Restart the Electron app after replacing preload.cjs.'
      );
    }

    this.stopping = false;
    this.stopRequested = false;

    this.emitStatus('connecting');

    this.unsubscribe = desktop.onDeepgramEvent((event) => {
      if (!event || typeof event !== 'object') return;

      if (event.type === 'transcript') {
        this.onTranscript(event);
        return;
      }

      if (event.type === 'status') {
        if (event.status === 'connected') {
          this.emitStatus('connected', event);
        } else if (event.status === 'network-backpressure') {
          this.emitStatus('network-backpressure', event);
        } else if (event.status === 'stopped') {
          this.emitStatus('stopped', event);
        } else if (
          event.status === 'disconnected' &&
          !this.stopping
        ) {
          this.emitStatus('disconnected', event);

          this.onError(
            new Error(
              `Deepgram disconnected${
                event.reason ? `: ${event.reason}` : ''
              }`
            )
          );
        }

        return;
      }

      if (event.type === 'error') {
        this.onError(
          new Error(event.message || 'Deepgram returned an error.')
        );

        return;
      }

      if (
        event.type === 'speech-started' ||
        event.type === 'utterance-end'
      ) {
        this.onStatus({ status: event.type, ...event });
      }
    });

    try {
      await desktop.startDeepgram({
        language: this.language,
        keyterms: this.keyterms
      });

      if (this.stopRequested) {
        await desktop.stopDeepgram();
        return false;
      }

      this.audioCapture = new AudioCapture({
        onFrame: (buffer) => {
          if (!this.stopping) {
            desktop.sendDeepgramAudio(buffer);
          }
        },

        onError: (error) => {
          this.onError(error);
        }
      });

      await this.audioCapture.start();

      if (this.stopRequested) {
        await this.audioCapture.stop();
        await desktop.stopDeepgram();
        return false;
      }

      this.started = true;

      this.emitStatus('listening');

      return true;
    } catch (error) {
      await this.cleanupAfterFailedStart();

      this.onError(error);

      throw error;
    }
  }

  async cleanupAfterFailedStart() {
    this.stopping = true;

    try {
      await this.audioCapture?.stop();
    } catch {
      // Ignore cleanup errors.
    }

    this.audioCapture = null;

    try {
      await window.echoDesktop?.stopDeepgram?.();
    } catch {
      // Ignore cleanup errors.
    }

    this.unsubscribe?.();
    this.unsubscribe = null;

    this.started = false;

    this.emitStatus('error');
  }

  async stop() {
    if (this.stopping) return;

    this.stopRequested = true;
    this.stopping = true;

    this.emitStatus('stopping');

    // Stop local microphone frames first.
    // Then ask Deepgram to finalize its remaining audio.

    try {
      await this.audioCapture?.stop();
    } catch (error) {
      this.onError(error);
    }

    this.audioCapture = null;

    try {
      await window.echoDesktop?.stopDeepgram?.();
    } catch (error) {
      this.onError(error);
    }

    this.unsubscribe?.();
    this.unsubscribe = null;

    this.started = false;

    this.emitStatus('stopped');

    this.stopping = false;
  }
}

export function createSpeechProvider(options) {
  return new DeepgramSpeechProvider(options);
}