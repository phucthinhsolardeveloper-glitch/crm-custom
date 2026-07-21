/**
 * Sanitize CSV cell values to prevent formula injection.
 * Prefixes dangerous characters (= + - @ |) with a tab character.
 * Apply on BOTH import (sanitize input) and export (sanitize output).
 */
const DANGEROUS_PREFIXES = ['=', '+', '-', '@', '|'];

export function sanitizeCsvCell(value: string | null | undefined): string {
  if (value == null) return '';

  const str = String(value);
  if (DANGEROUS_PREFIXES.some((prefix) => str.startsWith(prefix))) {
    return `\t${str}`;
  }

  return str;
}

/**
 * Sanitize an entire row of CSV values.
 */
export function sanitizeCsvRow(row: Record<string, unknown>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    sanitized[key] = sanitizeCsvCell(value as string);
  }
  return sanitized;
}
