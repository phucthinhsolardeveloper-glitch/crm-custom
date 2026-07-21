// Vietnam runs a single fixed offset UTC+7 (no daylight saving). Bank statements
// and the reconciliation date filters carry local wall-clock times with no
// timezone marker, so we anchor them to +07:00 explicitly instead of relying on
// the server process timezone (which otherwise shifts late-day transactions
// across midnight).
export const VN_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Build a UTC instant from Vietnam wall-clock components. Returns undefined when
 * the components form an invalid date.
 */
export function vnWallClockToDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date | undefined {
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - VN_UTC_OFFSET_MS;
  const d = new Date(utcMs);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Same as vnWallClockToDate but returns an ISO string (keeps existing callers). */
export function vnWallClockToIso(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): string | undefined {
  return vnWallClockToDate(year, month, day, hour, minute, second)?.toISOString();
}

/**
 * Parse a datetime string as Vietnam local time into a UTC Date.
 * - Strings that already carry an explicit timezone (trailing Z or +/-HH:mm)
 *   are trusted as-is.
 * - Naive "yyyy-MM-dd[THH:mm[:ss]]" strings are anchored to +07:00.
 * Returns undefined when the string cannot be parsed.
 */
export function parseVnDateTime(raw: string | null | undefined): Date | undefined {
  if (raw == null) return undefined;
  let s = String(raw).trim();
  if (!s) return undefined;

  // Phục hồi offset bị hỏng: dấu "+" trong query string đôi khi bị decode thành
  // dấu cách (x-www-form-urlencoded), biến "...T00:00:00+07:00" thành
  // "...T00:00:00 07:00". Đổi lại thành "+" trước khi parse.
  s = s.replace(/(\d{2}:\d{2}(?::\d{2})?)\s+(\d{2}:?\d{2})$/, '$1+$2');

  // Already carries an explicit timezone -> trust it.
  if (/(?:z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const direct = new Date(s);
    return Number.isNaN(direct.getTime()) ? undefined : direct;
  }

  // yyyy-MM-dd[ or T]HH:mm[:ss] (naive) -> Vietnam local time
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (m) {
    const [, yyyy, mm, dd, hh = '0', mi = '0', ss = '0'] = m;
    return vnWallClockToDate(+yyyy, +mm, +dd, +hh, +mi, +ss);
  }

  // Last resort: native parse.
  const direct = new Date(s);
  return Number.isNaN(direct.getTime()) ? undefined : direct;
}
