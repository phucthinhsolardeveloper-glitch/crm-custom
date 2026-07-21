// Vietnamese text similarity utilities for payment matching.
// Pure functions - no IO, deterministic, safe for cron/realtime use.

const VIETNAMESE_DIACRITICS_REGEX = /[̀-ͯ]/g;

/** Strip Vietnamese diacritics: "Nguyễn Đình" -> "Nguyen Dinh". */
export function stripVietnameseDiacritics(s: string): string {
  return s
    .normalize('NFD')
    .replace(VIETNAMESE_DIACRITICS_REGEX, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

// Vietnamese banking transfer stop words - strip to reduce noise in token compare.
const DEFAULT_STOP_WORDS = new Set([
  'ck', 'tt', 'chuyen', 'khoan', 'thanh', 'toan',
  'mua', 'hang', 'don', 'ma', 'gd', 'cktt', 'cktgt',
  'noi', 'dung', 'tu', 'den', 'cho', 'va', 'la',
]);

/** Tokenize a string: strip diacritics, lowercase, split on non-alnum, drop stop words and tokens < 2 chars. */
export function tokenize(s: string, stopWords: Set<string> = DEFAULT_STOP_WORDS): string[] {
  return stripVietnameseDiacritics(s)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !stopWords.has(t));
}

/** Ratio of tokens in `a` that also appear in `b`, normalized by max length. Range 0..1. */
export function tokenOverlapRatio(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const matches = a.filter((t) => setB.has(t)).length;
  return matches / Math.max(a.length, b.length);
}

/**
 * Levenshtein distance between two strings - capped to MAX_LEN to prevent OOM.
 * Standard 2-row DP, returns edit distance (insert + delete + substitute).
 */
const MAX_LEN = 100;
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const aS = a.length > MAX_LEN ? a.slice(0, MAX_LEN) : a;
  const bS = b.length > MAX_LEN ? b.slice(0, MAX_LEN) : b;

  let prev = new Array(bS.length + 1);
  let curr = new Array(bS.length + 1);
  for (let j = 0; j <= bS.length; j++) prev[j] = j;

  for (let i = 1; i <= aS.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= bS.length; j++) {
      const cost = aS[i - 1] === bS[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,        // insert
        prev[j] + 1,            // delete
        prev[j - 1] + cost,     // substitute
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[bS.length];
}
