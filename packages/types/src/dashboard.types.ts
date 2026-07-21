/**
 * Shared dashboard types between API and Web apps.
 * Note: All BigInt IDs are serialized as string via BigIntSerializerInterceptor.
 */

import type { BigIntString } from './index';

// ── Top N + Khác pattern (Cash Flow Decomposition) ──────────────────────────

/** Mỗi item trong response Top N + Khác. id=null khi là row "Khác" hoặc "Không rõ". */
export interface TopNItem {
  id: string | null;
  name: string;
  revenue: number;
  orderCount?: number;
  /** Tỉ lệ % so với tổng, 0-100, rounded 1 chữ số sau dấu phẩy. */
  pct: number;
}

/**
 * Contract chung cho mọi endpoint by-X (payment-type, format, group, bank, installment, tier).
 * BE đã collapse rows ngoài Top N vào item "Khác" trong items[], thêm metadata trong other.
 * FE không tự cắt - chỉ render items[] và optionally click "Khác" để drill-down.
 */
export interface TopNResponse {
  items: TopNItem[];
  /** null khi totalGroups <= topN (không có "Khác"). */
  other: {
    count: number;
    revenue: number;
    pct: number;
  } | null;
  total: number;
  totalGroups: number;
}

// ── Employee scores (Báo cáo tổng) ──────────────────────────────────────────

export interface EmployeeScoreRaw {
  userId: BigIntString;
  name: string;
  deptName: string;
  deptId: BigIntString | null;
  leadsAssigned: number;
  leadsConverted: number;
  revenue: number;
  overdueTasks: number;
  agingLeads7d: number;
  tasksTotal: number;
  tasksCompleted: number;
  /** Số đơn user tạo trong kỳ (deleted_at IS NULL) */
  ordersCount: number;
  /** Số sản phẩm (count orders có product_id IS NOT NULL) */
  productsCount: number;
  /** Lead assigned cho user nhưng chưa có activity nào (note/call/order) */
  untouchedLeads: number;
  /** Lượt tương tác: COUNT DISTINCT (lead, ngày VN) khi user note hoặc đổi nhãn trong kỳ */
  interactions: number;
}

// ── Call report (Báo cáo cuộc gọi) ──────────────────────────────────────────

export interface EmployeeCallReportRow {
  userId: BigIntString;
  name: string;
  deptName: string;
  /** OUTGOING + INCOMING với duration > 0 */
  callsAnswered: number;
  /** Tổng OUTGOING (kể cả không nghe máy) */
  callsOutgoing: number;
  /** SUM(duration) where call_type = OUTGOING (giây) */
  outgoingTotalSeconds: number;
  /** AVG(duration) where call_type = OUTGOING AND duration > 0 (giây) */
  outgoingAvgSeconds: number;
}

// ── Sales breakdown (Bán hàng - dynamic columns) ────────────────────────────

export interface TopLabel {
  id: BigIntString;
  name: string;
  color: string;
  textColor: string;
}

export interface SalesBreakdownRow {
  userId: BigIntString;
  name: string;
  deptName: string;
  /** Map labelId → count, chỉ chứa top 7 label */
  labelCounts: Record<string, number>;
  /** Tổng customer có label ngoài top 7 (chỉ thuộc về user này) */
  otherCount: number;
  /** Lead user đang giữ chưa có outgoing call duration > 0 */
  untouchedCount: number;
}

export interface EmployeeSalesBreakdownResponse {
  topLabels: TopLabel[];
  rows: SalesBreakdownRow[];
}

// ── Drill-down customers (side-panel) ───────────────────────────────────────

export interface DrillDownCustomerLabel {
  id: BigIntString;
  name: string;
  color: string;
}

export interface DrillDownCustomerItem {
  id: BigIntString;
  name: string;
  phone: string;
  labels: DrillDownCustomerLabel[];
  lastActivityAt: string | null;
  ordersCount: number;
  totalRevenue: number;
}

export interface DrillDownCustomersResponse {
  data: DrillDownCustomerItem[];
  cursor: string | null;
  total: number;
}

// ── Daily revenue by product group (H1 stacked-bar) ─────────────────────────

/** 1 group có series daily revenue. */
export interface DailyByGroupSeries {
  name: string;
  /** Hex color suggest cho FE. BE map theo group name; FE override được. */
  color: string;
  /** Doanh thu mỗi ngày, length = days.length. */
  daily: number[];
}

/**
 * Response cho `/dashboard/revenue/daily-by-group`.
 * Pivot dạng wide: 1 mảng `days` (ISO date string YYYY-MM-DD VN tz) + N series group.
 * Đã gap-fill (mọi ngày trong [from, to]), TopN=5 group + "Khác".
 */
export interface DailyByGroupResponse {
  days: string[];
  groups: DailyByGroupSeries[];
  /** Doanh thu tổng kỳ (sum của mọi group, mọi ngày). */
  total: number;
}

// ── Sankey: source → format → tier flow ─────────────────────────────────────

export type SankeyLevel = 'source' | 'format' | 'tier';

export interface SankeyNode {
  /** Display name. */
  name: string;
  level: SankeyLevel;
  /** Doanh thu node (sum của các link incoming hoặc outgoing). */
  value: number;
}

export interface SankeyLink {
  /** Index trong nodes[]. */
  source: number;
  target: number;
  value: number;
}

/**
 * Response cho `/dashboard/revenue/sankey-source-format-tier`.
 * Format chuẩn cho Recharts <Sankey>: nodes[] + links[] (index-based).
 * Top-N: top 4 source + "Khác", top 5 tier (Recharts không hạn chế số node, nhưng quá nhiều rối).
 */
export interface SankeyRevenueResponse {
  nodes: SankeyNode[];
  links: SankeyLink[];
  total: number;
  /** Auto-derived insight để render banner. */
  insight: {
    topSourceName: string;
    topSourcePct: number;
    topTierName: string;
    topTierPct: number;
  } | null;
}
