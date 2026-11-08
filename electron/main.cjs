
'use strict';

const {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  screen,
  session,
  desktopCapturer,
  webContents,
  dialog,
  safeStorage,
  Menu,
  Tray,
  nativeImage
} = require('electron');

const path = require('node:path');
const { fileURLToPath } = require('node:url');
const dotenv = require('dotenv');

// Local .env files are for development only.
// Packaged builds use credentials entered by the user and stored securely.
if (!app.isPackaged) {
  dotenv.config({
    path: path.join(__dirname, '../.env')
  });
}

app.setName('Project Echo');

if (process.platform === 'win32') {
  app.setAppUserModelId('com.projectecho.desktop');
}

/* =========================================
   SERVICES
========================================= */

const {
  DeepgramSpeechSession
} = require('./speech/deepgramProvider.cjs');

const {
  createSystemAudioController
} = require('./meeting/systemAudioController.cjs');

const {
  SecureCredentialStore
} = require('./ai/secureCredentialStore.cjs');

const {
  createAIManager
} = require('./ai/aiManager.cjs');

const {
  createKnowledgeController
} = require('./knowledge/knowledgeController.cjs');

const {
  createScriptController
} = require('./scripts/scriptController.cjs');

const credentialStore = new SecureCredentialStore({
  appRef: app,
  safeStorageRef: safeStorage
});

const aiManager = createAIManager({
  store: credentialStore
});

/* =========================================
   GLOBAL STATE
========================================= */

let mainWindow = null;
let compactWindow = null;
let tray = null;

let compactResizeTimer = null;

let meetingAudioController = null;
let knowledgeController = null;
let scriptController = null;

let isQuitting = false;

const speechSessions = new Map();

let captureProtectionEnabled = false;
let compactAlwaysOnTop = true;
let compactOpacity = 0.94;
let compactSettingsExpanded = false;

const MIN_WIDTH = 420;
const MIN_HEIGHT = 150;

const DEFAULT_WIDTH = 520;
const DEFAULT_HEIGHT = 155;

const SETTINGS_HEIGHT = 450;

let compactBaseSize = {
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT
};

/* =========================================
   BRAND ASSETS
========================================= */

// These files are created from the official Project Echo logo.
// Keep the complete logo artwork identical across app and tray icons.

const APP_ICON_PNG_PATH = path.join(
  __dirname,
  '../assets/icons/app-icon.png'
);

const APP_ICON_ICO_PATH = path.join(
  __dirname,
  '../assets/icons/app-icon.ico'
);

const TRAY_ICON_PNG_PATH = path.join(
  __dirname,
  '../assets/tray/tray-icon.png'
);

function createImageFromPath(iconPath, label) {
  try {
    const icon = nativeImage.createFromPath(iconPath);

    if (!icon.isEmpty()) {
      return icon;
    }
  } catch (error) {
    console.warn(
      `[Echo] Could not load ${label}:`,
      error?.message || error
    );
  }

  console.warn(
    `[Echo] ${label} is unavailable at: ${iconPath}`
  );

  return nativeImage.createEmpty();
}

function getWindowIconPath() {
  if (process.platform === 'win32') {
    return APP_ICON_ICO_PATH;
  }

  return APP_ICON_PNG_PATH;
}

function setPlatformAppIcon() {
  if (process.platform === 'darwin' && app.dock) {
    const icon = createImageFromPath(
      APP_ICON_PNG_PATH,
      'macOS dock icon'
    );

    if (!icon.isEmpty()) {
      app.dock.setIcon(icon);
    }
  }
}

function createTrayIcon() {
  const icon = createImageFromPath(
    TRAY_ICON_PNG_PATH,
    'system tray icon'
  );

  if (icon.isEmpty()) {
    throw new Error(
      'The Project Echo tray icon could not be loaded. Check assets/tray/tray-icon.png.'
    );
  }

  // Windows/Linux use a compact 32px raster.
  // macOS uses a smaller image for the menu bar.
  // Both retain the exact original logo artwork.
  const size = process.platform === 'darwin' ? 18 : 32;

  return icon.resize({
    width: size,
    height: size,
    quality: 'best'
  });
}

