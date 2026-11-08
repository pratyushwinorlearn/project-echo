
'use strict';

const {
  getProviderDefinition,
  listProviderDefinitions,
  normalizeProviderConfig
} = require('./providerRegistry.cjs');

const openaiCompatible = require('./providers/openaiCompatible.cjs');
const anthropic = require('./providers/anthropic.cjs');

const ADAPTERS = {
  'openai-compatible': openaiCompatible,
  anthropic
};

/* =========================================
   ENVIRONMENT VARIABLE MAPS
========================================= */

const ENV_PROVIDERS = {
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  custom: 'AI_API_KEY'
};

const ENV_MODELS = {
  gemini: 'GEMINI_MODEL',
  openai: 'OPENAI_MODEL',
  groq: 'GROQ_MODEL',
  openrouter: 'OPENROUTER_MODEL',
  anthropic: 'ANTHROPIC_MODEL',
  custom: 'AI_MODEL'
};

const ENV_BASE_URLS = {
  gemini: 'GEMINI_BASE_URL',
  openai: 'OPENAI_BASE_URL',
  groq: 'GROQ_BASE_URL',
  openrouter: 'OPENROUTER_BASE_URL',
  anthropic: 'ANTHROPIC_BASE_URL',
  custom: 'AI_BASE_URL'
};

/* =========================================
   HELPERS
========================================= */

function trim(value, maxLength) {
  return String(value ?? '')
    .trim()
    .slice(0, maxLength);
}

/* =========================================
   DEVELOPMENT ENV CONFIGURATION
========================================= */

function getEnvironmentConfig() {
  const explicitProvider = String(
    process.env.AI_PROVIDER || ''
  )
    .trim()
    .toLowerCase();

  const providerOrder = [
    'gemini',
    'openai',
    'groq',
    'openrouter',
    'anthropic',
    'custom'
  ];

  let providerId = explicitProvider;

  if (!providerId) {
    providerId = providerOrder.find((id) => {
      const envName = ENV_PROVIDERS[id];
      return Boolean(process.env[envName]);
    }) || '';
  }

  if (!providerId) return null;

  const definition = getProviderDefinition(providerId);

  if (!definition) {
    throw new Error(
      `AI_PROVIDER "${providerId}" is not supported.`
    );
  }

  const specificKey =
    process.env[ENV_PROVIDERS[providerId]] || '';

  const apiKey =
    process.env.AI_API_KEY || specificKey;

  const model =
    process.env.AI_MODEL ||
    process.env[ENV_MODELS[providerId]] ||
    definition.defaultModel;

  const baseUrl =
    process.env.AI_BASE_URL ||
    process.env[ENV_BASE_URLS[providerId]] ||
    definition.defaultBaseUrl;

  return normalizeProviderConfig({
    provider: providerId,
    apiKey,
    model,
    baseUrl
  });
}

/* =========================================
   ANSWER PROMPT
========================================= */

function getSystemPrompt(answerStyle = 'natural') {
  const styles = {
    natural:
      'Speak naturally, confidently and conversationally. Keep the answer easy to say aloud.',

    concise:
      'Give a short spoken response of roughly 15 to 25 seconds.',

    technical:
      'Give a technically accurate answer with useful implementation details.',

    detailed:
      'Give a thorough but conversational answer.'
  };

  const selectedStyle =
    styles[answerStyle] || styles.natural;

  return `
You are the AI answer engine inside Project Echo, a desktop speaking assistant.

Your job is to help the user formulate a clear spoken answer to a detected question.

ANSWER STYLE:
${selectedStyle}

IMPORTANT RULES:
- Answer the actual question directly.
- Do not say that you are an AI.
- Do not use unnecessary headings, markdown or introductions.
- Prefer 2 to 5 sentences unless the question requires more.
- Use first person only if supplied context supports a first-person claim.
- Never fabricate personal experiences, projects, qualifications, job history or achievements.
- If personal information is missing, say so briefly and suggest an honest way to frame the answer.
- Treat the meeting transcript as conversation context, not verified facts about the user.
- Be technically accurate.
- Do not repeat the question unnecessarily.
`.trim();
}

function buildUserPrompt({
  question,
  conversation,
  context
}) {
  return `
USER / PROJECT REFERENCE MATERIAL:
${context || '(No reference documents have been provided.)'}

RECENT MEETING CONVERSATION:
${conversation || '(No additional meeting context is available.)'}

QUESTION TO ANSWER:
${question}
`.trim();
}

/* =========================================
   MANAGER
========================================= */

