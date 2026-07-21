/**
 * Response shape cho KPI targets endpoint.
 * Tất cả số được serialize dạng string (BigInt convention dự án) - FE parse Number.
 * NULL giữ nguyên null (không default 0) để UI phân biệt "chưa set" vs "set = 0".
 */
export interface KpiTargetsResponse {
  userId: string;
  year: number;
  targetYearly: string | null;
  targetJan: string | null;
  targetFeb: string | null;
  targetMar: string | null;
  targetApr: string | null;
  targetMay: string | null;
  targetJun: string | null;
  targetJul: string | null;
  targetAug: string | null;
  targetSep: string | null;
  targetOct: string | null;
  targetNov: string | null;
  targetDec: string | null;
  updatedAt: string;
}

/**
 * Actual revenue cho 1 user / 1 năm. Group by month theo timezone Asia/Ho_Chi_Minh.
 * monthly: object {1: amount, 2: amount, ..., 12: amount}. Tháng chưa có doanh thu = 0.
 * yearly: tổng cả năm.
 */
export interface KpiActualResponse {
  userId: string;
  year: number;
  yearly: number;
  monthly: Record<number, number>;
}

/** Item dùng cho danh sách năm đã set KPI. */
export interface KpiTargetsYearItem {
  year: number;
  targetYearly: string | null;
}
