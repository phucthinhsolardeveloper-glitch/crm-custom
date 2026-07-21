/**
 * Helpers chuyển đổi datetime giữa UTC+7 (Asia/Saigon) local và ISO UTC.
 *
 * Tại sao có module này: trang `/leads` filter date có giờ + phút theo giờ VN.
 * Native `<input type="datetime-local">` chỉ trả về chuỗi local naive (không có TZ).
 * Backend lưu UTC -> cần convert qua lại.
 *
 * Quy ước:
 * - "Local string" = chuỗi `<input type="datetime-local">` trả về, vd `2026-05-21T08:30`,
 *   được hiểu là TIME tại UTC+7 (Asia/Saigon).
 * - "UTC ISO" = chuỗi ISO 8601 với suffix Z, vd `2026-05-21T01:30:00.000Z`.
 *
 * Lưu ý: KHÔNG dùng cho timezone khác. Nếu user/server đổi sang timezone khác trong tương lai,
 * cần generalize sang Intl.DateTimeFormat hoặc Temporal API.
 */

const TZ_OFFSET_MIN = 7 * 60; // UTC+7 expressed in minutes

/** Format số 2 chữ số với leading zero. */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Convert `<input type="datetime-local">` value (UTC+7 local) -> ISO UTC string.
 * @example
 *   localToUTC("2026-05-21T08:30") // -> "2026-05-21T01:30:00.000Z"
 *   localToUTC("") // -> "" (no-op)
 */
export function localToUTC(localStr: string): string {
  if (!localStr) return '';
  const [datePart, timePart = '00:00'] = localStr.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  if ([y, m, d, hh, mm].some((v) => Number.isNaN(v))) return '';
  // Date.UTC tạo timestamp theo UTC. Vì input là UTC+7 (sớm hơn UTC 7 tiếng)
  // -> ms tương ứng UTC = Date.UTC(...) - TZ_OFFSET_MIN minutes.
  const utcMs = Date.UTC(y, m - 1, d, hh, mm) - TZ_OFFSET_MIN * 60_000;
  return new Date(utcMs).toISOString();
}

/**
 * Convert ISO UTC string -> `<input type="datetime-local">` value (UTC+7 local).
 * @example
 *   utcToLocal("2026-05-21T01:30:00.000Z") // -> "2026-05-21T08:30"
 */
export function utcToLocal(utcStr: string): string {
  if (!utcStr) return '';
  const date = new Date(utcStr);
  if (Number.isNaN(date.getTime())) return '';
  const localMs = date.getTime() + TZ_OFFSET_MIN * 60_000;
  const d = new Date(localMs);
  // Lấy UTC components của ngày đã cộng offset = chính là local components mong muốn.
  return (
    `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`
  );
}

/** Trả về Date object "ảo" mà UTC components của nó = local UTC+7 thời điểm hiện tại.
 *  Dùng để compute preset (today, yesterday, ...) trên local timeline. */
export function nowAsUtc7(): Date {
  return new Date(Date.now() + TZ_OFFSET_MIN * 60_000);
}

/** Build local string yyyy-MM-ddTHH:mm từ year/month/day/hour/minute (đã ở UTC+7). */
function buildLocalStr(y: number, m: number, d: number, hh = 0, mm = 0): string {
  return `${y}-${pad2(m)}-${pad2(d)}T${pad2(hh)}:${pad2(mm)}`;
}

export type DatePresetKey =
  | 'today'
  | 'yesterday'
  | '7d'
  | '30d'
  | 'thisMonth'
  | 'lastMonth'
  | 'custom';

export interface DatePresetOption {
  key: DatePresetKey;
  label: string;
}

/** Danh sách preset (hiển thị thứ tự dropdown). */
export const DATE_PRESETS: DatePresetOption[] = [
  { key: 'today', label: 'Hôm nay' },
  { key: 'yesterday', label: 'Hôm qua' },
  { key: '7d', label: '7 ngày qua' },
  { key: '30d', label: '30 ngày qua' },
  { key: 'thisMonth', label: 'Tháng này' },
  { key: 'lastMonth', label: 'Tháng trước' },
  { key: 'custom', label: 'Tùy chọn' },
];

/**
 * Compute `from`/`to` (local UTC+7 string) cho 1 preset.
 * Trả về `null` nếu key='custom' (user tự nhập).
 */
export function applyDatePreset(key: DatePresetKey): { from: string; to: string } | null {
  if (key === 'custom') return null;
  const now = nowAsUtc7();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 1-12
  const d = now.getUTCDate();

  switch (key) {
    case 'today':
      return { from: buildLocalStr(y, m, d, 0, 0), to: buildLocalStr(y, m, d, 23, 59) };
    case 'yesterday': {
      const ymd = subDays(y, m, d, 1);
      return { from: buildLocalStr(ymd.y, ymd.m, ymd.d, 0, 0), to: buildLocalStr(ymd.y, ymd.m, ymd.d, 23, 59) };
    }
    case '7d': {
      const ymd = subDays(y, m, d, 7);
      return { from: buildLocalStr(ymd.y, ymd.m, ymd.d, 0, 0), to: buildLocalStr(y, m, d, 23, 59) };
    }
    case '30d': {
      const ymd = subDays(y, m, d, 30);
      return { from: buildLocalStr(ymd.y, ymd.m, ymd.d, 0, 0), to: buildLocalStr(y, m, d, 23, 59) };
    }
    case 'thisMonth': {
      const lastDay = lastDayOfMonth(y, m);
      return { from: buildLocalStr(y, m, 1, 0, 0), to: buildLocalStr(y, m, lastDay, 23, 59) };
    }
    case 'lastMonth': {
      const prevMonth = m === 1 ? 12 : m - 1;
      const prevYear = m === 1 ? y - 1 : y;
      const lastDay = lastDayOfMonth(prevYear, prevMonth);
      return {
        from: buildLocalStr(prevYear, prevMonth, 1, 0, 0),
        to: buildLocalStr(prevYear, prevMonth, lastDay, 23, 59),
      };
    }
  }
}

/** Subtract N days, return new {y,m,d} (1-based month). */
function subDays(y: number, m: number, d: number, days: number): { y: number; m: number; d: number } {
  // Dùng UTC để không bị DST shift trên máy server/client.
  const ms = Date.UTC(y, m - 1, d) - days * 86_400_000;
  const date = new Date(ms);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

/** Day 0 of (month+1) = last day of `month` */
function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
