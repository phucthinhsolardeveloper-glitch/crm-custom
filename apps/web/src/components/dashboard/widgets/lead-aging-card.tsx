'use client';

import { type AgingItem, COLORS, fmtNum } from '../constants';

interface LeadAgingCardProps {
  aging: AgingItem[];
  loading: boolean;
}

/** Map bucket name (BE trả tiếng Việt có dấu) -> color + flag pulse. */
const BUCKET_META: Record<string, { color: string; bg: string; isWarning: boolean; isDanger: boolean }> = {
  '0-1 ngày': { color: COLORS.success, bg: '#d1fae5', isWarning: false, isDanger: false },
  '1-3 ngày': { color: COLORS.success, bg: '#d1fae5', isWarning: false, isDanger: false },
  '3-7 ngày': { color: COLORS.warning, bg: '#fef3c7', isWarning: true, isDanger: false },
  '7+ ngày': { color: COLORS.danger, bg: '#fee2e2', isWarning: false, isDanger: true },
};

const BUCKET_ORDER = ['0-1 ngày', '1-3 ngày', '3-7 ngày', '7+ ngày'];

/** Lead aging - 4 buckets vertical với progress bar. WF1 lines 245-266. */
export function LeadAgingCard({ aging, loading }: LeadAgingCardProps) {
  // Sort theo thứ tự cố định, fallback 0 nếu BE chưa trả bucket nào đó
  const map = new Map(aging.map(a => [a.bucket, a.count]));
  const items = BUCKET_ORDER.map(b => ({ bucket: b, count: map.get(b) || 0 }));
  const maxCount = Math.max(...items.map(i => i.count), 1);

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-[0_4px_20px_-2px_rgba(14,165,233,0.08)]">
      <h3 className="text-sm font-bold text-slate-900">Lead aging - cảnh báo bỏ quên</h3>
      <p className="mb-4 text-xs text-slate-500">Số ngày kể từ tương tác cuối</p>

      {loading ? (
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {items.map(({ bucket, count }) => {
            const meta = BUCKET_META[bucket] || BUCKET_META['0-1 ngày']!;
            const pct = Math.max((count / maxCount) * 100, 4);
            return (
              <div key={bucket} className="text-center">
                <span className="text-3xl font-bold tabular-nums" style={{ color: meta.color }}>
                  {fmtNum(count)}
                </span>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: meta.bg }}>
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{ backgroundColor: meta.color, width: `${pct}%` }}
                  />
                </div>
                <span className="mt-1 flex items-center justify-center gap-1 text-xs text-slate-500">
                  {meta.isDanger && <span className="aging-pulse-dot" />}
                  {bucket}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        :global(.aging-pulse-dot) {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 9999px;
          background: ${COLORS.danger};
          animation: pulse 1.5s ease infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