function createAIManager({ store }) {
  if (!store) {
    throw new Error(
      'AIManager requires a SecureCredentialStore instance.'
    );
  }

  async function getActiveConfig() {
    const activeProfile = await store.getActiveProfile();

    if (activeProfile) {
      return normalizeProviderConfig(activeProfile);
    }

    const environmentConfig = getEnvironmentConfig();

    if (environmentConfig) {
      return environmentConfig;
    }

    throw new Error(
      'No AI provider is configured. Open AI settings and add your provider API key and model.'
    );
  }

  async function getConfiguration() {
    const saved = await store.getPublicState();

    const environmentConfig =
      saved.activeProvider
        ? null
        : getEnvironmentConfig();

    const active = saved.activeProvider
      ? saved.profiles[saved.activeProvider] || null
      : environmentConfig
        ? {
            provider: environmentConfig.provider,
            model: environmentConfig.model,
            baseUrl: environmentConfig.baseUrl,
            configured: true,
            source: 'environment'
          }
        : null;

    return {
      activeProvider: active?.provider || null,

      activeConfig: active
        ? {
            provider: active.provider,
            model: active.model,
            baseUrl: active.baseUrl,
            configured: Boolean(active.configured ?? true),
            source: active.source || 'secure-storage'
          }
        : null,

      profiles: saved.profiles,
      providers: listProviderDefinitions()
    };
  }

  /* =========================================
     SAVE CONFIGURATION
  ========================================= */

  async function saveConfiguration(input = {}) {
    const providerId = String(
      input.provider || input.providerId || ''
    )
      .trim()
      .toLowerCase();

    const definition = getProviderDefinition(providerId);

    if (!definition) {
      throw new Error(
        `Unsupported provider: ${providerId || '(empty)'}.`
      );
    }

    const existingProfile =
      typeof store.getProfile === 'function'
        ? await store.getProfile(providerId)
        : null;

    let environmentConfig = null;

    try {
      const candidate = getEnvironmentConfig();

      if (candidate?.provider === providerId) {
        environmentConfig = candidate;
      }
    } catch {
      // Ignore an unrelated or incomplete .env configuration.
    }

    const apiKey =
      trim(input.apiKey, 1000) ||
      existingProfile?.apiKey ||
      environmentConfig?.apiKey ||
      '';

    const config = normalizeProviderConfig({
      ...input,

      provider: providerId,
      apiKey,

      model:
        trim(input.model, 200) ||
        existingProfile?.model ||
        environmentConfig?.model ||
        definition.defaultModel,

      baseUrl:
        trim(input.baseUrl, 2000) ||
        existingProfile?.baseUrl ||
        environmentConfig?.baseUrl ||
        definition.defaultBaseUrl
    });

    await store.saveProfile(config);

    return getConfiguration();
  }

  async function setActiveProvider(providerId) {
    const provider = getProviderDefinition(providerId);

    if (!provider) {
      throw new Error(
        `Unsupported provider: ${providerId}`
      );
    }

    await store.setActiveProvider(provider.id);

    return getConfiguration();
  }

  async function deleteProvider(providerId) {
    await store.deleteProfile(providerId);
    return getConfiguration();
  }

  function resolveAdapter(config) {
    const definition = getProviderDefinition(
      config.provider
    );

    if (!definition) {
      throw new Error('Unknown AI provider.');
    }

    const adapter = ADAPTERS[definition.protocol];

    if (!adapter) {
      throw new Error(
        `No adapter is available for ${definition.protocol}.`
      );
    }

    return adapter;
  }

  async function testConnection(input) {
    const config = input
      ? normalizeProviderConfig(input)
      : await getActiveConfig();

    const adapter = resolveAdapter(config);

    if (typeof adapter.testConnection !== 'function') {
      throw new Error(
        'Connection testing is not supported by this provider.'
      );
    }

    return adapter.testConnection(config);
  }

  async function listModels(input) {
    const config = input
      ? normalizeProviderConfig(input)
      : await getActiveConfig();

    const adapter = resolveAdapter(config);

    if (typeof adapter.listModels !== 'function') {
      throw new Error(
        'Automatic model listing is not supported by this provider. Enter its model ID manually.'
      );
    }

    return adapter.listModels(config);
  }

  async function generateAnswer(payload = {}) {
    const config = await getActiveConfig();

    const question = trim(payload.question, 3000);
    const conversation = trim(payload.conversation, 10000);
    const context = trim(payload.context, 16000);

    const answerStyle = trim(
      payload.answerStyle || 'natural',
      30
    );

    if (!question) {
      throw new Error(
        'No question was provided to the AI engine.'
      );
    }

    const adapter = resolveAdapter(config);

    const result = await adapter.generateAnswer({
      config,

      systemPrompt: getSystemPrompt(answerStyle),

      userPrompt: buildUserPrompt({
        question,
        conversation,
        context
      })
    });

    return {
      answer: result.answer,
      provider: result.provider || config.provider,
      model: result.model || config.model,
      usage: result.usage || null
    };
  }

  return {
    getProviders: () => listProviderDefinitions(),
    getConfiguration,
    getActiveConfig,
    saveConfiguration,
    setActiveProvider,
    deleteProvider,
    testConnection,
    listModels,
    generateAnswer
  };
}

module.exports = {
  createAIManager
};
