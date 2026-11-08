/* =========================================
   PROJECT ECHO
   IMPROVED SCRIPT ALIGNMENT ENGINE
========================================= */

export function tokenizeScript(text) {
  return (
    String(text || '').match(
      /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu
    ) || []
  );
}

/* =========================================
   NORMALIZATION
========================================= */

function normalizeWord(word) {
  return String(word)
    .toLocaleLowerCase()
    .replace(/’/g, "'")
    .replace(/[^\p{L}\p{N}']/gu, '');
}

/* =========================================
   WORD SIMILARITY
========================================= */

function wordsMatch(a, b) {
  if (!a || !b) {
    return false;
  }

  if (a === b) {
    return true;
  }

  // Short words should match exactly.
  if (
    Math.min(a.length, b.length) < 5 ||
    Math.abs(a.length - b.length) > 1
  ) {
    return false;
  }

  let i = 0;
  let j = 0;
  let differences = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }

    differences++;

    if (differences > 1) {
      return false;
    }

    if (a.length > b.length) {
      i++;
    } else if (b.length > a.length) {
      j++;
    } else {
      i++;
      j++;
    }
  }

  if (i < a.length || j < b.length) {
    differences++;
  }

  return differences <= 1;
}

/* =========================================
   PREPARE SPOKEN WORDS
========================================= */

function prepareTranscript(text) {
  const fillerWords = new Set([
    'um',
    'uh',
    'erm',
    'hmm',
    'mmm'
  ]);

  return tokenizeScript(text)
    .map(normalizeWord)
    .filter((word) => {
      return (
        word.length > 0 &&
        !fillerWords.has(word)
      );
    });
}

/* =========================================
   ALIGN ONE TRANSCRIPT AGAINST ONE START
========================================= */

function alignFromPosition(
  script,
  spoken,
  start,
  currentIndex
) {
  let scriptPosition = start;

  let matched = 0;
  let skippedScript = 0;
  let skippedSpoken = 0;

  let lastMatched = currentIndex;

  for (const spokenWord of spoken) {
    let foundIndex = -1;

    const searchEnd = Math.min(
      script.length,
      scriptPosition + 6
    );

    // Permit a few skipped script words.
    for (
      let index = scriptPosition;
      index < searchEnd;
      index++
    ) {
      if (
        wordsMatch(
          spokenWord,
          script[index]
        )
      ) {
        foundIndex = index;
        break;
      }
    }

    if (foundIndex >= 0) {
      matched++;

      skippedScript +=
        foundIndex - scriptPosition;

      lastMatched = foundIndex;

      scriptPosition = foundIndex + 1;
    } else {
      skippedSpoken++;
    }
  }

  const coverage =
    matched / spoken.length;

  const forwardDrift = Math.max(
    0,
    start - currentIndex
  );

  const backwardDrift = Math.max(
    0,
    currentIndex - start
  );

  const score =
    matched * 4 +
    coverage * 5 -
    skippedScript * 0.8 -
    skippedSpoken * 1.8 -
    forwardDrift * 0.08 -
    backwardDrift * 0.035;

  return {
    score,
    matched,
    coverage,
    endIndex: lastMatched + 1
  };
}

/* =========================================
   MAIN MATCHER
========================================= */

export function matchTranscriptToScript(
  scriptWords,
  transcript,
  currentIndex = 0
) {
  if (
    !Array.isArray(scriptWords) ||
    scriptWords.length === 0 ||
    !transcript
  ) {
    return currentIndex;
  }

  const spoken = prepareTranscript(transcript);

  if (!spoken.length) {
    return currentIndex;
  }

  const script = scriptWords.map(normalizeWord);

  // Search slightly behind the cursor because of overlap,
  // and ahead to accommodate skipped words.
  const firstStart = Math.max(
    0,
    currentIndex - 14
  );

  const lastStart = Math.min(
    script.length - 1,
    currentIndex + 35
  );

  let best = null;

  for (
    let start = firstStart;
    start <= lastStart;
    start++
  ) {
    const candidate = alignFromPosition(
      script,
      spoken,
      start,
      currentIndex
    );

    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }

  if (!best) {
    return currentIndex;
  }

  const requiredMatches =
    spoken.length <= 2
      ? 1
      : Math.max(
          2,
          Math.ceil(spoken.length * 0.3)
        );

  if (
    best.matched < requiredMatches ||
    best.coverage < 0.30
  ) {
    return currentIndex;
  }

  // Never move backwards.
  return Math.max(
    currentIndex,
    Math.min(
      script.length,
      best.endIndex
    )
  );
}