/* =========================================
   WINDOW VISIBILITY
========================================= */

function showDashboard() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }

  mainWindow.show();
  mainWindow.focus();
}

function showTeleprompter() {
  createCompactWindow();
}

function hideTeleprompter() {
  if (compactWindow && !compactWindow.isDestroyed()) {
    compactWindow.hide();
  }
}

/* =========================================
   SYSTEM TRAY
========================================= */

function createTray() {
  if (tray) return tray;

  try {
    tray = new Tray(createTrayIcon());

    tray.setToolTip('Project Echo');

    const menu = Menu.buildFromTemplate([
      {
        label: 'Open Dashboard',
        click: showDashboard
      },
      {
        label: 'Show Teleprompter',
        click: showTeleprompter
      },
      {
        label: 'Hide Teleprompter',
        click: hideTeleprompter
      },
      {
        type: 'separator'
      },
      {
        label: 'Quit Echo',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(menu);

    tray.on('click', showDashboard);
    tray.on('double-click', showDashboard);

    return tray;
  } catch (error) {
    tray = null;

    console.error(
      '[Echo] Could not create the system tray:',
      error?.message || error
    );

    return null;
  }
}

/* =========================================
   APP URL AND WINDOW SECURITY
========================================= */

const DEV_SERVER_ORIGIN = 'http://127.0.0.1:5173';

const PACKAGED_ENTRY = path.resolve(
  __dirname,
  '../dist/index.html'
);

function isInternalAppUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);

    if (!app.isPackaged) {
      return (
        url.origin === DEV_SERVER_ORIGIN &&
        url.pathname === '/'
      );
    }

    if (url.protocol !== 'file:') {
      return false;
    }

    return (
      path.resolve(fileURLToPath(url)) === PACKAGED_ENTRY
    );
  } catch {
    return false;
  }
}

function hardenWindow(win) {
  win.webContents.setWindowOpenHandler(() => ({
    action: 'deny'
  }));

  win.webContents.on('will-navigate', (event, url) => {
    if (!isInternalAppUrl(url)) {
      event.preventDefault();
    }
  });
}

function loadAppWindow(win, query = {}) {
  if (!win || win.isDestroyed()) {
    return Promise.resolve();
  }

  if (app.isPackaged) {
    return win.loadFile(
      PACKAGED_ENTRY,
      { query }
    );
  }

  const url = new URL(`${DEV_SERVER_ORIGIN}/`);

  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }

  return win.loadURL(url.toString());
}

function reportLoadFailure(label, error) {
  console.error(
    `[Echo] ${label} failed to load:`,
    error?.stack || error
  );
}

/* =========================================
   CAPTURE PROTECTION
========================================= */

function isCaptureProtectionSupported() {
  return (
    process.platform === 'win32' ||
    process.platform === 'darwin'
  );
}

function applyContentProtection(win, enabled) {
  if (
    !win ||
    win.isDestroyed() ||
    !isCaptureProtectionSupported()
  ) {
    return false;
  }

  try {
    win.setContentProtection(Boolean(enabled));
    return true;
  } catch (error) {
    console.warn(
      '[Echo] Content protection could not be applied:',
      error?.message || error
    );

    return false;
  }
}

/* =========================================
   WINDOW SIZE HELPERS
========================================= */

function getLimits(
  display = screen.getPrimaryDisplay()
) {
  const area = display.workArea;

  return {
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,

    maxWidth: Math.max(
      MIN_WIDTH,
      Math.min(1000, area.width - 20)
    ),

    maxHeight: Math.max(
      MIN_HEIGHT,
      Math.min(600, area.height - 20)
    )
  };
}

