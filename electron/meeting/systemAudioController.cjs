
'use strict';

const {
  DeepgramSpeechSession
} = require('../speech/deepgramProvider.cjs');

/* =========================================
   PLATFORM VERSION
========================================= */

function getMacMajorVersion() {
  if (
    process.platform !== 'darwin' ||
    typeof process.getSystemVersion !== 'function'
  ) {
    return 0;
  }

  const version = String(
    process.getSystemVersion() || ''
  );

  const major = Number(version.split('.')[0]);

  return Number.isFinite(major) ? major : 0;
}

/* =========================================
   SYSTEM AUDIO CONTROLLER
========================================= */

function createSystemAudioController({
  desktopCapturer,
  ipcMain,
  session,
  webContents,
  getCompactWindow,
  getDeepgramApiKey
}) {
  if (
    !desktopCapturer ||
    !ipcMain ||
    !session ||
    !webContents
  ) {
    throw new Error(
      'System audio controller is missing an Electron dependency.'
    );
  }

  const speechSessions = new Map();

  let displayMediaHandlerInstalled = false;

  /* =========================================
     COMPACT RENDERER VALIDATION
  ========================================= */

  function isCompactRenderer(sender) {
    const compactWindow = getCompactWindow?.();

    return Boolean(
      compactWindow &&
      !compactWindow.isDestroyed() &&
      sender &&
      !sender.isDestroyed() &&
      compactWindow.webContents.id === sender.id
    );
  }

  function assertCompactRenderer(sender) {
    if (!isCompactRenderer(sender)) {
      throw new Error(
        'Only the Echo floating teleprompter can access system audio.'
      );
    }
  }

  /* =========================================
     PLATFORM CAPABILITIES
  ========================================= */

  function getSupport() {
    if (process.platform === 'win32') {
      return {
        supported: true,
        platform: process.platform,
        method: 'electron-loopback',
        experimental: false,
        message:
          'Windows system-audio loopback is available.'
      };
    }

    if (process.platform === 'darwin') {
      const major = getMacMajorVersion();
      const supported = major >= 15;

      return {
        supported,
        platform: process.platform,
        method: supported
          ? 'macos-system-picker'
          : null,
        experimental: true,
        message: supported
          ? 'macOS system-audio capture uses the native picker. Grant Screen & System Audio Recording permission when prompted.'
          : 'System-audio question capture requires macOS 15 or later with the native system picker. Microphone tracking and AI answers remain available.'
      };
    }

    if (process.platform === 'linux') {
      return {
        supported: false,
        platform: process.platform,
        method: null,
        experimental: false,
        message:
          'System-audio question capture is not enabled on Linux in this beta. Microphone tracking, scripts and AI answers remain available.'
      };
    }

    return {
      supported: false,
      platform: process.platform,
      method: null,
      experimental: false,
      message:
        'System-audio question capture is not supported on this platform yet.'
    };
  }

  /* =========================================
     WINDOWS SOURCE SELECTION
  ========================================= */

  async function getPrimaryScreenSource() {
    if (process.platform !== 'win32') {
      throw new Error(
        'The custom loopback source selector is only used on Windows.'
      );
    }

    const sources = await desktopCapturer.getSources({
      types: ['screen'],

      thumbnailSize: {
        width: 0,
        height: 0
      },

      fetchWindowIcons: false
    });

    if (!sources.length) {
      throw new Error(
        'No Windows display source is available for system-audio capture.'
      );
    }

    return sources[0];
  }

  /* =========================================
     SESSION CLEANUP
  ========================================= */

  async function stopSession(senderId) {
    const speechSession = speechSessions.get(senderId);

    if (!speechSession) return false;

    speechSessions.delete(senderId);

    try {
      await speechSession.stop();
    } catch (error) {
      console.error(
        '[Meeting audio] Deepgram cleanup failed:',
        error?.message || error
      );
    }

    return true;
  }

  /* =========================================
     START DEEPGRAM
  ========================================= */

  async function startDeepgram(sender, options = {}) {
    assertCompactRenderer(sender);

    const support = getSupport();

    if (!support.supported) {
      throw new Error(support.message);
    }

    const apiKey =
      typeof getDeepgramApiKey === 'function'
        ? await getDeepgramApiKey()
        : process.env.DEEPGRAM_API_KEY || '';

    if (!apiKey) {
      throw new Error(
        'Deepgram is not configured. Open Settings > Speech & audio and save your API key.'
      );
    }

    await stopSession(sender.id);

    const speechSession = new DeepgramSpeechSession({
      apiKey,

      language:
        typeof options.language === 'string'
          ? options.language
          : 'en-IN',

      keyterms: Array.isArray(options.keyterms)
        ? options.keyterms
        : [],

      onEvent: (payload) => {
        if (
          !sender.isDestroyed() &&
          isCompactRenderer(sender)
        ) {
          sender.send(
            'echo:meeting-audio:deepgram-event',
            payload
          );
        }
      }
    });

    speechSessions.set(
      sender.id,
      speechSession
    );

    try {
      const result = await speechSession.start();

      return {
        ...result,
        provider: 'deepgram',
        stream: 'one-question',
        platform: process.platform
      };
    } catch (error) {
      speechSessions.delete(sender.id);

      try {
        await speechSession.stop();
      } catch {
        // Ignore cleanup errors.
      }

      throw error;
    }
  }

  /* =========================================
     SEND AUDIO
  ========================================= */

  function sendAudio(sender, audioBuffer) {
    if (!isCompactRenderer(sender)) {
      return false;
    }

    const speechSession = speechSessions.get(sender.id);

    if (!speechSession) {
      return false;
    }

    return speechSession.sendAudio(audioBuffer);
  }

  /* =========================================
     DISPLAY MEDIA REQUEST VALIDATION
  ========================================= */

  function validateDisplayRequest(request) {
    const frame = request?.frame;

    if (!frame || frame !== frame.top) {
      return null;
    }

    const requester = webContents.fromFrame(frame);

    if (
      !requester ||
      !isCompactRenderer(requester) ||
      !request.userGesture ||
      !request.videoRequested ||
      !request.audioRequested
    ) {
      return null;
    }

    return requester;
  }

  /* =========================================
     PLATFORM-SPECIFIC DISPLAY CAPTURE
  ========================================= */

  function installDisplayCaptureHandler() {
    /*
     * Windows:
     * Electron's loopback source is supported here.
     */

    if (process.platform === 'win32') {
      session.setDisplayMediaRequestHandler(
        async (request, callback) => {
          try {
            const requester =
              validateDisplayRequest(request);

            if (!requester) {
              callback(null);
              return;
            }

            const source =
              await getPrimaryScreenSource();

            callback({
              video: source,
              audio: 'loopback'
            });
          } catch (error) {
            console.error(
              '[Meeting audio] Windows capture request failed:',
              error?.message || error
            );

            callback(null);
          }
        }
      );

      displayMediaHandlerInstalled = true;
      return;
    }

    /*
     * macOS 15+:
     * Ask Electron to use the native system picker.
     * When the picker is available, Electron does not invoke
     * our custom handler.
     */

    if (
      process.platform === 'darwin' &&
      getMacMajorVersion() >= 15
    ) {
      session.setDisplayMediaRequestHandler(
        (request, callback) => {
          const requester =
            validateDisplayRequest(request);

          if (!requester) {
            callback(null);
            return;
          }

          // Do not fabricate a Windows-style loopback source.
          callback(null);
        },
        {
          useSystemPicker: true
        }
      );

      displayMediaHandlerInstalled = true;
    }

    /*
     * Linux:
     * Leave Electron's display-capture handler untouched.
     * System-audio question capture remains disabled in this beta.
     */
  }

  installDisplayCaptureHandler();

  /* =========================================
     IPC HANDLERS
     This controller exclusively owns these channels.
  ========================================= */

  ipcMain.handle(
    'echo:meeting-audio:support',
    (event) => {
      assertCompactRenderer(event.sender);
      return getSupport();
    }
  );

  ipcMain.handle(
    'echo:meeting-audio:deepgram-start',
    (event, options) =>
      startDeepgram(event.sender, options)
  );

  ipcMain.on(
    'echo:meeting-audio:deepgram-audio',
    (event, audioBuffer) => {
      sendAudio(event.sender, audioBuffer);
    }
  );

  ipcMain.handle(
    'echo:meeting-audio:deepgram-stop',
    (event) => {
      assertCompactRenderer(event.sender);
      return stopSession(event.sender.id);
    }
  );

  /* =========================================
     EXPORTED LIFECYCLE
  ========================================= */

  function stopForSender(senderId) {
    return stopSession(senderId);
  }

  function dispose() {
    for (const senderId of [...speechSessions.keys()]) {
      void stopSession(senderId);
    }

    if (displayMediaHandlerInstalled) {
      try {
        session.setDisplayMediaRequestHandler(null);
      } catch (error) {
        console.error(
          '[Meeting audio] Capture handler cleanup failed:',
          error?.message || error
        );
      }

      displayMediaHandlerInstalled = false;
    }
  }

  return {
    isCompactRenderer,
    stopForSender,
    getSupport,
    dispose
  };
}

module.exports = {
  createSystemAudioController
};
