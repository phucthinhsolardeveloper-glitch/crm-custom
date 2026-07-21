/**
 * Vivid color palette cho user badges (note popup, activity timeline, ...).
 * 10 cặp bg+text màu tươi, đảm bảo contrast WCAG AA cho readable.
 *
 * Deterministic hash: cùng userId luôn ra cùng màu (UX consistency - user A
 * luôn cùng badge color ở mọi nơi).
 */

export interface UserBadgeColor {
  bg: string;
  text: string;
}

export const VIVID_USER_PALETTE: UserBadgeColor[] = [
  { bg: '#e0f2fe', text: '#0369a1' },  // sky
  { bg: '#cffafe', text: '#0e7490' },  // cyan
  { bg: '#d1fae5', text: '#047857' },  // emerald
  { bg: '#fef3c7', text: '#b45309' },  // amber
  { bg: '#ffe4e6', text: '#be123c' },  // rose
  { bg: '#ede9fe', text: '#6d28d9' },  // violet
  { bg: '#e0e7ff', text: '#4338ca' },  // indigo
  { bg: '#fce7f3', text: '#be185d' },  // pink
  { bg: '#ffedd5', text: '#c2410c' },  // orange
  { bg: '#ecfccb', text: '#4d7c0f' },  // lime
];

/**
 * Hash đơn giản (sum char codes) - đủ phân bố cho 10 màu với 50-200 user.
 * KHÔNG dùng cho security purpose - chỉ visual consistency.
 */
export function getUserBadgeColor(userId: string | bigint | null | undefined): UserBadgeColor {
  if (userId === null || userId === undefined) return VIVID_USER_PALETTE[VIVID_USER_PALETTE.length - 1]; // fallback last
  const s = String(userId);
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % VIVID_USER_PALETTE.length;
  return VIVID_USER_PALETTE[idx];
}