function clampSize(
  width,
  height,
  display = screen.getPrimaryDisplay()
) {
  const limits = getLimits(display);

  const requestedWidth = Number(width);
  const requestedHeight = Number(height);

  const safeWidth = Number.isFinite(requestedWidth)
    ? Math.round(requestedWidth)
    : DEFAULT_WIDTH;

  const safeHeight = Number.isFinite(requestedHeight)
    ? Math.round(requestedHeight)
    : DEFAULT_HEIGHT;

  return {
    width: Math.max(
      limits.minWidth,
      Math.min(limits.maxWidth, safeWidth)
    ),

    height: Math.max(
      limits.minHeight,
      Math.min(limits.maxHeight, safeHeight)
    )
  };
}

function getInitialBounds() {
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;

  compactBaseSize = clampSize(
    compactBaseSize.width,
    compactBaseSize.height,
    display
  );

  return {
    x: Math.round(
      area.x + (area.width - compactBaseSize.width) / 2
    ),

    y: area.y + 6,

    width: compactBaseSize.width,
    height: compactBaseSize.height
  };
}

function applyCompactSize(width, height) {
  const win = compactWindow;

  const display =
    win && !win.isDestroyed()
      ? screen.getDisplayMatching(win.getBounds())
      : screen.getPrimaryDisplay();

  const area = display.workArea;

  const size = clampSize(
    width,
    height,
    display
  );

  compactBaseSize = size;

  if (!win || win.isDestroyed()) {
    return size;
  }

  const current = win.getBounds();

  const x = Math.max(
    area.x,
    Math.min(
      area.x + area.width - size.width,
      current.x
    )
  );

  const actualHeight = compactSettingsExpanded
    ? Math.max(
        size.height,
        Math.min(
          SETTINGS_HEIGHT,
          area.height - 20
        )
      )
    : size.height;

  const y = Math.max(
    area.y,
    Math.min(
      area.y + area.height - actualHeight,
      current.y
    )
  );

  if (!win.isDestroyed()) {
    win.setBounds({
      x,
      y,
      width: size.width,
      height: actualHeight
    });
  }

  return size;
}

/* =========================================
   SETTINGS WINDOW EXPANSION
========================================= */

function resizeCompactSettings(expanded) {
  compactSettingsExpanded = Boolean(expanded);

  const win = compactWindow;

  if (!win || win.isDestroyed()) {
    return;
  }

  const current = win.getBounds();

  const display = screen.getDisplayMatching(current);
  const area = display.workArea;

  const availableHeight =
    area.height - (current.y - area.y) - 10;

  const newHeight = compactSettingsExpanded
    ? Math.max(
        compactBaseSize.height,
        Math.min(
          SETTINGS_HEIGHT,
          availableHeight
        )
      )
    : compactBaseSize.height;

  if (!win.isDestroyed()) {
    win.setBounds({
      x: current.x,
      y: current.y,
      width: compactBaseSize.width,
      height: newHeight
    });
  }
}

/* =========================================
   TRUSTED RENDERER CHECKS
========================================= */

function isTrustedRenderer(sender) {
  if (
    !sender ||
    typeof sender.id !== 'number' ||
    sender.isDestroyed()
  ) {
    return false;
  }

  const matchesWindow = [
    mainWindow,
    compactWindow
  ].some((win) => {
    if (!win || win.isDestroyed()) return false;

    return win.webContents.id === sender.id;
  });

  if (!matchesWindow) return false;

  try {
    return isInternalAppUrl(sender.getURL());
  } catch {
    return false;
  }
}

function assertTrustedRenderer(event) {
  if (!isTrustedRenderer(event.sender)) {
    throw new Error(
      'Untrusted renderer cannot access this Echo service.'
    );
  }
}

function assertCompactRenderer(event) {
  const sender = event?.sender;

  const isCompact = Boolean(
    sender &&
    compactWindow &&
    !compactWindow.isDestroyed() &&
    compactWindow.webContents.id === sender.id &&
    isTrustedRenderer(sender)
  );

  if (!isCompact) {
    throw new Error(
      'Only the Echo floating teleprompter can perform this action.'
    );
  }
}

function trustedHandle(
  channel,
  callback,
  compactOnly = false
) {
  ipcMain.handle(
    channel,
    async (event, ...args) => {
      if (compactOnly) {
        assertCompactRenderer(event);
      } else {
        assertTrustedRenderer(event);
      }

      return callback(event, ...args);
    }
  );
}

