
'use strict';

const ANTHROPIC_VERSION = '2026-10-21';

function buildEndpoint(baseUrl) {
  const normalized = String(baseUrl || 'https://api.anthropic.com')
    .trim()
    .replace(/\/+$/, '');

  if (normalized.endsWith('/v1/messages')) {
    return normalized;
  }

  return `${normalized}/v1/messages`;
}

async function parseResponse(response) {
  const raw = await response.text();

  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return {
      message: raw.slice(0, 2000)
    };
  }
}

function extractText(content) {
  if (!Array.isArray(content)) return '';

  return content
    .filter((part) => part?.type === 'text')
    .map((part) => part.text || '')
    .join('\n')
    .trim();
}

async function requestMessage({
  config,
  systemPrompt,
  userPrompt,
  maxTokens = 650,
  timeoutMs = 40000
}) {
  if (!config?.apiKey) {
    throw new Error(
      'Anthropic API key is missing.'
    );
  }

  if (!config?.model) {
    throw new Error(
      'Choose an Anthropic model ID first.'
    );
  }

  const endpoint = buildEndpoint(config.baseUrl);

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  let response;

  try {
    response = await fetch(endpoint, {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',

        'Authorization': `Bearer ${config.apiKey}`,

        'anthropic-version': ANTHROPIC_VERSION
      },

      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTokens,

        system: systemPrompt,

        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      }),

      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(
        'Anthropic request timed out. Try again.'
      );
    }

    throw new Error(
      `Could not connect to Anthropic: ${
        error?.message || 'network error'
      }`
    );
  } finally {
    clearTimeout(timeout);
  }

  const payload = await parseResponse(response);

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      response.statusText ||
      'Unknown Anthropic error';

    const error = new Error(
      `Anthropic API error (${response.status}): ${message}`
    );

    error.status = response.status;

    error.code =
      response.status === 401 || response.status === 403
        ? 'AUTHENTICATION_ERROR'
        : response.status === 429
          ? 'RATE_LIMIT_ERROR'
          : response.status >= 500
            ? 'PROVIDER_SERVER_ERROR'
            : 'PROVIDER_REQUEST_ERROR';

    throw error;
  }

  const answer = extractText(payload?.content);

  if (!answer) {
    throw new Error(
      'Anthropic returned no answer text.'
    );
  }

  return {
    answer,
    model: payload?.model || config.model,
    usage: payload?.usage || null,
    provider: 'anthropic'
  };
}

async function generateAnswer({
  config,
  systemPrompt,
  userPrompt
}) {
  return requestMessage({
    config,
    systemPrompt,
    userPrompt
  });
}

async function testConnection(config) {
  const result = await requestMessage({
    config,

    systemPrompt: 'You are a connection test.',

    userPrompt: 'Reply with exactly: ECHO_OK',

    maxTokens: 30,
    timeoutMs: 20000
  });

  return {
    success: true,
    provider: 'anthropic',
    model: result.model,
    message: 'Connection successful.'
  };
}

module.exports = {
  generateAnswer,
  testConnection
};
