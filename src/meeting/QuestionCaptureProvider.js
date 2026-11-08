
import { AudioCapture } from '../speech/audioCapture.js';

export class QuestionCaptureProvider {
  constructor({
    language = 'en-IN',
    onStatus,
    onTranscript,
    onUtteranceEnd,
    onError
  } = {}) {
    this.language = language;

    this.onStatus =
      typeof onStatus === 'function' ? onStatus : () => {};

    this.onTranscript =
      typeof onTranscript === 'function' ? onTranscript : () => {};

    this.onUtteranceEnd =
      typeof onUtteranceEnd === 'function' ? onUtteranceEnd : () => {};

    this.onError =
      typeof onError === 'function' ? onError : () => {};

    this.audioCapture = null;
    this.unsubscribe = null;

    this.pendingFrames = [];

    this.started = false;
    this.stopping = false;
    this.cancelRequested = false;
    this.deepgramReady = false;

    this.startPromise = null;
    this.stopPromise = null;
  }

  emitStatus(status, extra = {}) {
    this.onStatus({ status, ...extra });
  }

  async start() {
    if (this.started) return true;
    if (this.startPromise) return this.startPromise;

    const desktop = window.echoDesktop;

    if (
      !desktop?.startMeetingDeepgram ||
      !desktop?.sendMeetingDeepgramAudio ||
      !desktop?.onMeetingDeepgramEvent ||
      !desktop?.stopMeetingDeepgram
    ) {
      throw new Error(
        'Question capture bridge is missing. Update preload.cjs and restart Echo.'
      );
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error(
        'System-audio capture is unavailable in this Electron window.'
      );
    }

    this.cancelRequested = false;
    this.stopping = false;
    this.deepgramReady = false;

    this.emitStatus('connecting');

    this.unsubscribe = desktop.onMeetingDeepgramEvent((event) => {
      if (!event || typeof event !== 'object' || this.stopping) {
        return;
      }

      if (event.type === 'transcript') {
        this.onTranscript(event);
        return;
      }

      if (event.type === 'utterance-end') {
        this.onUtteranceEnd(event);
        return;
      }

      if (event.type === 'speech-started') {
        this.emitStatus('hearing-speech');
        return;
      }

      if (event.type === 'status') {
        if (event.status === 'connected') {
          this.emitStatus('connected');
        } else if (event.status === 'network-backpressure') {
          this.emitStatus('network-backpressure');
        } else if (
          event.status === 'disconnected' &&
          !this.stopping
        ) {
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
            event.message || 'Deepgram question capture failed.'
          )
        );
      }
    });

    this.audioCapture = new AudioCapture({
      sourceType: 'system',

      onFrame: (buffer) => {
        if (this.stopping || this.cancelRequested) return;

        if (this.deepgramReady) {
          desktop.sendMeetingDeepgramAudio(buffer);
          return;
        }

        // Buffer at most about two seconds while the WebSocket opens.
        this.pendingFrames.push(buffer);

        if (this.pendingFrames.length > 100) {
          this.pendingFrames.shift();
        }
      },

      onError: (error) => {
        if (!this.stopping && !this.cancelRequested) {
          this.onError(error);
        }
      }
    });

    /*
     * IMPORTANT:
     * This is the first asynchronous operation.
     * AudioCapture.start() calls getDisplayMedia immediately.
     * This preserves the Ask button's user gesture.
     */

    this.startPromise = (async () => {
      try {
        await this.audioCapture.start();

        if (this.cancelRequested) {
          await this.audioCapture.stop();
          return false;
        }

        const track = this.audioCapture.stream
          ?.getAudioTracks?.()[0];

        if (!track) {
          throw new Error(
            'Windows did not provide a system-audio track.'
          );
        }

        track.onended = () => {
          if (!this.stopping && !this.cancelRequested) {
            this.onError(
              new Error('The system-audio capture ended.')
            );
          }
        };

        await desktop.startMeetingDeepgram({
          language: this.language,
          keyterms: []
        });

        if (this.cancelRequested) {
          await this.audioCapture.stop();
          await desktop.stopMeetingDeepgram();
          return false;
        }

        this.deepgramReady = true;

        // Flush the short audio buffer in original order.
        const queuedFrames = this.pendingFrames;
        this.pendingFrames = [];

        for (const frame of queuedFrames) {
          if (this.stopping || this.cancelRequested) break;

          desktop.sendMeetingDeepgramAudio(frame);
        }

        this.started = true;
        this.emitStatus('listening');

        return true;
      } catch (error) {
        if (!this.cancelRequested) {
          this.onError(error);
        }

        await this.cleanupAfterFailure();

        if (!this.cancelRequested) {
          throw error;
        }

        return false;
      } finally {
        this.startPromise = null;
      }
    })();

    return this.startPromise;
  }

  async cleanupAfterFailure() {
    this.stopping = true;
    this.deepgramReady = false;
    this.pendingFrames = [];

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
  }

  async stop() {
    if (this.stopPromise) {
      return this.stopPromise;
    }

    this.cancelRequested = true;
    this.stopping = true;
    this.deepgramReady = false;
    this.pendingFrames = [];

    this.emitStatus('stopping');

    this.stopPromise = (async () => {
      try {
        // Stop capture first, so no additional frames are sent.
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

      this.emitStatus('stopped');
    })();

    return this.stopPromise;
  }
}
