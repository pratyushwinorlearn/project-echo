
'use strict';

const {
  contextBridge,
  ipcRenderer
} = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {};

  const listener = (_event, payload) => callback(payload);

  ipcRenderer.on(channel, listener);

  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld('echoDesktop', {
  /* =========================================
     FLOATING WINDOW
  ========================================= */

  openCompact: (size) =>
    ipcRenderer.invoke('echo:open-compact', size),

  closeCompact: () =>
    ipcRenderer.invoke('echo:close-compact'),

  setCompactSize: (size) =>
    ipcRenderer.invoke('echo:set-compact-size', size),

  getCompactSize: () =>
    ipcRenderer.invoke('echo:get-compact-size'),

  setCompactSettingsOpen: (expanded) =>
    ipcRenderer.invoke('echo:set-compact-settings-open', expanded),

  onCompactSizeChanged: (callback) =>
    subscribe('echo:compact-size-changed', callback),

  /* =========================================
     APPEARANCE
  ========================================= */

  setWindowOpacity: (opacity) =>
    ipcRenderer.invoke('echo:set-window-opacity', opacity),

  getWindowOpacity: () =>
    ipcRenderer.invoke('echo:get-window-opacity'),

  setAlwaysOnTop: (enabled) =>
    ipcRenderer.invoke('echo:toggle-always-on-top', enabled),

  /* =========================================
     CAPTURE PROTECTION
  ========================================= */

  setCaptureProtection: (enabled) =>
    ipcRenderer.invoke('echo:set-capture-protection', enabled),

  getCaptureProtection: () =>
    ipcRenderer.invoke('echo:get-capture-protection'),

  getPlatform: () =>
    ipcRenderer.invoke('echo:get-platform'),

  /* =========================================
     MICROPHONE / TELEPROMPTER DEEPGRAM
  ========================================= */

  startDeepgram: (options) =>
    ipcRenderer.invoke('echo:deepgram-start', options),

  sendDeepgramAudio: (audioBuffer) =>
    ipcRenderer.send('echo:deepgram-audio', audioBuffer),

  stopDeepgram: () =>
    ipcRenderer.invoke('echo:deepgram-stop'),

  onDeepgramEvent: (callback) =>
    subscribe('echo:deepgram-event', callback),

  /* =========================================
     ONE-QUESTION SYSTEM AUDIO CAPTURE
  ========================================= */

  getMeetingAudioSupport: () =>
    ipcRenderer.invoke('echo:meeting-audio:support'),

  startMeetingDeepgram: (options) =>
    ipcRenderer.invoke('echo:meeting-audio:deepgram-start', options),

  sendMeetingDeepgramAudio: (audioBuffer) =>
    ipcRenderer.send('echo:meeting-audio:deepgram-audio', audioBuffer),

  stopMeetingDeepgram: () =>
    ipcRenderer.invoke('echo:meeting-audio:deepgram-stop'),

  onMeetingDeepgramEvent: (callback) =>
    subscribe('echo:meeting-audio:deepgram-event', callback),

  /* =========================================
     UNIVERSAL AI PROVIDER CONFIGURATION
  ========================================= */

  getAIProviders: () =>
    ipcRenderer.invoke('echo:ai:list-providers'),

  getAIConfiguration: () =>
    ipcRenderer.invoke('echo:ai:get-configuration'),

  saveAIConfiguration: (config) =>
    ipcRenderer.invoke('echo:ai:save-configuration', config),

  setActiveAIProvider: (provider) =>
    ipcRenderer.invoke('echo:ai:set-active-provider', provider),

  deleteAIProvider: (provider) =>
    ipcRenderer.invoke('echo:ai:delete-provider', provider),

  testAIConnection: (config) =>
    ipcRenderer.invoke('echo:ai:test-connection', config),

  getAIModels: (config) =>
    ipcRenderer.invoke('echo:ai:list-models', config),

  /* =========================================
     DEEPGRAM CREDENTIAL CONFIGURATION
  ========================================= */

  getSpeechConfiguration: () =>
    ipcRenderer.invoke('echo:speech:get-configuration'),

  saveDeepgramKey: (apiKey) =>
    ipcRenderer.invoke('echo:speech:save-deepgram-key', apiKey),

  deleteDeepgramKey: () =>
    ipcRenderer.invoke('echo:speech:delete-deepgram-key'),

  testDeepgramConnection: () =>
    ipcRenderer.invoke('echo:speech:test-deepgram'),

  /* =========================================
     KNOWLEDGE LIBRARY
  ========================================= */

  listKnowledgeProjects: () =>
    ipcRenderer.invoke('echo:knowledge:list-projects'),

  createKnowledgeProject: (input) =>
    ipcRenderer.invoke('echo:knowledge:create-project', input),

  deleteKnowledgeProject: (projectId) =>
    ipcRenderer.invoke('echo:knowledge:delete-project', projectId),

  listKnowledgeDocuments: (projectId) =>
    ipcRenderer.invoke('echo:knowledge:list-documents', projectId),

  importKnowledgeFiles: (projectId) =>
    ipcRenderer.invoke('echo:knowledge:import-files', projectId),

  importKnowledgeFolder: (projectId) =>
    ipcRenderer.invoke('echo:knowledge:import-folder', projectId),

  deleteKnowledgeDocument: (projectId, documentId) =>
    ipcRenderer.invoke(
      'echo:knowledge:delete-document',
      projectId,
      documentId
    ),

  reindexKnowledgeProject: (projectId) =>
    ipcRenderer.invoke('echo:knowledge:reindex-project', projectId),

  searchKnowledge: (input) =>
    ipcRenderer.invoke('echo:knowledge:search', input),

  askKnowledgeQuestion: (input) =>
    ipcRenderer.invoke('echo:knowledge:ask', input),

  /* =========================================
     SCRIPT LIBRARY
  ========================================= */

  listScripts: () =>
    ipcRenderer.invoke('echo:scripts:list'),

  getActiveScript: () =>
    ipcRenderer.invoke('echo:scripts:get-active'),

  createScript: (input) =>
    ipcRenderer.invoke('echo:scripts:create', input),

  updateScript: (scriptId, patch) =>
    ipcRenderer.invoke(
      'echo:scripts:update',
      scriptId,
      patch
    ),

  setActiveScript: (scriptId) =>
    ipcRenderer.invoke('echo:scripts:set-active', scriptId),

  duplicateScript: (scriptId) =>
    ipcRenderer.invoke('echo:scripts:duplicate', scriptId),

  deleteScript: (scriptId) =>
    ipcRenderer.invoke('echo:scripts:delete', scriptId),

  importLegacyScript: (input) =>
    ipcRenderer.invoke('echo:scripts:import-legacy', input),

  /* =========================================
     UNIVERSAL ANSWER GENERATION
  ========================================= */

  generateAIAnswer: (payload) =>
    ipcRenderer.invoke('echo:ai:generate-answer', payload),

  generateGeminiAnswer: (payload) =>
    ipcRenderer.invoke('echo:ai:generate-answer', payload)
});
