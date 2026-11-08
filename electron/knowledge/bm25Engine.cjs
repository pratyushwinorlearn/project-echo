
'use strict';

const DEFAULT_K1 = 1.5;
const DEFAULT_B = 0.75;
const INDEX_VERSION = 2;

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but',
  'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'to', 'of', 'in', 'on', 'at',
  'for', 'from', 'by', 'with', 'as', 'it',
  'this', 'that', 'these', 'those', 'i',
  'you', 'we', 'they', 'he', 'she', 'them',
  'their', 'our', 'your', 'my', 'not',
  'do', 'does', 'did', 'can', 'could',
  'should', 'would', 'will', 'shall',
  'have', 'has', 'had', 'if', 'then',
  'than', 'so', 'such', 'into', 'about'
]);

// These are useful single-character terms in programming
// and technical documentation.
const KEEP_SINGLE_CHARACTER_TERMS = new Set([
  'c',
  'r',
  'x'
]);

function addToken(target, value) {
  const token = String(value || '').trim();

  if (!token) return;

  if (STOP_WORDS.has(token)) return;

  if (
    token.length < 2 &&
    !KEEP_SINGLE_CHARACTER_TERMS.has(token)
  ) {
    return;
  }

  target.push(token);
}

function tokenize(value) {
  const source = String(value || '')
    .replace(
      /([A-Z]+)([A-Z][a-z])/g,
      '$1 $2'
    )
    .replace(
      /([a-z0-9])([A-Z])/g,
      '$1 $2'
    )
    .toLowerCase();

  const rawTokens = source.match(
    /[a-z0-9_+#./:-]+/g
  ) || [];

  const result = [];

  for (const raw of rawTokens) {
    const token = raw.replace(
      /^[._/:-]+|[._/:-]+$/g,
      ''
    );

    if (!token) continue;

    // Preserve the complete term:
    // gpt-oss-120b, train_model, c++, c#
    addToken(result, token);

    // Also index identifier components:
    // train_model -> train, model
    // train.py -> train, py
    // node-js -> node, js
    // electron/main.cjs -> electron, main, cjs
    const parts = token.split(/[._/:-]+|-/);

    if (parts.length > 1) {
      for (const part of parts) {
        addToken(result, part);
      }
    }
  }

  return result;
}

function buildIndex(chunks = []) {
  if (!Array.isArray(chunks)) {
    throw new Error('Index input must be an array of chunks.');
  }

  const documents = [];
  const documentFrequency = new Map();

  let totalLength = 0;

  for (const chunk of chunks) {
    if (
      !chunk ||
      typeof chunk.text !== 'string' ||
      !chunk.text.trim()
    ) {
      continue;
    }

    const tokens = tokenize(chunk.text);
    const frequencies = new Map();

    for (const token of tokens) {
      frequencies.set(
        token,
        (frequencies.get(token) || 0) + 1
      );
    }

    for (const token of frequencies.keys()) {
      documentFrequency.set(
        token,
        (documentFrequency.get(token) || 0) + 1
      );
    }

    documents.push({
      ...chunk,
      tokenCount: tokens.length,
      frequencies: Object.fromEntries(frequencies)
    });

    totalLength += tokens.length;
  }

  return {
    version: INDEX_VERSION,
    count: documents.length,
    averageLength: documents.length
      ? totalLength / documents.length
      : 0,
    documentFrequency: Object.fromEntries(
      documentFrequency
    ),
    documents
  };
}

function scoreDocument(
  queryTerms,
  document,
  index,
  {
    k1 = DEFAULT_K1,
    b = DEFAULT_B
  } = {}
) {
  const documentCount = Number(index?.count) ||
    index?.documents?.length ||
    0;

  if (
    !documentCount ||
    !document ||
    !Number(document.tokenCount)
  ) {
    return 0;
  }

  const averageLength = Math.max(
    1,
    Number(index.averageLength) || 1
  );

  const safeK1 = Number.isFinite(Number(k1))
    ? Math.max(0.01, Number(k1))
    : DEFAULT_K1;

  const safeB = Number.isFinite(Number(b))
    ? Math.max(0, Math.min(1, Number(b)))
    : DEFAULT_B;

  const tfMap = document.frequencies || {};
  const dfMap = index.documentFrequency || {};

  let score = 0;

  for (const term of queryTerms) {
    const tf = Number(
      Object.prototype.hasOwnProperty.call(tfMap, term)
        ? tfMap[term]
        : 0
    );

    if (!Number.isFinite(tf) || tf <= 0) {
      continue;
    }

    const df = Number(
      Object.prototype.hasOwnProperty.call(dfMap, term)
        ? dfMap[term]
        : 0
    );

    if (!Number.isFinite(df) || df < 0) {
      continue;
    }

    const idf = Math.log(
      1 + (
        (documentCount - df + 0.5) /
        (df + 0.5)
      )
    );

    const lengthRatio =
      Number(document.tokenCount) / averageLength;

    const denominator =
      tf +
      safeK1 * (
        1 - safeB +
        safeB * lengthRatio
      );

    if (denominator <= 0) continue;

    score +=
      idf *
      ((tf * (safeK1 + 1)) / denominator);
  }

  return Number.isFinite(score) ? score : 0;
}

function makeSnippet(text, queryTerms, maxLength = 480) {
  const source = String(text || '');
  const safeMaxLength = Math.max(
    80,
    Math.min(2000, Math.trunc(Number(maxLength) || 480))
  );

  if (source.length <= safeMaxLength) {
    return source;
  }

  const lower = source.toLowerCase();

  let bestPosition = -1;

  for (const term of queryTerms) {
    const position = lower.indexOf(term);

    if (
      position >= 0 &&
      (
        bestPosition < 0 ||
        position < bestPosition
      )
    ) {
      bestPosition = position;
    }
  }

  const start = bestPosition < 0
    ? 0
    : Math.max(
        0,
        bestPosition - Math.floor(safeMaxLength / 3)
      );

  const end = Math.min(
    source.length,
    start + safeMaxLength
  );

  return (
    (start > 0 ? '…' : '') +
    source.slice(start, end).trim() +
    (end < source.length ? '…' : '')
  );
}

function searchIndex(
  index,
  query,
  {
    limit = 8,
    minScore = 0,
    k1 = DEFAULT_K1,
    b = DEFAULT_B
  } = {}
) {
  if (
    !index ||
    !Array.isArray(index.documents) ||
    !index.documents.length
  ) {
    return [];
  }

  const queryTerms = Array.from(
    new Set(tokenize(query))
  );

  if (!queryTerms.length) {
    return [];
  }

  const safeMinScore = Number.isFinite(Number(minScore))
    ? Math.max(0, Number(minScore))
    : 0;

  const safeLimit = Math.max(
    1,
    Math.min(30, Math.trunc(Number(limit) || 8))
  );

  const results = [];

  for (const document of index.documents) {
    const score = scoreDocument(
      queryTerms,
      document,
      index,
      { k1, b }
    );

    if (
      !Number.isFinite(score) ||
      score <= 0 ||
      score < safeMinScore
    ) {
      continue;
    }

    results.push({
      id: document.id,
      projectId: document.projectId,
      documentId: document.documentId,
      documentName: document.documentName,
      heading: document.heading,
      ordinal: document.ordinal,
      score,
      text: document.text,
      snippet: makeSnippet(
        document.text,
        queryTerms
      )
    });
  }

  results.sort((a, b) => b.score - a.score);

  return results.slice(0, safeLimit);
}

module.exports = {
  tokenize,
  buildIndex,
  scoreDocument,
  searchIndex,
  makeSnippet,
  DEFAULT_K1,
  DEFAULT_B,
  INDEX_VERSION
};
