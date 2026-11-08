
/* =========================================
   PROJECT ECHO — SPEECH ALIGNMENT ENGINE
========================================= */

/*
 * This module maps Deepgram's short interim/final transcript segments
 * onto the words in the script or generated answer.
 *
 * Important behaviour:
 * - Uses the same token offsets for matching and UI rendering.
 * - Searches a local window around the last confirmed position first.
 * - Uses local sequence alignment rather than a greedy global match.
 * - Requires meaningful word evidence before moving the cursor.
 * - Permits long forward recovery only for strong final transcripts.
 * - Interim results are provisional; App.jsx commits only final results.
 */

const WORD_PATTERN =
  /[\p{L}\p{N}]+(?:[’'][\p{L}\p{N}]+)*(?:[._/-][\p{L}\p{N}]+)*(?:\+\+|#)?/gu;

const STOP_WORDS = new Set([
  'a', 'an', 'the',
  'is', 'are', 'am', 'be', 'been', 'being',
  'to', 'of', 'and', 'or', 'but', 'nor',
  'in', 'on', 'at', 'by', 'for', 'from',
  'with', 'as', 'if', 'than', 'then',
  'it', 'its', 'this', 'that', 'these', 'those',
  'i', 'me', 'my', 'mine', 'we', 'us', 'our', 'ours',
  'you', 'your', 'yours', 'he', 'him', 'his',
  'she', 'her', 'hers', 'they', 'them', 'their', 'theirs',
  'who', 'what', 'when', 'where', 'why', 'how',
  'do', 'does', 'did', 'done',
  'have', 'has', 'had',
  'was', 'were',
  'can', 'could', 'would', 'should', 'will',
  'may', 'might', 'must',
  'not', 'no', 'yes',
  'so', 'too', 'very', 'just', 'also',
  'here', 'there', 'now', 'then',
  'about', 'into', 'over', 'under', 'after', 'before',
  'up', 'down', 'out', 'off', 'again',
  'all', 'any', 'some', 'each', 'every',
  'more', 'most', 'many', 'much', 'few',
  'one', 'two', 'three'
]);

const NUMBER_WORDS = new Map([
  ['zero', '0'],
  ['oh', '0'],
  ['one', '1'],
  ['two', '2'],
  ['three', '3'],
  ['four', '4'],
  ['five', '5'],
  ['six', '6'],
  ['seven', '7'],
  ['eight', '8'],
  ['nine', '9'],
  ['ten', '10']
]);

const WORD_ALIASES = new Map([
  ['pytorch', 'pytorch'],
  ['javascript', 'javascript'],
  ['js', 'javascript'],
  ['typescript', 'typescript'],
  ['ts', 'typescript'],
  ['postgres', 'postgresql'],
  ['postgresql', 'postgresql'],
  ['nodejs', 'nodejs'],
  ['dotnet', 'dotnet'],
  ['net', 'dotnet'],
  ['csharp', 'csharp'],
  ['cplusplus', 'cplusplus'],
  ['cpp', 'cplusplus'],
  ['github', 'github'],
  ['frontend', 'frontend'],
  ['backend', 'backend'],
  ['websocket', 'websocket'],
  ['websockets', 'websocket'],
  ['web rtc', 'webrtc'],
  ['webrtc', 'webrtc'],
  ['datachannel', 'datachannels']
]);

/* =========================================
   NORMALISATION
========================================= */

function normalizeSingleWord(value) {
  let normalized = String(value || '')
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[’']/g, '');

  // Preserve meaningful programming-language symbols.
  if (normalized === 'c++') return 'cplusplus';
  if (normalized === 'c#') return 'csharp';

  normalized = normalized.replace(/[._/-]/g, '');
  normalized = normalized.replace(/[^\p{L}\p{N}]/gu, '');

  if (!normalized) return '';

  if (NUMBER_WORDS.has(normalized)) {
    normalized = NUMBER_WORDS.get(normalized);
  }

  return WORD_ALIASES.get(normalized) || normalized;
}

/* =========================================
   TOKENISATION
========================================= */

function tokeniseText(value, combineSpokenAliases = false) {
  const source = String(value || '');
  const tokens = [];

  WORD_PATTERN.lastIndex = 0;

  let match;

  while ((match = WORD_PATTERN.exec(source)) !== null) {
    const text = match[0];

    tokens.push({
      text,
      normalized: normalizeSingleWord(text),
      start: match.index,
      end: match.index + text.length
    });
  }

  if (combineSpokenAliases && tokens.length > 1) {
    const phrases = [
      {
        words: ['pie', 'torch'],
        normalized: 'pytorch'
      },
      {
        words: ['front', 'end'],
        normalized: 'frontend'
      },
      {
        words: ['back', 'end'],
        normalized: 'backend'
      },
      {
        words: ['node', 'js'],
        normalized: 'nodejs'
      },
      {
        words: ['web', 'rtc'],
        normalized: 'webrtc'
      },
      {
        words: ['data', 'channel'],
        normalized: 'datachannels'
      },
      {
        words: ['data', 'channels'],
        normalized: 'datachannels'
      },
      {
        words: ['c', 'plus', 'plus'],
        normalized: 'cplusplus'
      },
      {
        words: ['c', 'sharp'],
        normalized: 'csharp'
      }
    ];

    let index = 0;

    while (index < tokens.length) {
      let combined = false;

      for (const phrase of phrases) {
        const count = phrase.words.length;
        const slice = tokens.slice(index, index + count);

        if (slice.length !== count) continue;

        const matches = slice.every(
          (token, offset) =>
            token.normalized === phrase.words[offset]
        );

        if (!matches) continue;

        const first = slice[0];
        const last = slice[slice.length - 1];

        tokens.splice(index, count, {
          text: source.slice(first.start, last.end),
          normalized: phrase.normalized,
          start: first.start,
          end: last.end
        });

        combined = true;
        break;
      }

      if (!combined) index += 1;
    }
  }

  return tokens;
}

export function tokenizeScript(script) {
  return tokeniseText(script, false);
}

/* =========================================
   EDIT DISTANCE
========================================= */

function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = new Array(b.length + 1);
  let current = new Array(b.length + 1);

  for (let j = 0; j <= b.length; j += 1) {
    previous[j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost
      );
    }

    [previous, current] = [current, previous];
  }

  return previous[b.length];
}

/* =========================================
   WORD MATCH SCORING
========================================= */

function wordMatchScore(heard, target) {
  if (!heard || !target) return -2;

  if (heard === target) {
    // Common grammatical words provide alignment context,
    // but they must not drive cursor movement by themselves.
    return STOP_WORDS.has(heard) ? 0.18 : 3.2;
  }

  // Do not fuzzy-match short words or numbers.
  if (Math.min(heard.length, target.length) < 5) {
    return -2;
  }

  if (/^\d+$/.test(heard) || /^\d+$/.test(target)) {
    return -2;
  }

  const distance = editDistance(heard, target);
  const longest = Math.max(heard.length, target.length);
  const similarity = 1 - distance / longest;

  const allowedDistance =
    longest >= 10 ? 2 : 1;

  if (
    distance <= allowedDistance &&
    similarity >= 0.84
  ) {
    return 2.15 * similarity;
  }

  return -2;
}

/* =========================================
   EMPTY RESULT
========================================= */

function emptyAlignment(extra = {}) {
  return {
    accepted: false,
    startIndex: -1,
    endIndex: -1,
    matchedWords: 0,
    exactMatches: 0,
    coverage: 0,
    density: 0,
    confidence: 0,
    isBacktrack: false,
    globalRecovery: false,
    jump: 0,
    transcriptWordCount: 0,
    informativeWordCount: 0,
    score: 0,
    ...extra
  };
}

/* =========================================
   TARGET TOKEN NORMALISATION
========================================= */

function prepareTargetTokens(scriptTokens) {
  if (Array.isArray(scriptTokens)) {
    return scriptTokens
      .map((token) => {
        const text =
          typeof token === 'string'
            ? token
            : String(token?.text || '');

        const normalized =
          typeof token === 'string'
            ? normalizeSingleWord(token)
            : token?.normalized ||
              normalizeSingleWord(text);

        return {
          text,
          normalized: String(normalized || ''),
          start: Number(token?.start),
          end: Number(token?.end)
        };
      })
      .filter((token) => token.normalized);
  }

  return tokenizeScript(scriptTokens);
}

/* =========================================
   LOCAL SEQUENCE ALIGNMENT
========================================= */

/*
 * Smith-Waterman-style local sequence alignment.
 *
 * Unlike the previous semi-global matcher, this does not give the
 * transcript a free match at every position across the entire answer.
 * It scores local word sequences and penalises distant matches.
 */

function alignInWindow(
  target,
  heard,
  windowStart,
  windowEnd,
  anchorIndex,
  mode
) {
  const windowTokens = target.slice(windowStart, windowEnd);

  const heardCount = heard.length;
  const targetCount = windowTokens.length;

  if (!heardCount || !targetCount) {
    return null;
  }

  const dp = Array.from(
    { length: heardCount + 1 },
    () => new Float32Array(targetCount + 1)
  );

  const trace = Array.from(
    { length: heardCount + 1 },
    () => new Uint8Array(targetCount + 1)
  );

  const origin = Array.from(
    { length: heardCount + 1 },
    () => {
      const row = new Int32Array(targetCount + 1);
      row.fill(-1);
      return row;
    }
  );

  const SKIP_HEARD = -1.25;
  const SKIP_TARGET = -0.32;

  let best = null;

  for (let i = 1; i <= heardCount; i += 1) {
    for (let j = 1; j <= targetCount; j += 1) {
      const heardToken = heard[i - 1];
      const targetToken = windowTokens[j - 1];

      const matchScore = wordMatchScore(
        heardToken.normalized,
        targetToken.normalized
      );

      let bestScore = 0;
      let direction = 0;
      let bestOrigin = -1;

      // 1 = diagonal match.
      if (matchScore > 0) {
        const previousScore = dp[i - 1][j - 1];
        const candidateScore = previousScore + matchScore;

        if (candidateScore > bestScore) {
          bestScore = candidateScore;
          direction = 1;

          bestOrigin = previousScore > 0
            ? origin[i - 1][j - 1]
            : windowStart + j - 1;
        }
      }

      // 2 = skip a heard word.
      const skipHeard = dp[i - 1][j] + SKIP_HEARD;

      if (skipHeard > bestScore) {
        bestScore = skipHeard;
        direction = 2;
        bestOrigin = origin[i - 1][j];
      }

      // 3 = skip a target word.
      const skipTarget = dp[i][j - 1] + SKIP_TARGET;

      if (skipTarget > bestScore) {
        bestScore = skipTarget;
        direction = 3;
        bestOrigin = origin[i][j - 1];
      }

      if (bestScore <= 0) {
        dp[i][j] = 0;
        trace[i][j] = 0;
        origin[i][j] = -1;
        continue;
      }

      dp[i][j] = bestScore;
      trace[i][j] = direction;
      origin[i][j] = bestOrigin;

      if (bestOrigin < 0) continue;

      const forwardDistance = Math.max(
        0,
        bestOrigin - anchorIndex
      );

      const backwardDistance = Math.max(
        0,
        anchorIndex - bestOrigin
      );

      // Prefer the phrase near the current cursor, but allow recovery
      // slightly ahead or behind it when the word evidence is strong.
      const distancePenalty =
        Math.max(0, forwardDistance - 4) * 0.12 +
        backwardDistance * 0.24;

      const adjustedScore = bestScore - distancePenalty;

      if (!best || adjustedScore > best.adjustedScore) {
        best = {
          i,
          j,
          rawScore: bestScore,
          adjustedScore,
          start: bestOrigin
        };
      }
    }
  }

  if (!best) return null;

  /* =========================================
     TRACE BACK THE BEST MATCH
  ========================================= */

  const matchedPairs = [];

  let i = best.i;
  let j = best.j;

  while (i > 0 && j > 0 && dp[i][j] > 0) {
    const direction = trace[i][j];

    if (direction === 1) {
      const heardToken = heard[i - 1];
      const targetToken = windowTokens[j - 1];

      const score = wordMatchScore(
        heardToken.normalized,
        targetToken.normalized
      );

      if (score > 0) {
        matchedPairs.push({
          heardIndex: i - 1,
          targetIndex: windowStart + j - 1,
          heard: heardToken.normalized,
          target: targetToken.normalized,
          exact: heardToken.normalized === targetToken.normalized,
          informative: !STOP_WORDS.has(heardToken.normalized)
        });
      }

      i -= 1;
      j -= 1;
    } else if (direction === 2) {
      i -= 1;
    } else if (direction === 3) {
      j -= 1;
    } else {
      break;
    }
  }

  matchedPairs.reverse();

  if (!matchedPairs.length) return null;

  const informativeHeard = heard.filter(
    (token) => !STOP_WORDS.has(token.normalized)
  );

  const informativeHeardCount = informativeHeard.length;

  const informativePairs = matchedPairs.filter(
    (pair) => pair.informative
  );

  const matchedWords = informativePairs.length;

  const exactMatches = informativePairs.filter(
    (pair) => pair.exact
  ).length;

  const fuzzyMatches = matchedWords - exactMatches;

  const coverage = informativeHeardCount > 0
    ? matchedWords / informativeHeardCount
    : 0;

  const targetIndexes = informativePairs.map(
    (pair) => pair.targetIndex
  );

  const startIndex = targetIndexes.length
    ? Math.min(...targetIndexes)
    : -1;

  const lastMatchedIndex = targetIndexes.length
    ? Math.max(...targetIndexes)
    : -1;

  const endIndex = lastMatchedIndex >= 0
    ? lastMatchedIndex + 1
    : -1;

  const span = startIndex >= 0
    ? endIndex - startIndex
    : 0;

  const density = span > 0
    ? matchedWords / span
    : 0;

  const exactLongSingle =
    informativeHeardCount === 1 &&
    matchedWords === 1 &&
    exactMatches === 1 &&
    informativeHeard[0].normalized.length >= 7;

  const enoughMatches =
    matchedWords >= 2 || exactLongSingle;

  const minCoverage = mode === 'interim'
    ? 0.62
    : 0.55;

  const accepted =
    informativeHeardCount > 0 &&
    enoughMatches &&
    coverage >= minCoverage &&
    density >= 0.20 &&
    best.rawScore >= 3.0 &&
    (
      exactMatches >= 1 ||
      (matchedWords >= 3 && fuzzyMatches >= 2)
    );

  const confidence = Math.max(
    0,
    Math.min(
      1,
      coverage * 0.72 +
      density * 0.18 +
      (exactMatches / Math.max(1, matchedWords)) * 0.10
    )
  );

  return {
    accepted,
    startIndex,
    endIndex,
    matchedWords,
    exactMatches,
    fuzzyMatches,
    coverage,
    density,
    confidence,
    score: best.rawScore,
    adjustedScore: best.adjustedScore,
    transcriptWordCount: heardCount,
    informativeWordCount: informativeHeardCount,
    jump: startIndex >= 0
      ? startIndex - anchorIndex
      : 0,
    matchedPairs
  };
}

/* =========================================
   GLOBAL RECOVERY VALIDATION
========================================= */

function isStrongGlobalRecovery(result) {
  if (!result) return false;

  return (
    result.accepted &&
    result.informativeWordCount >= 3 &&
    result.matchedWords >= 3 &&
    result.exactMatches >= 3 &&
    result.coverage >= 0.80 &&
    result.density >= 0.25 &&
    result.score >= 6.5
  );
}

/* =========================================
   PUBLIC ALIGNMENT FUNCTION
========================================= */

/**
 * Align a Deepgram transcript segment with the script or answer.
 *
 * @param {Array|string} scriptTokens Full target tokens or text.
 * @param {string} transcript Deepgram interim/final transcript.
 * @param {number} anchorIndex Last confirmed cursor position.
 * @param {object} options
 * @param {'interim'|'final'} options.mode
 * @param {boolean} options.allowGlobalRecovery
 * @param {number} options.localForwardWindow
 *
 * endIndex is exclusive: it points to the next word after the
 * last matched target word, which is the cursor convention in App.jsx.
 */
export function alignTranscriptToScript(
  scriptTokens,
  transcript,
  anchorIndex = 0,
  options = {}
) {
  const target = prepareTargetTokens(scriptTokens);
  const heard = tokeniseText(transcript, true);

  if (!target.length || !heard.length) {
    return emptyAlignment({
      transcriptWordCount: heard.length
    });
  }

  const safeAnchor = Math.max(
    0,
    Math.min(
      target.length,
      Number.isFinite(Number(anchorIndex))
        ? Number(anchorIndex)
        : 0
    )
  );

  const mode = options.mode === 'interim'
    ? 'interim'
    : 'final';

  const allowGlobalRecovery =
    options.allowGlobalRecovery !== false &&
    mode === 'final';

  const requestedWindow = Number(
    options.localForwardWindow
  );

  const localForwardWindow = Number.isFinite(requestedWindow)
    ? Math.max(12, Math.min(60, Math.round(requestedWindow)))
    : mode === 'interim'
      ? 26
      : 38;

  /*
   * Start a few words before the cursor so a repeated word or
   * recognition boundary does not cause a false rejection.
   * The App only commits a non-decreasing final cursor.
   */

  const localStart = Math.max(0, safeAnchor - 3);

  const localEnd = Math.min(
    target.length,
    Math.max(
      localStart + 1,
      safeAnchor + localForwardWindow
    )
  );

  const localResult = alignInWindow(
    target,
    heard,
    localStart,
    localEnd,
    safeAnchor,
    mode
  );

  if (localResult?.accepted) {
    const maxLocalJump = mode === 'interim'
      ? Math.max(8, heard.length * 2)
      : Math.max(12, heard.length * 2 + 4);

    const isNearby =
      localResult.jump <= maxLocalJump &&
      localResult.endIndex >= safeAnchor - 2;

    if (isNearby) {
      return {
        ...localResult,
        isBacktrack: localResult.endIndex < safeAnchor,
        globalRecovery: false
      };
    }
  }

  /*
   * If the speaker has jumped far ahead, permit recovery only
   * from a final segment containing several strong exact matches.
   * Interim guesses are never allowed to search the full answer.
   */

  if (allowGlobalRecovery) {
    const recoveryStart = Math.max(0, safeAnchor - 2);

    const recoveryResult = alignInWindow(
      target,
      heard,
      recoveryStart,
      target.length,
      safeAnchor,
      mode
    );

    if (
      isStrongGlobalRecovery(recoveryResult) &&
      recoveryResult.startIndex >= safeAnchor - 2
    ) {
      return {
        ...recoveryResult,
        accepted: true,
        isBacktrack: false,
        globalRecovery: true
      };
    }
  }

  return emptyAlignment({
    transcriptWordCount: heard.length,
    informativeWordCount: heard.filter(
      (token) => !STOP_WORDS.has(token.normalized)
    ).length,
    localResult,
    globalRecovery: false
  });
}

/* =========================================
   DEEPGRAM KEYTERM EXTRACTION
========================================= */

export function extractKeyterms(script) {
  const source = String(script || '');

  const candidates = source.match(
    /(?:\b[A-Z][A-Za-z0-9]*(?:[._/-][A-Za-z0-9]+)*(?:\+\+|#)?\b|\b[A-Z0-9]{2,}\b)/g
  ) || [];

  const ignored = new Set([
    'I', 'A', 'AI',
    'The', 'This', 'That', 'These', 'Those',
    'Hello', 'Today', 'Thanks', 'First', 'Most',
    'We', 'Our', 'You', 'Your', 'It', 'They',
    'But', 'And', 'For', 'With', 'From'
  ]);

  const terms = new Map();

  for (const candidate of candidates) {
    const cleaned = candidate.trim();

    if (
      cleaned.length < 3 ||
      cleaned.length > 40 ||
      ignored.has(cleaned)
    ) {
      continue;
    }

    const normalised = normalizeSingleWord(cleaned);

    if (!normalised || STOP_WORDS.has(normalised)) {
      continue;
    }

    const key = normalised.toLocaleLowerCase();

    if (!terms.has(key)) {
      terms.set(key, cleaned);
    }

    if (terms.size >= 24) break;
  }

  return Array.from(terms.values());
}
