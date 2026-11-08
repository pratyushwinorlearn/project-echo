
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const {
  app,
  safeStorage
} = require('electron');

const STORE_VERSION = 1;
const STORE_FILENAME = 'echo-ai-credentials.enc';

const ALLOWED_PROVIDERS = new Set([
  'gemini',
  'openai',
  'groq',
  'openrouter',
  'anthropic',
  'custom'
]);

function createEmptyState() {
  return {
    version: STORE_VERSION,
    activeProvider: null,
    profiles: {},
    speech: {
      deepgramApiKey: ''
    }
  };
}

function cleanString(value, maxLength, fieldName) {
  const result = String(value ?? '').trim();

  if (result.length > maxLength) {
    throw new Error(
      `${fieldName} exceeds the maximum allowed length.`
    );
  }

  return result;
}

class SecureCredentialStore {
  constructor({
    appRef = app,
    safeStorageRef = safeStorage
  } = {}) {
    this.app = appRef;
    this.safeStorage = safeStorageRef;

    this.writeQueue = Promise.resolve();
  }

  get filePath() {
    if (!this.app.isReady()) {
      throw new Error(
        'Electron must be ready before accessing the credential store.'
      );
    }

    return path.join(
      this.app.getPath('userData'),
      STORE_FILENAME
    );
  }

  /* =========================================
     ASYNCHRONOUS ENCRYPTION
  ========================================= */

  async assertEncryptionAvailable() {
    if (
      !this.safeStorage ||
      typeof this.safeStorage.isAsyncEncryptionAvailable !== 'function' ||
      typeof this.safeStorage.encryptStringAsync !== 'function' ||
      typeof this.safeStorage.decryptStringAsync !== 'function'
    ) {
      throw new Error(
        'This Electron build does not provide asynchronous secure storage. Update Electron before saving API keys.'
      );
    }

    const available =
      await this.safeStorage.isAsyncEncryptionAvailable();

    if (!available) {
      throw new Error(
        'Secure credential storage is unavailable. Echo will not store API keys in plaintext.'
      );
    }
  }

  /* =========================================
     STATE VALIDATION
  ========================================= */

  validateState(input) {
    if (
      !input ||
      typeof input !== 'object' ||
      input.version !== STORE_VERSION ||
      !input.profiles ||
      typeof input.profiles !== 'object' ||
      Array.isArray(input.profiles)
    ) {
      throw new Error(
        'The encrypted Echo credential store has an unsupported or invalid format.'
      );
    }

    const profiles = Object.create(null);

    for (const [provider, profile] of Object.entries(
      input.profiles
    )) {
      if (!ALLOWED_PROVIDERS.has(provider)) continue;

      if (
        !profile ||
        typeof profile !== 'object' ||
        Array.isArray(profile)
      ) {
        continue;
      }

      profiles[provider] = {
        provider,
        apiKey: String(profile.apiKey || ''),
        model: String(profile.model || ''),
        baseUrl: String(profile.baseUrl || ''),
        updatedAt:
          typeof profile.updatedAt === 'string'
            ? profile.updatedAt
            : null
      };
    }

    const activeProvider =
      typeof input.activeProvider === 'string' &&
      ALLOWED_PROVIDERS.has(input.activeProvider) &&
      profiles[input.activeProvider]
        ? input.activeProvider
        : null;

    return {
      version: STORE_VERSION,
      activeProvider,
      profiles,

      speech: {
        deepgramApiKey:
          typeof input.speech?.deepgramApiKey === 'string'
            ? input.speech.deepgramApiKey
            : ''
      }
    };
  }

  /* =========================================
     DECRYPTION
  ========================================= */

  async decryptBuffer(encrypted) {
    /*
     * Electron's decryptStringAsync can decrypt existing
     * values created using the older synchronous encryptString API.
     *
     * This preserves existing Echo credentials during migration.
     */

    let result =
      await this.safeStorage.decryptStringAsync(encrypted);

    /*
     * Electron can request another decrypt operation following
     * key rotation. Follow the safeStorage API guidance.
     */

    if (result?.shouldReEncrypt) {
      result =
        await this.safeStorage.decryptStringAsync(encrypted);
    }

    if (
      !result ||
      typeof result.result !== 'string'
    ) {
      throw new Error(
        'The secure storage provider returned an invalid result.'
      );
    }

    return result.result;
  }

  /* =========================================
     READ STATE
  ========================================= */

  async getState() {
    await this.assertEncryptionAvailable();

    let encrypted;

    try {
      encrypted = await fs.readFile(this.filePath);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return createEmptyState();
      }

      throw new Error(
        `Could not read the Echo credential store: ${error?.message || error}`
      );
    }