/* =========================================
   DEEPGRAM SESSION CLEANUP
========================================= */

async function stopSpeechForSender(senderId) {
  const speechSession = speechSessions.get(senderId);

  if (!speechSession) return false;

  speechSessions.delete(senderId);

  try {
    await speechSession.stop();
  } catch (error) {
    console.error(
      '[Deepgram] Session cleanup failed:',
      error?.message || error
    );
  }

  return true;
}

/* =========================================
   DASHBOARD WINDOW
========================================= */

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();

    return mainWindow;
  }

  const win = new BrowserWindow({
    width: 1180,
    height: 780,

    minWidth: 850,
    minHeight: 620,

    backgroundColor: '#ffffff',

    title: 'Project Echo',
    icon: getWindowIconPath(),
    autoHideMenuBar: true,

    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow = win;

  const senderId = win.webContents.id;

  win.setMenuBarVisibility(false);

  applyContentProtection(
    win,
    captureProtectionEnabled
  );

  hardenWindow(win);

  // Closing the dashboard hides it to the tray.
  // Choosing Quit Echo sets isQuitting first and closes normally.

  win.on('close', (event) => {
    if (!isQuitting && tray) {
      event.preventDefault();
      win.hide();
    }
  });

  loadAppWindow(win).catch((error) => {
    reportLoadFailure('Dashboard', error);
  });

  win.once('closed', () => {
    void stopSpeechForSender(senderId);

    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  return win;
}

/* =========================================
   FLOATING TELEPROMPTER WINDOW
========================================= */

function createCompactWindow(initialSize) {
  if (initialSize && typeof initialSize === 'object') {
    compactBaseSize = clampSize(
      initialSize.width,
      initialSize.height,
      screen.getPrimaryDisplay()
    );
  }

  if (
    compactWindow &&
    !compactWindow.isDestroyed()
  ) {
    if (initialSize) {
      applyCompactSize(
        compactBaseSize.width,
        compactBaseSize.height
      );
    }

    compactWindow.show();
    compactWindow.focus();

    return compactWindow;
  }

  compactSettingsExpanded = false;

  const bounds = getInitialBounds();
  const limits = getLimits();

  const win = new BrowserWindow({
    ...bounds,

    minWidth: limits.minWidth,
    minHeight: limits.minHeight,

    maxWidth: limits.maxWidth,
    maxHeight: limits.maxHeight,

    frame: false,
    transparent: true,
    backgroundColor: '#00000000',

    roundedCorners: true,
    thickFrame: false,
    hasShadow: false,

    opacity: compactOpacity,

    resizable: false,
    movable: true,

    maximizable: false,
    minimizable: false,
    fullscreenable: false,

    skipTaskbar: true,
    show: false,

    title: 'Project Echo',
    icon: getWindowIconPath(),

    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });

  compactWindow = win;

  const compactSenderId = win.webContents.id;

  win.setMinimumSize(
    limits.minWidth,
    limits.minHeight
  );

  win.setMaximumSize(
    limits.maxWidth,
    limits.maxHeight
  );

  win.setMenuBarVisibility(false);

  win.setAlwaysOnTop(
    compactAlwaysOnTop,
    'floating'
  );

  win.setOpacity(compactOpacity);
  win.setBackgroundColor('#00000000');

  applyContentProtection(
    win,
    captureProtectionEnabled
  );

  if (typeof win.setVisibleOnAllWorkspaces === 'function') {
    win.setVisibleOnAllWorkspaces(
      true,
      { visibleOnFullScreen: true }
    );
  }

  hardenWindow(win);

  loadAppWindow(win, {
    view: 'compact'
  }).catch((error) => {
    reportLoadFailure('Floating teleprompter', error);
  });

  // Resize events update React state only.
  // This listener never calls setBounds.

  win.on('resize', () => {
    if (
      win.isDestroyed() ||
      compactWindow !== win ||
      compactSettingsExpanded
    ) {
      return;
    }

    if (compactResizeTimer) {
      clearTimeout(compactResizeTimer);
    }

    compactResizeTimer = setTimeout(() => {
      compactResizeTimer = null;

      if (
        win.isDestroyed() ||
        compactWindow !== win ||
        compactSettingsExpanded
      ) {
        return;
      }

      try {
        const [width, height] = win.getSize();

        const display = screen.getDisplayMatching(
          win.getBounds()
        );

        compactBaseSize = clampSize(
          width,
          height,
          display
        );

        if (!win.webContents.isDestroyed()) {
          win.webContents.send(
            'echo:compact-size-changed',
            compactBaseSize
          );
        }
      } catch (error) {
        console.warn(
          '[Echo] Could not sync compact window size:',
          error?.message || error
        );
      }
    }, 80);
  });

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) {
      win.show();
    }
  });

  win.once('closed', () => {
    if (compactResizeTimer) {
      clearTimeout(compactResizeTimer);
      compactResizeTimer = null;
    }

    void stopSpeechForSender(compactSenderId);

    if (meetingAudioController) {
      Promise.resolve(
        meetingAudioController.stopForSender(compactSenderId)
      ).catch((error) => {
        console.warn(
          '[Echo] Meeting stream cleanup failed:',
          error?.message || error
        );
      });
    }

    if (compactWindow === win) {
      compactWindow = null;
    }

    compactSettingsExpanded = false;
  });

  return win;
}

