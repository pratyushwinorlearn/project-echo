
'use strict';


/* =========================================
   PROVIDER DEFINITIONS
========================================= */

const PROVIDERS = Object.freeze({
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    protocol: 'openai-compatible',
    defaultBaseUrl:
      'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.8-flash',
    requiresApiKey: true,
    description:
      'Google Gemini models through the OpenAI-compatible API.'
  },

  openai: {
    id: 'openai',
    name: 'OpenAI',
    protocol: 'openai-compatible',
    defaultBaseUrl:
      'https://api.openai.com/v1',
    defaultModel: '',
    requiresApiKey: true,
    description:
      'OpenAI chat-completion models.'
  },

  groq: {
    id: 'groq',
    name: 'Groq',
    protocol: 'openai-compatible',
    defaultBaseUrl:
      'https://api.groq.com/openai/v1',
    defaultModel: '',
    requiresApiKey: true,
    description:
      'Fast inference through GroqCloud.'
  },

  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    protocol: 'openai-compatible',
    defaultBaseUrl:
      'https://openrouter.ai/api/v1',
    defaultModel: '',
    requiresApiKey: true,
    description:
      'Access models from multiple providers through OpenRouter.'
  },

  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    protocol: 'anthropic',
    defaultBaseUrl:
      'https://api.anthropic.com',
    defaultModel: '',
    requiresApiKey: true,
    description:
      'Claude models through the native Anthropic Messages API.'
  },

  custom: {
    id: 'custom',
    name: 'Custom OpenAI-compatible API',
    protocol: 'openai-compatible',
    defaultBaseUrl: '',
    defaultModel: '',
    requiresApiKey: false,
    description:
      'A custom OpenAI-compatible endpoint or local model server.'
  }
});


/* =========================================
   PROVIDER LOOKUP
========================================= */

function getProviderDefinition(providerId) {
  const id = String(providerId || '')
    .trim()
    .toLowerCase();

  return PROVIDERS[id] || null;
}

function listProviderDefinitions() {
  return Object.values(PROVIDERS).map((provider) => ({
    id: provider.id,
    name: provider.name,
    protocol: provider.protocol,
    defaultBaseUrl: provider.defaultBaseUrl,
    defaultModel: provider.defaultModel,
    requiresApiKey: provider.requiresApiKey,
    description: provider.description
  }));
}


/* =========================================
   LOCALHOST VALIDATION
========================================= */

function isLocalHost(hostname) {
  const host = String(hostname || '')
    .toLowerCase()
    .replace(/^\[|\]$/g, '');

  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1'
  );
}


/* =========================================
   API URL VALIDATION
========================================= */

function normalizeBaseUrl(value, provider = {}) {
  const raw = String(
    value || provider?.defaultBaseUrl || ''
  )
    .trim()
    .replace(/\/+$/, '');

  if (!raw) {
    throw new Error(
      'An API endpoint is required for this provider.'
    );
  }

  let url;

  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      'The API endpoint is not a valid URL.'
    );
  }

  if (
    !['https:', 'http:'].includes(url.protocol)
  ) {
    throw new Error(
      'API endpoints must use HTTPS or HTTP.'
    );
  }

  // Remote HTTP endpoints are not allowed.
  // Local development servers may use HTTP.
  if (
    url.protocol === 'http:' &&
    !isLocalHost(url.hostname)
  ) {
    throw new Error(
      'HTTP is allowed only for localhost endpoints. Use HTTPS for remote APIs.'
    );
  }

  // Never allow credentials inside the URL.
  if (url.username || url.password) {
    throw new Error(
      'Do not put credentials inside the API endpoint URL.'
    );
  }

  // Query strings and fragments are not valid
  // parts of a provider base URL.
  if (url.search || url.hash) {
    throw new Error(
      'The API endpoint must not contain query parameters or fragments.'
    );
  }

  return raw;
}


/* =========================================
   PROVIDER CONFIGURATION NORMALIZATION
========================================= */

function normalizeProviderConfig(input = {}) {
  input = input || {};

  const providerId = String(
    input.provider || input.providerId || ''
  )
    .trim()
    .toLowerCase();

  const provider = getProviderDefinition(providerId);

  if (!provider) {
    throw new Error(
      `Unsupported AI provider: ${providerId || '(empty)'}.`
    );
  }

  const apiKey = String(
    input.apiKey || ''
  ).trim();

  const model = String(
    input.model || ''
  ).trim();

  const baseUrl = normalizeBaseUrl(
    input.baseUrl,
    provider
  );

  if (!model) {
    throw new Error(
      `Enter a model ID for ${provider.name}.`
    );
  }

  if (
    provider.requiresApiKey &&
    !apiKey
  ) {
    throw new Error(
      `An API key is required for ${provider.name}.`
    );
  }

  if (apiKey.length > 1000) {
    throw new Error(
      'The API key is too long.'
    );
  }

  if (model.length > 200) {
    throw new Error(
      'The model ID is too long.'
    );
  }

  if (baseUrl.length > 2000) {
    throw new Error(
      'The API endpoint is too long.'
    );
  }

  return {
    provider: provider.id,
    protocol: provider.protocol,
    apiKey,
    model,
    baseUrl
  };
}


/* =========================================
   PUBLIC CONFIGURATION
========================================= */

function getPublicProviderConfig(config) {
  if (!config) {
    return null;
  }

  return {
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
    configured: Boolean(config.apiKey)
  };
}


/* =========================================
   EXPORTS
========================================= */

module.exports = {
  PROVIDERS,
  getProviderDefinition,
  listProviderDefinitions,
  normalizeProviderConfig,
  getPublicProviderConfig,
  normalizeBaseUrl,
  isLocalHost
};
