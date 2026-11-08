
'use strict';

const {
  createScriptManager
} = require('./scriptManager.cjs');

function createScriptController({
  app,
  ipcMain,
  isTrustedRenderer
}) {
  if (!app || !ipcMain) {
    throw new Error(
      'Script controller requires Electron app and ipcMain.'
    );
  }

  if (typeof isTrustedRenderer !== 'function') {
    throw new Error(
      'Script controller requires a trusted-renderer validator.'
    );
  }

  const manager = createScriptManager({
    appRef: app
  });

  function assertTrusted(event) {
    if (!isTrustedRenderer(event.sender)) {
      throw new Error(
        'Untrusted renderer cannot access saved scripts.'
      );
    }
  }

  function handle(channel, callback) {
    ipcMain.handle(
      channel,
      async (event, ...args) => {
        assertTrusted(event);
        return callback(...args);
      }
    );
  }

  handle(
    'echo:scripts:list',
    () => manager.listScripts()
  );

  handle(
    'echo:scripts:get-active',
    () => manager.getActiveScript()
  );

  handle(
    'echo:scripts:create',
    (input) => manager.createScript(input)
  );

  handle(
    'echo:scripts:update',
    (scriptId, patch) =>
      manager.updateScript(scriptId, patch)
  );

  handle(
    'echo:scripts:set-active',
    (scriptId) =>
      manager.setActiveScript(scriptId)
  );

  handle(
    'echo:scripts:duplicate',
    (scriptId) =>
      manager.duplicateScript(scriptId)
  );

  handle(
    'echo:scripts:delete',
    (scriptId) =>
      manager.deleteScript(scriptId)
  );

  handle(
    'echo:scripts:import-legacy',
    (input) =>
      manager.importLegacyScript(input)
  );

  return {
    manager,

    dispose() {
      // No timers or filesystem watchers are created.
    }
  };
}

module.exports = {
  createScriptController
};