/* =========================================
   SPEECH CREDENTIAL RESOLUTION
========================================= */

async function getDeepgramApiKey() {
  const savedKey =
    await credentialStore.getDeepgramApiKey();

  return savedKey || process.env.DEEPGRAM_API_KEY || '';
}

async function getSpeechConfiguration() {
  const publicState =
    await credentialStore.getPublicState();

  const savedConfigured = Boolean(
    publicState?.speech?.deepgramConfigured
  );

  const environmentConfigured = Boolean(
    process.env.DEEPGRAM_API_KEY
  );

  return {
    deepgram: {
      configured: savedConfigured || environmentConfigured,

      source: savedConfigured
        ? 'secure-storage'
        : environmentConfigured
          ? 'environment'
          : null
    }
  };
}

/* =========================================
   APPLICATION STARTUP
========================================= */

app.whenReady().then(() => {
  meetingAudioController = createSystemAudioController({
    desktopCapturer,
    ipcMain,
    session: session.defaultSession,
    webContents,
    getCompactWindow: () => compactWindow,
    getDeepgramApiKey
  });

  knowledgeController = createKnowledgeController({
    app,
    ipcMain,
    dialog,
    aiManager,
    isTrustedRenderer,
    getMainWindow: () => mainWindow
  });

  scriptController = createScriptController({
    app,
    ipcMain,
    isTrustedRenderer
  });

  // Apply the official logo to the macOS Dock and system tray.
  setPlatformAppIcon();

  // Create the tray before the dashboard so close-to-tray is available.
  createTray();

  /* =========================================
     PERMISSION REQUEST HANDLER
  ========================================= */

  session.defaultSession.setPermissionRequestHandler(
    (requestingContents, permission, callback, details) => {
      if (permission === 'display-capture') {
        callback(
          meetingAudioController?.isCompactRenderer(
            requestingContents
          ) === true
        );

        return;
      }

      if (
        permission !== 'media' ||
        !isTrustedRenderer(requestingContents)
      ) {
        callback(false);
        return;
      }

      const mediaTypes = Array.isArray(details?.mediaTypes)
        ? details.mediaTypes
        : [];

      const audioOnly =
        mediaTypes.includes('audio') &&
        !mediaTypes.includes('video');

      callback(audioOnly);
    }
  );

  /* =========================================
     PERMISSION CHECK HANDLER
  ========================================= */

  session.defaultSession.setPermissionCheckHandler(
    (requestingContents, permission, _origin, details) => {
      if (permission === 'display-capture') {
        return (
          meetingAudioController?.isCompactRenderer(
            requestingContents
          ) === true
        );
      }

      if (
        permission !== 'media' ||
        !requestingContents ||
        !isTrustedRenderer(requestingContents)
      ) {
        return false;
      }

      return details?.mediaType === 'audio';
    }
  );

  createMainWindow();

  /* =========================================
     GLOBAL SHORTCUTS
  ========================================= */

  globalShortcut.register(
    'CommandOrControl+Shift+E',
    showTeleprompter
  );

  globalShortcut.register(
    'CommandOrControl+Shift+D',
    showDashboard
  );

}).catch((error) => {
  console.error(
    '[Echo] Application startup failed:',
    error?.stack || error
  );
});

