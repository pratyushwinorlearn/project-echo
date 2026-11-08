
'use strict';

const {
  normalizeBaseUrl
} = require('../providerRegistry.cjs');


/* =========================================
   ENDPOINT HELPERS
========================================= */

function cleanBaseUrl(baseUrl) {
  return String(baseUrl || '')
    .trim()
    .replace(/\/+$/, '');
}

function buildChatEndpoint(baseUrl) {
  const normalized = cleanBaseUrl(baseUrl);

  if (normalized.endsWith('/chat/completions')) {
    return normalized;
  }

  return `${normalized}/chat/completions`;
}

function buildModelsEndpoint(baseUrl) {
  const normalized = cleanBaseUrl(baseUrl);

  if (normalized.endsWith('/models')) {
    return normalized;
  }

  return `${normalized}/models`;
}

function validateEndpoint(endpoint) {
  const url = new URL(endpoint);

  normalizeBaseUrl(
    `${url.origin}${url.pathname}`,
    {
      defaultBaseUrl: ''
    }
  );

  return url;
}


/* =========================================
   RESPONSE PARSING
========================================= */

async function parseResponse(response) {
  const raw = await response.text();

  if (!raw || !raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {
      message: raw.slice(0, 2000)
    };
  }
}

function extractText(content) {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (!content) {
    return '';
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        if (
          part &&
          typeof part.text === 'string'
        ) {
          return part.text;
        }

        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  if (
    typeof content === 'object' &&
    typeof content.text === 'string'
  ) {
    return content.text.trim();
  }

  return '';
}


/* =========================================
   PROVIDER ERRORS
========================================= */

function makeRequestError(response, payload) {
  const message =
    payload?.error?.message ||
    payload?.message ||
    response.statusText ||
    'Unknown provider error';

  const error = new Error(
    `${response.status} ${response.statusText || 'API error'}: ${message}`
  );

  error.status = response.status;
  error.providerResponse = payload;

  if (
    response.status === 401 ||
    response.status === 403
  ) {
    error.code = 'AUTHENTICATION_ERROR';
  } else if (response.status === 429) {
    error.code = 'RATE_LIMIT_ERROR';
  } else if (response.status >= 500) {
    error.code = 'PROVIDER_SERVER_ERROR';
  } else {
    error.code = 'PROVIDER_REQUEST_ERROR';
  }

  return error;
}


/* =========================================
   MODEL DETECTION
========================================= */

function isGroqGptOss(config) {
  if (config?.provider !== 'groq') {
    return false;
  }

  return /^openai\/gpt-oss-(20b|120b)$/i.test(
    String(config.model || '').trim()
  );
}


/* =========================================
   CHAT COMPLETION REQUEST
========================================= */

async function requestChatCompletion({
  config,
  messages,
  maxTokens = 600,
  timeoutMs = 40000
}) {
  if (!config?.model || !config?.baseUrl) {
    throw new Error(
      'Provider configuration is incomplete.'
    );
  }

  const endpoint = buildChatEndpoint(
    config.baseUrl
  );

  validateEndpoint(endpoint);

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  if (config.provider === 'openrouter') {
    headers['X-Title'] = 'Project Echo';
  }

  const groqProvider = config.provider === 'groq';
  const groqGptOss = isGroqGptOss(config);

  const requestBody = {
    model: config.model,
    messages,
    stream: false
  };

  // Groq supports max_completion_tokens.
  // Other OpenAI-compatible providers use max_tokens
  // for broad compatibility.
  if (groqProvider) {
    requestBody.max_completion_tokens = maxTokens;
  } else {
    requestBody.max_tokens = maxTokens;
  }

  // GPT-OSS uses reasoning tokens.
  // Disable reasoning output so the token budget is
  // available for the actual assistant response.
  if (groqGptOss) {
    requestBody.include_reasoning = false;
    requestBody.reasoning_effort = 'low';
  }

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  let response;

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(
        'The AI provider request timed out. Try again.'
      );
    }

    throw new Error(
      `Could not connect to the AI provider: ${
        error?.message || 'network error'
      }`
    );
  } finally {
    clearTimeout(timeout);
  }

  const payload = await parseResponse(response);

  if (!response.ok) {
    throw makeRequestError(response, payload);
  }

  const choice = payload?.choices?.[0];
  const message = choice?.message || {};

  // Support standard OpenAI-compatible responses
  // and a few common alternative response shapes.
  const answer =
    extractText(message.content) ||
    extractText(payload?.output_text) ||
    extractText(choice?.text) ||
    extractText(message.refusal);

  if (!answer) {
    const finishReason =
      choice?.finish_reason || '';

    if (finishReason === 'length') {
      throw new Error(
        'The AI provider reached its output token limit before returning answer text. Try increasing the output token limit.'
      );
    }

    throw new Error(
      `The AI provider returned an empty response. Finish reason: ${
        finishReason || 'not provided'
      }.`
    );
  }

  return {
    answer,
    model: payload?.model || config.model,
    usage: payload?.usage || null,
    provider: config.provider
  };
}


/* =========================================
   GENERATE ANSWER
========================================= */

async function generateAnswer({
  config,
  systemPrompt,
  userPrompt
}) {
  return requestChatCompletion({
    config,

    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: userPrompt
      }
    ],

    maxTokens: 650,
    timeoutMs: 40000
  });
}


/* =========================================
   TEST CONNECTION
========================================= */

async function testConnection(config) {
  const result = await requestChatCompletion({
    config,

    messages: [
      {
        role: 'user',
        content: 'Reply with exactly this text: ECHO_OK. Do not explain.'
      }
    ],

    // A connection test needs very little output,
    // but reasoning models need enough token budget.
    maxTokens: 256,
    timeoutMs: 20000
  });

  return {
    success: true,
    provider: config.provider,
    model: result.model,
    message: 'Connection successful.'
  };
}


/* =========================================
   LIST MODELS
========================================= */

async function listModels(config) {
  if (!config?.baseUrl) {
    throw new Error(
      'Provider API endpoint is missing.'
    );
  }

  const endpoint = buildModelsEndpoint(
    config.baseUrl
  );

  validateEndpoint(endpoint);

  const headers = {
    'Accept': 'application/json'
  };

  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    20000
  );

  let response;

  try {
    response = await fetch(endpoint, {
      method: 'GET',
      headers,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(
        'Fetching models timed out.'
      );
    }

    throw new Error(
      `Could not fetch models: ${
        error?.message || 'network error'
      }`
    );
  } finally {
    clearTimeout(timeout);
  }

  const payload = await parseResponse(response);

  if (!response.ok) {
    throw makeRequestError(response, payload);
  }

  const models = Array.isArray(payload?.data)
    ? payload.data
    : [];

  return models
    .map((item) => ({
      id: String(item?.id || '').trim(),
      name: String(
        item?.name || item?.id || ''
      ).trim()
    }))
    .filter((item) => item.id)
    .sort((a, b) => a.id.localeCompare(b.id));
}


/* =========================================
   EXPORTS
========================================= */

module.exports = {
  generateAnswer,
  testConnection,
  listModels,
  requestChatCompletion
};
