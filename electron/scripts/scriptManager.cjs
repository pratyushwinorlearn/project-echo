
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const STORE_DIRECTORY = 'scripts';
const STORE_FILENAME = 'scripts.json';
const STORE_VERSION = 1;

const MAX_TITLE_LENGTH = 120;
const MAX_CONTENT_LENGTH = 1500000;
const MAX_HIGHLIGHTS = 250;

const ALLOWED_COLORS = new Set([
  'yellow',
  'green',
  'blue',
  'pink'
]);

function makeId() {
  return crypto.randomUUID();
}

function cleanTitle(value) {
  const title = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TITLE_LENGTH);

  return title || 'Untitled script';
}

function cleanContent(value) {
  const content = String(value ?? '');

  if (content.length > MAX_CONTENT_LENGTH) {
    throw new Error(
      'Script exceeds the 1.5 million character limit.'
    );
  }

  return content;
}

function cleanHighlights(values) {
  if (!Array.isArray(values)) return [];

  const result = [];
  const seen = new Set();

  for (const item of values.slice(0, MAX_HIGHLIGHTS)) {
    if (!item || typeof item !== 'object') continue;

    const text = String(item.text || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160);

    const color = String(item.color || 'yellow')
      .toLowerCase();

    if (!text || !ALLOWED_COLORS.has(color)) continue;

    const key = `${text.toLowerCase()}::${color}`;

    if (seen.has(key)) continue;

    seen.add(key);

    result.push({
      id: String(item.id || makeId()),
      text,
      color
    });
  }

  return result;
}

function normalizeScript(input = {}) {
  const now = new Date().toISOString();

  return {
    id: String(input.id || makeId()),

    title: cleanTitle(input.title),

    content: cleanContent(input.content),

    highlights: cleanHighlights(input.highlights),

    createdAt: input.createdAt || now,

    updatedAt: input.updatedAt || now
  };
}

function createEmptyState() {
  return {
    version: STORE_VERSION,
    activeScriptId: null,
    scripts: []
  };
}

function validateState(state) {
  if (
    !state ||
    typeof state !== 'object' ||
    state.version !== STORE_VERSION ||
    !Array.isArray(state.scripts)
  ) {
    throw new Error(
      'The saved script library has an invalid format.'
    );
  }

  const scripts = state.scripts.map(normalizeScript);

  const activeScriptId =
    scripts.some(
      (script) => script.id === state.activeScriptId
    )
      ? state.activeScriptId
      : scripts[0]?.id || null;

  return {
    version: STORE_VERSION,
    activeScriptId,
    scripts
  };
}

class ScriptManager {
  constructor({ appRef }) {
    if (!appRef) {
      throw new Error(
        'ScriptManager requires the Electron app object.'
      );
    }

    this.app = appRef;
    this.writeQueue = Promise.resolve();
  }

  get directory() {
    if (!this.app.isReady()) {
      throw new Error(
        'Electron must be ready before accessing saved scripts.'
      );
    }

    return path.join(
      this.app.getPath('userData'),
      STORE_DIRECTORY
    );
  }

  get filePath() {
    return path.join(
      this.directory,
      STORE_FILENAME
    );
  }

