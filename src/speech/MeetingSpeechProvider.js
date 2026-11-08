
import { AudioCapture } from './audioCapture.js';

export class MeetingSpeechProvider {
  constructor({
    sourceId,
    language = 'en-IN',
    onStatus,
    onTranscript,
    onError
  } = {}) {
    this.sourceId = sourceId;
    this.language = language;

    this.onStatus =
      typeof onStatus === 'function' ? onStatus : () => {};

    this.onTranscript =
      typeof onTranscript === 'function' ? onTranscript : () => {};

    this.onError =
      typeof onError === 'function' ? onError : () => {};

    this.audioCapture = null;
    this.unsubscribe = null;

    this.started = false;
    this.stopping = false;
    this.deepgramReady = false;
  }

  emitStatus(status, extra = {}) {
    this.onStatus({
      status,
      ...extra
    });
  }

  async start() {
    if (this.started) return true;

    const desktop = window.echoDesktop;

    if (
      !desktop?.startMeetingDeepgram ||
      !desktop?.sendMeetingDeepgramAudio ||
      !desktop?.onMeetingDeepgramEvent ||
      !desktop?.stopMeetingDeepgram
    ) {
      throw new Error(
        'Meeting-audio bridge is missing. Restart Echo after updating preload.cjs.'
      );
    }

    if (!this.sourceId) {
      throw new Error(
        'Choose a display or window source first.'
      );
    }

    this.stopping = false;
    this.deepgramReady = false;

    this.emitStatus('connecting');

    this.unsubscribe = desktop.onMeetingDeepgramEvent(
      (event) => {
        if (!event || typeof event !== 'object') return;

        if (event.type === 'transcript') {
          this.onTranscript(event);
          return;
        }

        if (event.type === 'status') {
          if (event.status === 'connected') {
            this.emitStatus('connected');
          }

          if (event.status === 'network-backpressure') {
            this.emitStatus('network-backpressure');
          }

          if (
            event.status === 'disconnected' &&
            !this.stopping
          ) {
            this.emitStatus('disconnected');

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
            new Error(
              event.message || 'Deepgram meeting transcription failed.'
            )
          );
        }
      }
    );

    this.audioCapture = new AudioCapture({
      sourceType: 'system',

      onFrame: (buffer) => {
        if (
          this.deepgramReady &&
          !this.stopping
        ) {
          desktop.sendMeetingDeepgramAudio(buffer);
        }
      },

      onError: (error) => {
        this.onError(error);
      }
    });

    try {
      /*
       * Start capture first.
       *
       * AudioCapture.start() calls getDisplayMedia immediately,
       * preserving the Start button's user gesture.
       */

      await this.audioCapture.start();

      if (this.stopping) {
        return false;
      }

      // The selected source was already validated by the main process.
      // Now open the separate Deepgram streaming session.

      await desktop.startMeetingDeepgram({
        language: this.language
      });

      if (this.stopping) {
        await desktop.stopMeetingDeepgram();
        return false;
      }

      this.deepgramReady = true;
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
    this.deepgramReady = false;

    try {
      await this.audioCapture?.stop();
    } catch {
      // Ignore cleanup errors.
    }

    this.audioCapture = null;

    try {
      await window.echoDesktop?.stopMeetingDeepgram?.();
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

    this.stopping = true;
    this.deepgramReady = false;

    this.emitStatus('stopping');

    // Stop local system-audio capture before closing Deepgram.
    try {
      await this.audioCapture?.stop();
    } catch (error) {
      this.onError(error);
    }

    this.audioCapture = null;

    try {
      await window.echoDesktop?.stopMeetingDeepgram?.();
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
