'use client';

import { type PerformerItem, fmtVNDShort } from '../constants';

interface TopPerformersCardProps {
  performers: PerformerItem[];
  loading: boolean;
}

/** Top 5 nhân viên doanh thu - rank badge + progress bar. WF1 lines 355-365. */
export function TopPerformersCard({ performers, loading }: TopPerformersCardProps) {
  const top = performers.slice(0, 5);
  const maxRevenue = top.length > 0 ? Math.max(...top.map(p => p.revenue), 1) : 1;

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-[0_4px_20px_-2px_rgba(14,165,233,0.08)]">
      <h3 className="mb-4 text-sm font-bold text-slate-900">Top 5 nhân viên - Doanh số</h3>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      ) : top.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">Chưa có doanh thu trong kỳ</p>
      ) : (
        <div className="space-y-3">
          {top.map((p, idx) => {
            const rank = idx + 1;
            const isFirst = rank === 1;
            const pct = (p.revenue / maxRevenue) * 100;
            return (
              <div key={p.userId} className="flex items-center gap-3">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                    isFirst ? 'text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                  style={isFirst ? { background: 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)' } : undefined}
                >
                  {rank}
                </span>
                <span className="flex-1 truncate text-sm font-medium text-slate-700">{p.name}</span>
                <div className="h-2 flex-1 rounded bg-slate-100">
                  <div
                    className="h-full rounded transition-[width] duration-300"
                    style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)', width: `${pct}%` }}
                  />
                </div>
                <span className="w-16 text-right text-sm font-bold tabular-nums">{fmtVNDShort(p.revenue)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
