
'use strict';

const DEFAULT_CHUNK_WORDS = 500;
const DEFAULT_OVERLAP_WORDS = 70;

function extractHeading(line) {
  const match = String(line || '').match(
    /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/
  );

  return match
    ? match[1].trim()
    : null;
}

function splitSections(text) {
  const lines = String(text || '').split(/\r?\n/);

  const sections = [];

  let currentHeading = 'General';
  let currentLines = [];

  function flush() {
    const content = currentLines.join('\n').trim();

    if (content) {
      sections.push({
        heading: currentHeading,
        content
      });
    }

    currentLines = [];
  }

  for (const line of lines) {
    const heading = extractHeading(line);

    if (heading) {
      flush();
      currentHeading = heading;
      continue;
    }

    currentLines.push(line);
  }

  flush();

  return sections;
}

function toSafeInteger(value, fallback, minimum, maximum) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(
    minimum,
    Math.min(maximum, Math.trunc(number))
  );
}

function createChunks(
  content,
  {
    documentId,
    documentName,
    projectId,
    heading = 'General',
    chunkWords = DEFAULT_CHUNK_WORDS,
    overlapWords = DEFAULT_OVERLAP_WORDS,
    startingOrdinal = 0
  } = {}
) {
  const source = String(content || '');

  if (!source.trim()) {
    return [];
  }

  // Match non-whitespace words while retaining their
  // original character positions in the source.
  const words = Array.from(
    source.matchAll(/\S+/g)
  );

  if (!words.length) {
    return [];
  }

  const safeChunkWords = toSafeInteger(
    chunkWords,
    DEFAULT_CHUNK_WORDS,
    100,
    1200
  );

  // Explicit zero overlap is allowed.
  const safeOverlap = toSafeInteger(
    overlapWords,
    DEFAULT_OVERLAP_WORDS,
    0,
    safeChunkWords - 1
  );

  const step = safeChunkWords - safeOverlap;

  const firstOrdinal = toSafeInteger(
    startingOrdinal,
    0,
    0,
    Number.MAX_SAFE_INTEGER - 100000
  );

  const chunks = [];

  for (
    let start = 0;
    start < words.length;
    start += step
  ) {
    const end = Math.min(
      words.length,
      start + safeChunkWords
    );

    const firstWord = words[start];
    const lastWord = words[end - 1];

    const startCharacter = firstWord.index;

    const endCharacter =
      lastWord.index + lastWord[0].length;

    const chunkText = source
      .slice(startCharacter, endCharacter)
      .trim();

    if (chunkText) {
      const ordinal = firstOrdinal + chunks.length;

      chunks.push({
        id: `${documentId}:${ordinal}`,
        projectId,
        documentId,
        documentName,
        heading,
        ordinal,
        startWord: start,
        endWord: end,
        wordCount: end - start,
        text: chunkText
      });
    }

    if (end >= words.length) {
      break;
    }
  }

  return chunks;
}

function chunkDocument(
  text,
  {
    documentId,
    documentName,
    projectId,
    chunkWords = DEFAULT_CHUNK_WORDS,
    overlapWords = DEFAULT_OVERLAP_WORDS
  } = {}
) {
  if (!documentId || !projectId) {
    throw new Error(
      'Document and project IDs are required for chunking.'
    );
  }

  const sections = splitSections(text);

  const chunks = [];

  let ordinal = 0;

  for (const section of sections) {
    const sectionChunks = createChunks(
      section.content,
      {
        documentId,
        documentName,
        projectId,
        heading: section.heading,
        chunkWords,
        overlapWords,
        startingOrdinal: ordinal
      }
    );

    chunks.push(...sectionChunks);

    ordinal += sectionChunks.length;
  }

  return chunks;
}

module.exports = {
  chunkDocument,
  createChunks,
  splitSections,
  extractHeading,
  DEFAULT_CHUNK_WORDS,
  DEFAULT_OVERLAP_WORDS
};
