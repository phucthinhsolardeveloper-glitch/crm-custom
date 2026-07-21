/**
 * Helper tính % achievement cho KPI doanh số.
 *
 * Edge cases cần xử lý:
 * 1. target === null → "chưa set", không tính được % → return null
 * 2. target === 0 → chia cho 0 → return null (NaN/Infinity gây vỡ UI)
 * 3. actual === 0 và target > 0 → return 0 (0%)
 * 4. actual > target → return % > 100 (vd 142%) - không cap
 * 5. target nhỏ + actual lớn → vẫn return số thực, không cap
 *
 * Caller (UI) tự quyết hiển thị "—" khi null, hiển thị progress bar capped 100%
 * nhưng số % thật.
 */

export interface AchievementResult {
  /** % đạt được. null khi không tính được (target null/0). */
  percent: number | null;
  /** Capped 0-100 cho progress bar visual. null khi percent null. */
  percentCapped: number | null;
  /** Trạng thái để UI quyết style: "not-set" | "zero" | "below" | "on-track" | "exceeded" */
  status: 'not-set' | 'zero' | 'below' | 'on-track' | 'exceeded';
}

/**
 * Tính % achievement với xử lý edge cases nói trên.
 *
 * status rules (gợi ý - có thể tinh chỉnh):
 *  - target null → 'not-set'
 *  - target = 0 → 'zero'
 *  - 0 <= percent < 80 → 'below'
 *  - 80 <= percent < 100 → 'on-track'
 *  - percent >= 100 → 'exceeded'
 */
export function computeAchievement(actual: number, target: number | null): AchievementResult {
  if (target === null) {
    return { percent: null, percentCapped: null, status: 'not-set' };
  }
  if (target === 0) {
    return { percent: null, percentCapped: null, status: 'zero' };
  }
  // Integer cho doanh số - 1% là 100M+, đủ chi tiết.
  const percent = Math.round((actual / target) * 100);
  const percentCapped = Math.min(100, Math.max(0, percent));

  let status: AchievementResult['status'];
  if (percent >= 100) status = 'exceeded';
  else if (percent >= 80) status = 'on-track';
  else status = 'below';

  return { percent, percentCapped, status };
}

/** Tên tháng tiếng Việt cho UI bảng / chart. */
export const MONTH_NAMES_VN = [
  'T1', 'T2', 'T3', 'T4', 'T5', 'T6',
  'T7', 'T8', 'T9', 'T10', 'T11', 'T12',
];

/** Convert string Decimal từ API → number | null. Centralize parsing dùng chung. */
export function parseTargetString(s: string | null | undefined): number | null {
  if (s === null || s === undefined) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
