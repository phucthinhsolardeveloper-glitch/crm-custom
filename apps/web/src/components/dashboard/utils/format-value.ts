// Format helpers cho BarCellTable cells. KISS: only what we need.

export type ValueFormat = 'number' | 'currency' | 'percent' | 'duration';

const numberFormatter = new Intl.NumberFormat('vi-VN');

export function fmtNumber(n: number): string {
  if (n == null || Number.isNaN(n)) return '0';
  return numberFormatter.format(n);
}

/** Currency VN (1.234.000) - không symbol, để label cột chứa "₫" */
export function fmtCurrency(n: number): string {
  if (n == null || Number.isNaN(n)) return '0';
  return numberFormatter.format(Math.round(n));
}

export function fmtPercent(n: number): string {
  if (n == null || Number.isNaN(n)) return '0%';
  // n là 0-100 hoặc 0-1? Convention: nhập số như UI muốn hiển thị (0-100)
  return `${n.toFixed(1)}%`;
}

/** Duration giây → "mm:ss" hoặc "h Hh Mm" nếu > 1 giờ */
export function fmtDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatValue(value: number, format: ValueFormat = 'number'): string {
  switch (format) {
    case 'currency': return fmtCurrency(value);
    case 'percent': return fmtPercent(value);
    case 'duration': return fmtDuration(value);
    default: return fmtNumber(value);
  }
}