/* =========================================
   IPC: FLOATING WINDOW
========================================= */

trustedHandle(
  'echo:open-compact',
  (_event, size) => {
    createCompactWindow(size);
    return true;
  }
);

trustedHandle(
  'echo:close-compact',
  () => {
    if (
      compactWindow &&
      !compactWindow.isDestroyed()
    ) {
      compactWindow.close();
    }

    return true;
  }
);

trustedHandle(
  'echo:set-compact-size',
  (_event, size) => {
    if (!size || typeof size !== 'object') {
      return compactBaseSize;
    }

    return applyCompactSize(
      size.width,
      size.height
    );
  }
);

trustedHandle(
  'echo:get-compact-size',
  () => compactBaseSize
);

trustedHandle(
  'echo:set-compact-settings-open',
  (_event, expanded) => {
    resizeCompactSettings(expanded);
    return compactSettingsExpanded;
  }
);

/* =========================================
   IPC: APPEARANCE
========================================= */

trustedHandle(
  'echo:set-window-opacity',
  (_event, value) => {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return compactOpacity;
    }

    compactOpacity = Math.max(
      0.45,
      Math.min(1, number)
    );

    if (
      compactWindow &&
      !compactWindow.isDestroyed()
    ) {
      compactWindow.setOpacity(compactOpacity);
    }

    return compactOpacity;
  }
);

trustedHandle(
  'echo:get-window-opacity',
  () => compactOpacity
);

trustedHandle(
  'echo:toggle-always-on-top',
  (_event, enabled) => {
    compactAlwaysOnTop = Boolean(enabled);

    if (
      compactWindow &&
      !compactWindow.isDestroyed()
    ) {
      compactWindow.setAlwaysOnTop(
        compactAlwaysOnTop,
        'floating'
      );
    }

    return compactAlwaysOnTop;
  }
);

/* =========================================
   IPC: CAPTURE PROTECTION
========================================= */

trustedHandle(
  'echo:set-capture-protection',
  (_event, enabled) => {
    const supported = isCaptureProtectionSupported();

    captureProtectionEnabled =
      supported && Boolean(enabled);

    for (const win of [
      mainWindow,
      compactWindow
    ]) {
      if (win && !win.isDestroyed()) {
        applyContentProtection(
          win,
          captureProtectionEnabled
        );
      }
    }

    return {
      enabled: captureProtectionEnabled,
      supported,
      platform: process.platform
    };
  }
);

trustedHandle(
  'echo:get-capture-protection',
  () => captureProtectionEnabled
);

trustedHandle(
  'echo:get-platform',
  () => process.platform
);

/* =========================================
   IPC: MICROPHONE DEEPGRAM STREAM
========================================= */

