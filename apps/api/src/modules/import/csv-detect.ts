import * as iconv from 'iconv-lite';

/**
 * CSV file detection utilities - handle the two common quirks of Excel-saved CSVs
 * on Vietnamese / European Windows locales:
 *
 *   1. Encoding ≠ UTF-8: Excel "Save As → CSV" defaults to ANSI (Windows-1258 on
 *      Vietnamese Windows) → reading as UTF-8 mojibakes diacritics into '?' / '�'.
 *   2. Delimiter ≠ ',':   Excel uses ';' when the locale's decimal separator is ','
 *      (VN, DE, FR, IT...) → parser configured for ',' sees the whole row as 1 column.
 *
 * Strategy: detect both from the raw bytes BEFORE feeding csv-parse, so users can
 * upload whatever Excel produced without manual re-saving.
 */

export type DetectedEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1258';
export type DetectedDelimiter = ',' | ';' | '\t' | '|';

const DELIMITERS: DetectedDelimiter[] = [',', ';', '\t', '|'];

/**
 * Detect encoding from raw bytes.
 * - BOM check first (most reliable signal Excel/Notepad emit).
 * - Otherwise try strict UTF-8 decode; fall back to Windows-1258 (covers
 *   Windows-1252 too - they share the printable ASCII range).
 */
export function detectEncoding(buf: Buffer): DetectedEncoding {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return 'utf-8';
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return 'utf-16le';
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return 'utf-16be';

  // No BOM - try strict UTF-8. TextDecoder with fatal:true throws on invalid sequences.
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return 'utf-8';
  } catch {
    return 'windows-1258';
  }
}

/**
 * Decode a buffer to a UTF-8 JavaScript string given a known encoding.
 * Strips any leading BOM so downstream consumers don't see a stray U+FEFF.
 */
export function decodeBuffer(buf: Buffer, encoding: DetectedEncoding): string {
  let text: string;
  if (encoding === 'utf-8') {
    text = buf.toString('utf8');
  } else if (encoding === 'utf-16le') {
    text = buf.toString('utf16le');
  } else if (encoding === 'utf-16be') {
    // Node has no native utf16be - swap byte pairs and decode as utf16le.
    const swapped = Buffer.alloc(buf.length);
    for (let i = 0; i + 1 < buf.length; i += 2) {
      swapped[i] = buf[i + 1];
      swapped[i + 1] = buf[i];
    }
    text = swapped.toString('utf16le');
  } else {
    text = iconv.decode(buf, 'win1258');
  }
  // Strip leading BOM (U+FEFF) - appears after decoding any BOM-prefixed file.
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Sniff the delimiter from the first non-empty line.
 * Counts each candidate OUTSIDE quoted segments (so "a,b","c" doesn't inflate the
 * comma count). Returns the most frequent; ties broken by DELIMITERS order.
 */
export function detectDelimiter(text: string): DetectedDelimiter {
  const firstLine = (text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '').slice(0, 4096);

  // Count delimiter chars only when we're not inside a quoted field.
  let inQuotes = false;
  const counts: Record<DetectedDelimiter, number> = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (ch === ',' || ch === ';' || ch === '\t' || ch === '|')) {
      counts[ch]++;
    }
  }

  let best: DetectedDelimiter = ',';
  let bestCount = -1;
  for (const d of DELIMITERS) {
    if (counts[d] > bestCount) {
      bestCount = counts[d];
      best = d;
    }
  }
  return best;
}

/**
 * One-shot helper: read a buffer → detect encoding & delimiter → return UTF-8 text
 * ready to pipe into csv-parse. Used by both leads/customers and bank-transactions
 * importers so behaviour stays identical across the app.
 */
export function decodeBufferAuto(buf: Buffer): {
  text: string;
  encoding: DetectedEncoding;
  delimiter: DetectedDelimiter;
} {
  const encoding = detectEncoding(buf);
  const text = decodeBuffer(buf, encoding);
  const delimiter = detectDelimiter(text);
  return { text, encoding, delimiter };
}
