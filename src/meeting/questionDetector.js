
const QUESTION_PATTERNS = [
  /\?$/,

  /^(what|why|how|when|where|who|whom|whose|which)\b/i,

  /^(can|could|would|will|should|do|does|did|is|are|was|were|have|has|had)\s+you\b/i,

  /^(tell me|explain|describe|walk me through|give me|list|name|compare)\b/i,

  /\b(what|why|how|when|where|who|which)\b/i
];

function cleanText(value) {
  return String(value || '')
    .replace(/^[\s"'“”‘’\-–—]+/, '')
    .replace(/[\s"'“”‘’]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isQuestionLike(text) {
  const words = text.match(/[\p{L}\p{N}]+/gu) || [];

  if (words.length < 4 || text.length < 12) {
    return false;
  }

  return QUESTION_PATTERNS.some(
    (pattern) => pattern.test(text)
  );
}

export function extractQuestionCandidate(transcript) {
  const text = cleanText(transcript);

  if (!text) return null;

  // Split into sentences while preserving the actual question wording.
  const sentences = text
    .split(/(?<=[.!?؟])\s+|\n+/u)
    .map(cleanText)
    .filter(Boolean);

  // Prefer the last complete question-like sentence.
  for (let index = sentences.length - 1; index >= 0; index -= 1) {
    if (isQuestionLike(sentences[index])) {
      return sentences[index];
    }
  }

  // Handle questions with missing punctuation.
  if (isQuestionLike(text)) {
    return text;
  }

  return null;
}