trustedHandle(
  'echo:deepgram-start',
  async (event, options = {}) => {
    const apiKey = await getDeepgramApiKey();

    if (!apiKey) {
      throw new Error(
        'Deepgram is not configured. Open Settings > Speech & audio and save your API key.'
      );
    }

    await stopSpeechForSender(event.sender.id);

    const sender = event.sender;

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
          isTrustedRenderer(sender)
        ) {
          sender.send(
            'echo:deepgram-event',
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
        language:
          typeof options.language === 'string'
            ? options.language
            : 'en-IN'
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
  },
  true
);

ipcMain.on(
  'echo:deepgram-audio',
  (event, audioBuffer) => {
    if (!isTrustedRenderer(event.sender)) {
      return;
    }

    const speechSession = speechSessions.get(
      event.sender.id
    );

    if (speechSession) {
      speechSession.sendAudio(audioBuffer);
    }
  }
);

trustedHandle(
  'echo:deepgram-stop',
  (event) => stopSpeechForSender(event.sender.id)
);

/* =========================================
   IPC: DEEPGRAM CREDENTIAL SETTINGS
========================================= */

trustedHandle(
  'echo:speech:get-configuration',
  () => getSpeechConfiguration()
);

trustedHandle(
  'echo:speech:save-deepgram-key',
  async (_event, apiKey) => {
    await credentialStore.saveDeepgramApiKey(apiKey);
    return getSpeechConfiguration();
  }
);

trustedHandle(
  'echo:speech:delete-deepgram-key',
  async () => {
    await credentialStore.deleteDeepgramApiKey();
    return getSpeechConfiguration();
  }
);

trustedHandle(
  'echo:speech:test-deepgram',
  async () => {
    const apiKey = await getDeepgramApiKey();

    if (!apiKey) {
      throw new Error(
        'Save a Deepgram API key in Settings > Speech & audio first.'
      );
    }

    const testSession = new DeepgramSpeechSession({
      apiKey,
      language: 'en-IN',
      keyterms: [],

      onEvent: (payload) => {
        if (payload?.type === 'error') {
          console.warn(
            '[Deepgram test]',
            payload.message || 'Provider reported an error.'
          );
        }
      }
    });

    try {
      const result = await testSession.start();

      return {
        success: true,
        provider: 'deepgram',
        model: result?.model || 'nova-3',
        message: 'Deepgram connection successful.'
      };
    } finally {
      await testSession.stop();
    }
  }
);

/* =========================================
   IPC: UNIVERSAL AI PROVIDER
========================================= */

trustedHandle(
  'echo:ai:list-providers',
  () => aiManager.getProviders()
);

trustedHandle(
  'echo:ai:get-configuration',
  () => aiManager.getConfiguration()
);

trustedHandle(
  'echo:ai:save-configuration',
  (_event, config) => aiManager.saveConfiguration(config)
);

trustedHandle(
  'echo:ai:set-active-provider',
  (_event, provider) => aiManager.setActiveProvider(provider)
);

trustedHandle(
  'echo:ai:delete-provider',
  (_event, provider) => aiManager.deleteProvider(provider)
);

trustedHandle(
  'echo:ai:test-connection',
  (_event, config) => aiManager.testConnection(config)
);

trustedHandle(
  'echo:ai:list-models',
  (_event, config) => aiManager.listModels(config)
);

trustedHandle(
  'echo:ai:generate-answer',
  (_event, payload = {}) => aiManager.generateAnswer({
    question: payload.question,
    conversation: payload.conversation,
    context: payload.context,
    answerStyle: payload.answerStyle
  }),
  true
);

/* =========================================
   APPLICATION LIFECYCLE
========================================= */

app.on('activate', () => {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    !mainWindow.isVisible()
  ) {
    showDashboard();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  try {
    scriptController?.dispose();
  } catch (error) {
    console.error(
      '[Echo] Script controller cleanup failed:',
      error?.message || error
    );
  }

  try {
    knowledgeController?.dispose();
  } catch (error) {
    console.error(
      '[Echo] Knowledge controller cleanup failed:',
      error?.message || error
    );
  }

  try {
    meetingAudioController?.dispose();
  } catch (error) {
    console.error(
      '[Echo] Meeting audio cleanup failed:',
      error?.message || error
    );
  }

  for (const senderId of [...speechSessions.keys()]) {
    void stopSpeechForSender(senderId);
  }

  if (compactResizeTimer) {
    clearTimeout(compactResizeTimer);
    compactResizeTimer = null;
  }

  if (tray) {
    tray.destroy();
    tray = null;
  }

  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // If the tray exists, closing windows must not quit Echo.
  // If tray creation failed, preserve normal platform behaviour.
  if (!tray && process.platform !== 'darwin') {
    app.quit();
  }
});
