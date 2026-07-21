import { SENSITIVE_KEY_TOKENS, MAX_FIELD_BYTES, MAX_DEPTH, REDACTED } from './audit-log.constants';

/**
 * Recursively walk a value and:
 *  - redact values whose keys contain any sensitive token (case-insensitive substring)
 *  - truncate string values exceeding MAX_FIELD_BYTES
 *  - stop recursion past MAX_DEPTH
 *  - leave Date / Buffer / null / undefined untouched
 *
 * Pure function. Does not mutate input.
 */
export function sanitize(input: unknown, depth = 0): unknown {
  if (input === null || input === undefined) return input;
  if (depth >= MAX_DEPTH) return '[Truncated: max depth]';

  if (typeof input === 'string') return truncateString(input);
  if (typeof input === 'number' || typeof input === 'boolean' || typeof input === 'bigint') return input;
  if (input instanceof Date) return input;
  if (Buffer.isBuffer(input)) return `[Buffer ${input.length} bytes]`;

  if (Array.isArray(input)) return input.map((item) => sanitize(item, depth + 1));

  if (typeof input === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        result[key] = REDACTED;
      } else {
        result[key] = sanitize(value, depth + 1);
      }
    }
    return result;
  }

  return input;
}

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_TOKENS.some((token) => lower.includes(token));
}

function truncateString(value: string): string {
  // Use byte length, not char length - multi-byte chars (Vietnamese) inflate quickly.
  const bytes = Buffer.byteLength(value, 'utf8');
  if (bytes <= MAX_FIELD_BYTES) return value;
  // Slice by char count is approximate but safe; we add the hint suffix.
  const sliced = value.slice(0, MAX_FIELD_BYTES);
  return `${sliced}...[truncated, original_length=${bytes}]`;
}
