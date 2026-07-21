// ── Dashboard design tokens & format helpers ────────────────────────────

import { applyDatePreset, localToUTC, type DatePresetKey } from '@/lib/datetime-utc7';

// Color tokens aligned with design-guidelines.md
export const COLORS = {
  primary: '#0ea5e9',
  primaryLight: '#e0e7ff',
  success: '#10b981',
  successLight: '#d1fae5',
  warning: '#f59e0b',
  warningLight: '#fef3c7',
  danger: '#ef4444',
  dangerLight: '#fee2e2',
  purple: '#8b5cf6',
  purpleLight: '#ede9fe',
  indigo: '#6366f1',
  indigoLight: '#e0e7ff',
  teal: '#14b8a6',
  tealLight: '#ccfbf1',
  orange: '#f97316',
  cyan: '#06b6d4',
} as const;

export const FUNNEL_COLORS: Record<string, string> = {
  POOL: COLORS.primary,
  ZOOM: COLORS.orange,
  ASSIGNED: COLORS.teal,
  IN_PROGRESS: COLORS.warning,
  CONVERTED: COLORS.success,
  LOST: COLORS.danger,
  FLOATING: COLORS.purple,
};

export const FUNNEL_LABELS: Record<string, string> = {
  POOL: 'Kho',
  ZOOM: 'Zoom',
  ASSIGNED: 'Đã gán',
  IN_PROGRESS: 'Đang xử lý',
  CONVERTED: 'Chuyển đổi',
  LOST: 'Mất',
  FLOATING: 'Thả nổi',
};

// ── Time range (datetime UTC+7, giờ + phút) ─────────────────────────────
/**
 * Range filter cho dashboard.
 * - `from`/`to`: local UTC+7 string yyyy-MM-ddTHH:mm (cùng format với DateTimeRangePicker).
 * - `preset`: dùng để biết khi nào ẩn KPI delta (custom -> không so sánh kỳ trước được).
 */
export interface DashboardRange {
  from: string;
  to: string;
  preset: DatePresetKey;
}

export const DEFAULT_RANGE_PRESET: DatePresetKey = 'thisMonth';

/** Default range = preset "Tháng này" UTC+7. */
export function getDefaultRange(): DashboardRange {
  const r = applyDatePreset(DEFAULT_RANGE_PRESET);
  // applyDatePreset chỉ trả null khi key='custom' - không xảy ra ở đây.
  return { from: r!.from, to: r!.to, preset: DEFAULT_RANGE_PRESET };
}

/** Convert local UTC+7 range -> ISO UTC để gửi BE qua query string. */
export function rangeToApiQuery(range: DashboardRange): { from: string; to: string } {
  return { from: localToUTC(range.from), to: localToUTC(range.to) };
}

/**
 * Map 1 preset -> preset đại diện kỳ TRƯỚC (để compute KPI delta).
 * Trả về `null` nếu không có ánh xạ tự nhiên (vd 'custom' - user đã chốt tắt delta).
 *
 * VD: 'today' -> 'yesterday', 'thisMonth' -> 'lastMonth', '7d' -> tự nhiên không có preset
 * tương đương -> trả null hay map sang 7d trước đó (cần định nghĩa rõ).
 */
export function getPreviousPresetKey(preset: DatePresetKey): DatePresetKey | null {
  // Chỉ ánh xạ khi có baseline kỳ trước tự nhiên (cùng độ dài, lùi đúng 1 chu kỳ).
  // 7d/30d/yesterday/lastMonth không có preset tương đương cho kỳ trước -> tắt delta.
  const MAP: Partial<Record<DatePresetKey, DatePresetKey>> = {
    today: 'yesterday',
    thisMonth: 'lastMonth',
  };
  return MAP[preset] ?? null;
}

/**
 * Compute previous-period range để fetch prevStats cho KPI delta.
 * Chỉ trả range hợp lệ khi preset có ánh xạ "kỳ trước" rõ ràng (xem getPreviousPresetKey).
 * Trả null -> caller skip fetch prevStats, KPI cards ẩn delta.
 */
export function getPreviousPeriodRange(range: DashboardRange): DashboardRange | null {
  const prevKey = getPreviousPresetKey(range.preset);
  if (!prevKey) return null;
  const r = applyDatePreset(prevKey);
  if (!r) return null;
  return { from: r.from, to: r.to, preset: prevKey };
}

// ── Format helpers ──────────────────────────────────────────────────────
export function fmtVND(v: number) {
  return new Intl.NumberFormat('vi-VN').format(v) + ' ₫';
}

export function fmtNum(v: number | null | undefined) {
  return v != null ? new Intl.NumberFormat('vi-VN').format(v) : '--';
}

export function fmtShort(v: number) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
}