  async ensureInitialized() {
    await fs.mkdir(this.directory, {
      recursive: true
    });

    try {
      await fs.access(this.filePath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;

      await this.writeState(createEmptyState());
    }
  }

  async readState() {
    await this.ensureInitialized();

    try {
      const raw = await fs.readFile(
        this.filePath,
        'utf8'
      );

      return validateState(JSON.parse(raw));
    } catch (error) {
      throw new Error(
        `Could not read the script library: ${error?.message || error}`
      );
    }
  }

  async writeState(state) {
    await fs.mkdir(this.directory, {
      recursive: true
    });

    const safeState = validateState(state);

    const temporaryPath =
      `${this.filePath}.${process.pid}.${Date.now()}.tmp`;

    try {
      await fs.writeFile(
        temporaryPath,
        JSON.stringify(safeState, null, 2),
        'utf8'
      );

      await fs.rename(
        temporaryPath,
        this.filePath
      );
    } catch (error) {
      try {
        await fs.unlink(temporaryPath);
      } catch {
        // Ignore temporary file cleanup.
      }

      throw error;
    }
  }

  async updateState(updater) {
    const operation = this.writeQueue.then(async () => {
      const current = await this.readState();

      const next = await updater(current);

      await this.writeState(next);

      return next;
    });

    this.writeQueue = operation.catch(() => {});

    return operation;
  }

  makeLibraryResponse(state) {
    return {
      activeScriptId: state.activeScriptId,

      scripts: state.scripts
        .slice()
        .sort((a, b) =>
          new Date(b.updatedAt) - new Date(a.updatedAt)
        )
    };
  }

  async listScripts() {
    const state = await this.readState();

    return this.makeLibraryResponse(state);
  }

  async getActiveScript() {
    const state = await this.readState();

    return (
      state.scripts.find(
        (script) => script.id === state.activeScriptId
      ) || null
    );
  }

  async createScript(input = {}) {
    const now = new Date().toISOString();

    const script = normalizeScript({
      id: makeId(),
      title: input.title || 'Untitled script',
      content: input.content || '',
      highlights: [],
      createdAt: now,
      updatedAt: now
    });

    const state = await this.updateState((current) => {
      current.scripts.push(script);
      current.activeScriptId = script.id;

      return current;
    });

    return this.makeLibraryResponse(state);
  }

  async updateScript(scriptId, patch = {}) {
    if (typeof scriptId !== 'string' || !scriptId.trim()) {
      throw new Error('A valid script ID is required.');
    }

    const state = await this.updateState((current) => {
      const script = current.scripts.find(
        (item) => item.id === scriptId
      );

      if (!script) {
        throw new Error('Script not found.');
      }

      if (Object.prototype.hasOwnProperty.call(patch, 'title')) {
        script.title = cleanTitle(patch.title);
      }

      if (Object.prototype.hasOwnProperty.call(patch, 'content')) {
        script.content = cleanContent(patch.content);
      }

      if (Object.prototype.hasOwnProperty.call(patch, 'highlights')) {
        script.highlights = cleanHighlights(patch.highlights);
      }

      script.updatedAt = new Date().toISOString();

      return current;
    });

    return this.makeLibraryResponse(state);
  }

  async setActiveScript(scriptId) {
    const state = await this.updateState((current) => {
      const exists = current.scripts.some(
        (script) => script.id === scriptId
      );

      if (!exists) {
        throw new Error('The selected script does not exist.');
      }

      current.activeScriptId = scriptId;

      return current;
    });

    return this.makeLibraryResponse(state);
  }

  async duplicateScript(scriptId) {
    const state = await this.updateState((current) => {
      const original = current.scripts.find(
        (script) => script.id === scriptId
      );

      if (!original) {
        throw new Error('Script not found.');
      }

      const now = new Date().toISOString();

      const duplicate = normalizeScript({
        ...original,
        id: makeId(),
        title: `${original.title} (Copy)`,
        createdAt: now,
        updatedAt: now,
        highlights: original.highlights.map((highlight) => ({
          ...highlight,
          id: makeId()
        }))
      });

      current.scripts.push(duplicate);
      current.activeScriptId = duplicate.id;

      return current;
    });

    return this.makeLibraryResponse(state);
  }

  async deleteScript(scriptId) {
    const state = await this.updateState((current) => {
      const index = current.scripts.findIndex(
        (script) => script.id === scriptId
      );

      if (index < 0) {
        throw new Error('Script not found.');
      }

      current.scripts.splice(index, 1);

      if (current.activeScriptId === scriptId) {
        current.activeScriptId =
          current.scripts[0]?.id || null;
      }

      return current;
    });

    return this.makeLibraryResponse(state);
  }

  /*
   * One-time migration of the old localStorage script.
   *
   * Called only when the persistent library is empty.
   */

  async importLegacyScript(input = {}) {
    const existing = await this.readState();

    if (existing.scripts.length > 0) {
      return this.makeLibraryResponse(existing);
    }

    const script = normalizeScript({
      id: makeId(),
      title: input.title || 'Presentation script',
      content: input.content || '',
      highlights: input.highlights || []
    });

    const state = await this.updateState((current) => {
      if (current.scripts.length === 0) {
        current.scripts.push(script);
        current.activeScriptId = script.id;
      }

      return current;
    });

    return this.makeLibraryResponse(state);
  }
}

function createScriptManager({ appRef }) {
  return new ScriptManager({
    appRef
  });
}

module.exports = {
  createScriptManager,
  ScriptManager
};
