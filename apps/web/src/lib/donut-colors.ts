/**
 * Palette cho Payment Donut by Product.
 * Đảm bảo contrast trên fill trắng + bold border-white 1px giữa các segment.
 */
export const DONUT_PALETTE = [
  '#0ea5e9', // sky-500 - primary brand
  '#06b6d4', // cyan-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
] as const;

/** Màu cho "Other" segment - dùng slate trung tính để không cạnh tranh visual với top 5. */
export const OTHER_COLOR = '#94a3b8';

/** Gán màu theo index. Item thứ 5+ (Other) dùng OTHER_COLOR. */
export function pickDonutColor(index: number, isOther: boolean = false): string {
  if (isOther) return OTHER_COLOR;
  return DONUT_PALETTE[index] ?? OTHER_COLOR;
}
