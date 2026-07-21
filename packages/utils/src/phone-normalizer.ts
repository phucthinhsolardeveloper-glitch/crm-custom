/**
 * Normalize Vietnamese phone numbers.
 * Strips +84 prefix, spaces, dashes, dots.
 * Ensures 10-11 digit VN format starting with 0.
 *
 * Recovers the leading '0' when Excel / Google Sheets has stripped it by
 * treating the phone as a numeric value (very common when users paste a
 * column of phones into Excel and save back to CSV).
 */
export function normalizePhone(input: string): string {
  let phone = input.trim().replace(/[\s\-\.()]/g, '');

  // Convert +84 to 0
  if (phone.startsWith('+84')) {
    phone = '0' + phone.slice(3);
  }
  // Convert 84 prefix (without +) to 0
  if (phone.startsWith('84') && phone.length >= 11) {
    phone = '0' + phone.slice(2);
  }

  // Restore missing leading '0' when input is exactly 9 digits and starts
  // with a valid VN mobile prefix (3, 5, 7, 8, 9). Skips other 9-digit
  // strings (e.g. landline-without-area-code, foreign numbers) to avoid
  // false positives.
  if (/^[35789]\d{8}$/.test(phone)) {
    phone = '0' + phone;
  }

  return phone;
}

/**
 * Validate phone number (relaxed rule, supports VN + international + service lines).
 * Accept 8-14 digits, with an optional leading '+'.
 * Examples accepted:
 *   - "0981234567"     (VN mobile, 10 digits)
 *   - "0987 12345678"  (after normalize: 11+ digits, still ok)
 *   - "1900xxxx"       (VN service hotline, 8 digits)
 *   - "+1234567890"    (international, normalize keeps '+' for non +84)
 *   - "+84981234567"   (normalize -> "0981234567")
 */
export function isValidVNPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  return /^\+?\d{8,14}$/.test(normalized);
}

/**
 * Format phone for display: 0xx xxx xxxx
 */
export function formatPhoneDisplay(phone: string): string {
  const normalized = normalizePhone(phone);
  if (normalized.length === 10) {
    return `${normalized.slice(0, 3)} ${normalized.slice(3, 6)} ${normalized.slice(6)}`;
  }
  if (normalized.length === 11) {
    return `${normalized.slice(0, 4)} ${normalized.slice(4, 7)} ${normalized.slice(7)}`;
  }
  return normalized;
}