    try {
      const plaintext = await this.decryptBuffer(encrypted);

      return this.validateState(
        JSON.parse(plaintext)
      );
    } catch (error) {
      throw new Error(
        `Could not decrypt the Echo credential store. It may have been created under another operating-system account or damaged. ${error?.message || ''}`
      );
    }
  }

  /* =========================================
     WRITE STATE
  ========================================= */

  async writeState(input) {
    await this.assertEncryptionAvailable();

    const filePath = this.filePath;
    const directory = path.dirname(filePath);

    await fs.mkdir(directory, {
      recursive: true
    });

    const safeState = this.validateState(input);

    const encrypted =
      await this.safeStorage.encryptStringAsync(
        JSON.stringify(safeState)
      );

    const temporaryPath =
      `${filePath}.${process.pid}.${Date.now()}.tmp`;

    try {
      await fs.writeFile(
        temporaryPath,
        encrypted,
        {
          mode: 0o600
        }
      );

      await fs.rename(
        temporaryPath,
        filePath
      );
    } catch (error) {
      try {
        await fs.unlink(temporaryPath);
      } catch {
        // Ignore temporary-file cleanup errors.
      }

      throw new Error(
        `Could not save encrypted AI credentials: ${error?.message || error}`
      );
    }
  }

  /* =========================================
     SERIALISED STATE UPDATES
  ========================================= */

  async updateState(updater) {
    const operation = this.writeQueue.then(async () => {
      const current = await this.getState();

      const next = await updater(current);

      await this.writeState(next);

      return next;
    });

    this.writeQueue = operation.catch(() => {});

    return operation;
  }

  /* =========================================
     AI PROVIDER PROFILES
  ========================================= */

  async getProfile(provider) {
    const providerId = cleanString(
      provider,
      40,
      'Provider ID'
    ).toLowerCase();

    if (!ALLOWED_PROVIDERS.has(providerId)) {
      return null;
    }

    const state = await this.getState();

    return state.profiles[providerId] || null;
  }

  async saveProfile(profile) {
    const provider = cleanString(
      profile?.provider,
      40,
      'Provider ID'
    ).toLowerCase();

    if (!ALLOWED_PROVIDERS.has(provider)) {
      throw new Error(
        `Unsupported provider: ${provider || '(empty)'}.`
      );
    }

    const safeProfile = {
      provider,

      apiKey: cleanString(
        profile.apiKey,
        1000,
        'API key'
      ),

      model: cleanString(
        profile.model,
        200,
        'Model ID'
      ),

      baseUrl: cleanString(
        profile.baseUrl,
        2000,
        'API endpoint'
      ),

      updatedAt: new Date().toISOString()
    };

    return this.updateState((state) => {
      state.profiles[provider] = safeProfile;
      state.activeProvider = provider;

      return state;
    });
  }

  async setActiveProvider(provider) {
    const providerId = cleanString(
      provider,
      40,
      'Provider ID'
    ).toLowerCase();

    if (!ALLOWED_PROVIDERS.has(providerId)) {
      throw new Error(
        `Unsupported provider: ${providerId || '(empty)'}.`
      );
    }

    return this.updateState((state) => {
      if (!state.profiles[providerId]) {
        throw new Error(
          `No saved configuration exists for ${providerId}.`
        );
      }

      state.activeProvider = providerId;

      return state;
    });
  }

  async deleteProfile(provider) {
    const providerId = cleanString(
      provider,
      40,
      'Provider ID'
    ).toLowerCase();

    if (!ALLOWED_PROVIDERS.has(providerId)) {
      return this.getPublicState();
    }

    return this.updateState((state) => {
      delete state.profiles[providerId];

      if (state.activeProvider === providerId) {
        state.activeProvider = null;
      }

      return state;
    });
  }

  async getActiveProfile() {
    const state = await this.getState();

    if (!state.activeProvider) {
      return null;
    }

    return state.profiles[state.activeProvider] || null;
  }

  /* =========================================
     DEEPGRAM CREDENTIALS
  ========================================= */

  async saveDeepgramApiKey(apiKey) {
    const cleanKey = cleanString(
      apiKey,
      1000,
      'Deepgram API key'
    );

    if (!cleanKey) {
      throw new Error('Enter a Deepgram API key.');
    }

    return this.updateState((state) => {
      state.speech.deepgramApiKey = cleanKey;
      return state;
    });
  }

  async getDeepgramApiKey() {
    const state = await this.getState();

    return state.speech.deepgramApiKey || '';
  }

  async deleteDeepgramApiKey() {
    return this.updateState((state) => {
      state.speech.deepgramApiKey = '';
      return state;
    });
  }

  /* =========================================
     PUBLIC STATE
     Never return secret values.
  ========================================= */

  async getPublicState() {
    const state = await this.getState();

    const profiles = {};

    for (const [provider, profile] of Object.entries(
      state.profiles
    )) {
      profiles[provider] = {
        provider,
        model: profile.model,
        baseUrl: profile.baseUrl,
        configured: Boolean(profile.apiKey),
        updatedAt: profile.updatedAt || null
      };
    }

    return {
      activeProvider: state.activeProvider,
      profiles,

      speech: {
        deepgramConfigured: Boolean(
          state.speech.deepgramApiKey
        )
      }
    };
  }
}

module.exports = {
  SecureCredentialStore
};
