/** Format ISO date string as DD/MM/YYYY HH:mm:ss in Asia/Saigon. */
export function formatDateTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('vi-VN', { timeZone: 'Asia/Saigon', hour12: false });
}

/** Render a millisecond duration as human-readable Vietnamese string. */
export function formatDuration(ms: number | null): string {
  if (ms == null) return '- (đang chạy)';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`;
  const totalSec = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}m ${seconds}s`;
}