/** VND ngắn gọn cho KPI card. Ví dụ: 245800000 -> "245.8M ₫", 5850000 -> "5.85M ₫" */
export function fmtVNDShort(v: number | null | undefined): string {
  if (v == null) return '--';
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B ₫`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 10e6 ? 1 : 2)}M ₫`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K ₫`;
  return `${v} ₫`;
}

/** Percent format. fmtPct(23.1) -> "23.1%" */
export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return '--';
  return `${v.toFixed(digits)}%`;
}

/** Chia an toàn, tránh chia 0. */
export function safeDiv(num: number | null | undefined, den: number | null | undefined): number | null {
  if (num == null || den == null || den === 0) return null;
  return num / den;
}

export function fmtDay(d: string) {
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

/** Format yyyy-MM-ddTHH:mm UTC+7 -> "DD/MM/YYYY HH:mm" để hiển thị chip range. */
export function fmtRangeLabel(s: string): string {
  if (!s) return '';
  const [d, t = '00:00'] = s.split('T');
  const [y, mo, day] = d.split('-');
  if (!y || !mo || !day) return '';
  return `${day}/${mo}/${y} ${t}`;
}

// ── Shared data types ───────────────────────────────────────────────────
export interface DashboardStatsData {
  newLeads?: number | null;
  inProgress?: number | null;
  converted?: number | null;
  revenue: number;
  newCustomers?: number | null;
  totalOrders?: number | null;
  pendingPayments?: number | null;
  overdueTask?: number | null;
}

export interface FunnelItem { status: string; count: number }
export interface RevenueDayItem { day: string; revenue: number }
export interface AgingItem { bucket: string; count: number }
export interface PerformerItem { userId: string; name: string; converted: number; revenue: number }
export interface SourceItem { source: string; total: number; converted: number; rate: number }
export interface ConvTrendItem { day: string; newLeads: number; converted: number }
export interface DeptItem { deptId: string; name: string; leads: number; converted: number; revenue: number }
export interface TeamItem { teamId: string; name: string; dept: string; members: number; leads: number; converted: number; revenue: number }

// ── Revenue dashboard (no-quota) types ──────────────────────────────────
/** 1 KPI metric với trend vs kỳ trước. trendPct=null khi previous=0. */
export interface KpiMetric {
  current: number;
  previous: number;
  trendPct: number | null;
}

/** Overview 3 KPI + spark 7 điểm cuối. */
export interface KpiOverview {
  totalRevenue: KpiMetric;
  totalOrders: KpiMetric;
  convRate: KpiMetric;
  spark: {
    revenue: number[];
    orders: number[];
    convRate: number[];
  };
}

export interface ProductSlice {
  productId: string | null;
  name: string;
  revenue: number;
  pct: number;
}

export interface DeptComparisonItem {
  deptId: string;
  name: string;
  memberCount: number;
  revenue: number;
  trendPctVsPrev: number | null;
  leads: number;
  orders: number;
  convRate: number;
  topSale: { userId: string; name: string; revenue: number } | null;
}

export interface PodiumItem {
  rank: number;
  userId: string;
  name: string;
  deptName: string;
  revenue: number;
  ordersCount: number;
  trendPctVsPrev: number | null;
}

export interface LeaderboardItem {
  rank: number;
  userId: string;
  name: string;
  deptName: string;
  revenue: number;
  ordersCount: number;
  trendPctVsPrev: number | null;
  kpiTarget: number | null; // target KPI tháng hiện tại (null = chưa set)
  kpiActual: number; // doanh thu VERIFIED tháng hiện tại
  kpiPct: number | null; // % hoàn thành (null khi chưa set target)
}

// ── Analytics blocks types (Nguồn lead / Sản phẩm / Thanh toán / Hạng khách / mở rộng) ──
/** 1 dòng bảng "Nguồn lead" - GET /dashboard/source-quality */
export interface SourceQualityItem {
  sourceId: string | null;
  source: string;
  leads: number;
  returningPct: number;
  converted: number;
  cvRate: number;
  revenue: number;
  orderCount: number;
  revenuePerOrder: number;
}

/** GET /dashboard/tier-distribution (toàn thời gian, không theo range) */
export interface TierDistributionItem {
  tierId: string | null;
  name: string;
  color: string | null;
  emoji: string | null;
  iconKey: string | null;
  customerCount: number;
  totalSpend: number;
  avgSpend: number;
}

/** GET /dashboard/tier-movement - dịch chuyển hạng trong kỳ */
export interface TierMovementData {
  total: number;
  items: { fromTierId: string | null; from: string; toTierId: string | null; to: string; count: number }[];
}

/** GET /dashboard/conversion-by-hour - CV% theo khung giờ tạo lead */
export interface ConversionByHourItem {
  bucket: string;
  leads: number;
  converted: number;
  cvRate: number;
}

/** GET /dashboard/receivables - công nợ (tiền còn thiếu) + đã xác minh vs chờ duyệt */
export interface ReceivablesData {
  debtAmount: number;
  debtOrderCount: number;
  verifiedAmount: number;
  pendingAmount: number;
}

export interface NewVsReturningData {
  newLeads: {
    total: number;
    fromNew: number;
    fromReturning: number;
  };
  converts: {
    total: number;
    fromNew: number;
    fromReturning: number;
    cvRateFromNew: number;
    cvRateFromReturning: number;
  };
  revenue: {
    total: number;
    fromNew: number;
    fromReturning: number;
  };
  customers: {
    total: number;
    fromNew: number;
    fromReturning: number;
  };
}
