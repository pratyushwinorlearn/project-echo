
export const HIGHLIGHT_COLORS = [
  {
    id: 'yellow',
    label: 'Yellow',
    hex: '#FFF0A8'
  },
  {
    id: 'green',
    label: 'Green',
    hex: '#D9F0DF'
  },
  {
    id: 'blue',
    label: 'Blue',
    hex: '#DCEBFF'
  },
  {
    id: 'pink',
    label: 'Pink',
    hex: '#F9DDE9'
  }
];

const VALID_COLORS = new Set(
  HIGHLIGHT_COLORS.map((color) => color.id)
);

function isWordCharacter(character) {
  return Boolean(
    character && /[\p{L}\p{N}_]/u.test(character)
  );
}

export function normalizeHighlights(highlights) {
  if (!Array.isArray(highlights)) return [];

  const result = [];
  const seen = new Set();

  for (const item of highlights) {
    if (!item || typeof item !== 'object') continue;

    const text = String(item.text || '')
      .replace(/\s+/g, ' ')
      .trim();

    const color = VALID_COLORS.has(item.color)
      ? item.color
      : 'yellow';

    if (!text || text.length > 160) continue;

    const key = `${text.toLocaleLowerCase()}::${color}`;

    if (seen.has(key)) continue;

    seen.add(key);

    result.push({
      id: String(item.id || crypto.randomUUID()),
      text,
      color
    });
  }

  return result;
}

/*
 * Find every occurrence of every highlighted phrase.
 *
 * Whole-word matching is used when the phrase begins
 * and ends with letters or numbers.
 */

export function getHighlightRanges(content, highlights = []) {
  const source = String(content || '');
  const normalized = normalizeHighlights(highlights);

  const ranges = [];

  for (const highlight of normalized) {
    const phrase = highlight.text;

    const lowerSource = source.toLocaleLowerCase();
    const lowerPhrase = phrase.toLocaleLowerCase();

    let searchFrom = 0;

    while (searchFrom < source.length) {
      const start = lowerSource.indexOf(
        lowerPhrase,
        searchFrom
      );

      if (start < 0) break;

      const end = start + phrase.length;

      const first = phrase[0];
      const last = phrase[phrase.length - 1];

      const checkLeft = isWordCharacter(first);
      const checkRight = isWordCharacter(last);

      const previous = source[start - 1] || '';
      const next = source[end] || '';

      const leftBoundary =
        !checkLeft || !isWordCharacter(previous);

      const rightBoundary =
        !checkRight || !isWordCharacter(next);

      if (leftBoundary && rightBoundary) {
        ranges.push({
          start,
          end,
          color: highlight.color,
          text: highlight.text,
          id: highlight.id,
          length: end - start
        });
      }

      searchFrom = start + Math.max(1, phrase.length);
    }
  }

  ranges.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;

    // Prefer the longest match when phrases overlap.
    return b.length - a.length;
  });

  return ranges;
}

/*
 * Returns the highlight touching a rendered text range.
 */

export function highlightAtRange(
  ranges,
  start,
  end
) {
  if (!Array.isArray(ranges)) return null;

  return (
    ranges.find((range) =>
      range.start < end &&
      range.end > start
    ) || null
  );
}

/*
 * Converts text to renderable pieces for the editor overlay.
 */

export function buildHighlightSegments(
  content,
  highlights = []
) {
  const source = String(content || '');

  if (!source) {
    return [];
  }

  const ranges = getHighlightRanges(
    source,
    highlights
  );

  if (!ranges.length) {
    return [{
      text: source,
      color: null
    }];
  }

  const segments = [];

  let cursor = 0;

  for (const range of ranges) {
    // Ignore ranges overlapping a previously rendered phrase.
    if (range.start < cursor) continue;

    if (range.start > cursor) {
      segments.push({
        text: source.slice(cursor, range.start),
        color: null
      });
    }

    segments.push({
      text: source.slice(range.start, range.end),
      color: range.color
    });

    cursor = range.end;
  }

  if (cursor < source.length) {
    segments.push({
      text: source.slice(cursor),
      color: null
    });
  }

  return segments;
}

export function addPhraseHighlight(
  currentHighlights,
  phrase,
  color = 'yellow'
) {
  const cleanPhrase = String(phrase || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanPhrase) {
    return normalizeHighlights(currentHighlights);
  }

  if (!VALID_COLORS.has(color)) {
    color = 'yellow';
  }

  const current = normalizeHighlights(currentHighlights);

  const exists = current.some(
    (item) =>
      item.text.toLocaleLowerCase() ===
      cleanPhrase.toLocaleLowerCase() &&
      item.color === color
  );

  if (exists) return current;

  return [
    ...current,
    {
      id: crypto.randomUUID(),
      text: cleanPhrase,
      color
    }
  ];
}

export function removePhraseHighlight(
  currentHighlights,
  phrase
) {
  const target = String(phrase || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();

  return normalizeHighlights(currentHighlights).filter(
    (item) =>
      item.text.toLocaleLowerCase() !== target
  );
}
