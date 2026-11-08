
const TARGET_SAMPLE_RATE = 16000;
const FRAME_SAMPLES = 320; // 20 ms at 16 kHz.

const WORKLET_SOURCE = `
class EchoPcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    const processorOptions = options.processorOptions || {};

    this.targetRate = processorOptions.targetRate || 16000;
    this.frameSamples = processorOptions.frameSamples || 320;

    this.ratio = this.targetRate / sampleRate;

    this.phase = 0;
    this.sum = 0;
    this.sumCount = 0;

    this.frame = new Int16Array(this.frameSamples);
    this.frameOffset = 0;
  }

  process(inputs, outputs) {
    for (const output of outputs) {
      for (const channel of output) {
        channel.fill(0);
      }
    }

    const input = inputs[0];

    if (!input || !input[0]) {
      return true;
    }

    const samples = input[0];

    for (let i = 0; i < samples.length; i += 1) {
      const value = Math.max(-1, Math.min(1, samples[i]));

      this.sum += value;
      this.sumCount += 1;

      this.phase += this.ratio;

      if (this.phase >= 1) {
        const averaged =
          this.sumCount > 0
            ? this.sum / this.sumCount
            : value;

        const clipped = Math.max(-1, Math.min(1, averaged));

        this.frame[this.frameOffset] =
          clipped < 0
            ? Math.round(clipped * 32768)
            : Math.round(clipped * 32767);

        this.frameOffset += 1;

        this.phase -= 1;

        this.sum = 0;
        this.sumCount = 0;

        if (this.frameOffset >= this.frameSamples) {
          const outputFrame = this.frame;

          this.frame = new Int16Array(this.frameSamples);
          this.frameOffset = 0;

          this.port.postMessage(
            outputFrame,
            [outputFrame.buffer]
          );
        }
      }
    }

    return true;
  }
}

registerProcessor(
  'echo-pcm-capture',
  EchoPcmCaptureProcessor
);
`;

export class AudioCapture {
  constructor({
    onFrame,
    onError,
    sourceType = 'microphone'
  }) {
    this.onFrame =
      typeof onFrame === 'function' ? onFrame : () => {};

    this.onError =
      typeof onError === 'function' ? onError : () => {};

    this.sourceType = sourceType;

    this.stream = null;
    this.context = null;
    this.source = null;
    this.worklet = null;
    this.muteGain = null;

    this.started = false;
  }

  async acquireStream() {
    if (!navigator.mediaDevices) {
      throw new Error(
        'Media capture is unavailable in this Electron window.'
      );
    }

    if (this.sourceType === 'system') {
      if (!navigator.mediaDevices.getDisplayMedia) {
        throw new Error(
          'System-audio capture is unavailable in this Electron version.'
        );
      }

      /*
       * IMPORTANT:
       * This getDisplayMedia call happens immediately when start()
       * is invoked by the Start button. Do not move it behind an
       * unrelated awaited IPC operation; the browser requires a
       * user gesture for display capture.
       */

      this.stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,

        video: {
          frameRate: {
            ideal: 1,
            max: 1
          }
        }
      });

      // We only use the audio stream.
      // Stop the temporary display video track immediately.

      for (const track of this.stream.getVideoTracks()) {
        track.stop();
      }

      if (this.stream.getAudioTracks().length === 0) {
        throw new Error(
          'Windows did not provide a system-audio track. Check your audio output and try again.'
        );
      }

      return this.stream;
    }

    if (!navigator.mediaDevices.getUserMedia) {
      throw new Error(
        'Microphone capture is unavailable in this Electron window.'
      );
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: {
          ideal: 1
        },

        sampleRate: {
          ideal: TARGET_SAMPLE_RATE
        },

        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      },

      video: false
    });

    return this.stream;
  }

  async start() {
    if (this.started) return;

    try {
      await this.acquireStream();

      this.context = new AudioContext({
        sampleRate: TARGET_SAMPLE_RATE,
        latencyHint: 'interactive'
      });

      if (!this.context.audioWorklet) {
        throw new Error(
          'This Electron version does not support AudioWorklet.'
        );
      }

      // Inline AudioWorklet avoids a separate module URL in packaged builds.

      const moduleBlob = new Blob(
        [WORKLET_SOURCE],
        {
          type: 'text/javascript'
        }
      );

      const moduleUrl = URL.createObjectURL(moduleBlob);

      try {
        await this.context.audioWorklet.addModule(moduleUrl);
      } finally {
        URL.revokeObjectURL(moduleUrl);
      }

      this.source = this.context.createMediaStreamSource(
        this.stream
      );

      this.worklet = new AudioWorkletNode(
        this.context,
        'echo-pcm-capture',
        {
          numberOfInputs: 1,
          numberOfOutputs: 1,

          outputChannelCount: [1],

          channelCount: 1,
          channelCountMode: 'explicit',

          processorOptions: {
            targetRate: TARGET_SAMPLE_RATE,
            frameSamples: FRAME_SAMPLES
          }
        }
      );

      // Mute local output. We don't want captured meeting audio
      // to be played a second time through Echo.

      this.muteGain = this.context.createGain();
      this.muteGain.gain.value = 0;

      this.worklet.port.onmessage = (event) => {
        const frame = event.data;

        if (frame instanceof Int16Array) {
          this.onFrame(frame.buffer);
        } else if (frame instanceof ArrayBuffer) {
          this.onFrame(frame);
        }
      };

      this.worklet.port.onmessageerror = () => {
        this.onError(
          new Error(
            'AudioWorklet returned an unreadable audio frame.'
          )
        );
      };

      this.source.connect(this.worklet);
      this.worklet.connect(this.muteGain);
      this.muteGain.connect(this.context.destination);

      await this.context.resume();

      this.started = true;

      return true;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop() {
    this.started = false;

    try {
      this.worklet?.port?.close();
    } catch {
      // Ignore cleanup errors.
    }

    try {
      this.source?.disconnect();
    } catch {
      // Ignore cleanup errors.
    }

    try {
      this.worklet?.disconnect();
    } catch {
      // Ignore cleanup errors.
    }

    try {
      this.muteGain?.disconnect();
    } catch {
      // Ignore cleanup errors.
    }

    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // Ignore cleanup errors.
        }
      }
    }

    if (
      this.context &&
      this.context.state !== 'closed'
    ) {
      try {
        await this.context.close();
      } catch {
        // Ignore cleanup errors.
      }
    }

    this.stream = null;
    this.context = null;
    this.source = null;
    this.worklet = null;
    this.muteGain = null;
  }
}
