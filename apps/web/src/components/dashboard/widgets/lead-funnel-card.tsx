'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { ChartTooltip } from './chart-tooltip';
import {
  type FunnelItem, FUNNEL_COLORS, FUNNEL_LABELS, fmtNum,
} from '../constants';

interface LeadFunnelCardProps {
  funnel: FunnelItem[];
  loading: boolean;
}

/** Funnel donut chart - phân bổ leads theo trạng thái. */
export function LeadFunnelCard({ funnel, loading }: LeadFunnelCardProps) {
  const active = funnel.filter(f => f.count > 0);
  const total = active.reduce((s, f) => s + f.count, 0);

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-[0_4px_20px_-2px_rgba(14,165,233,0.08)]">
      <h3 className="mb-4 text-sm font-bold text-slate-900">Phân bổ leads theo trạng thái</h3>
      {active.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-400">
          {loading ? 'Đang tải...' : 'Chưa có dữ liệu'}
        </p>
      ) : (
        <div className="flex items-center gap-6">
          <div className="relative shrink-0">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie
                  data={active}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  outerRadius={72}
                  innerRadius={45}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {active.map(f => (
                    <Cell key={f.status} fill={FUNNEL_COLORS[f.status] || '#9ca3af'} />
                  ))}
                </Pie>
                <Tooltip content={
                  <ChartTooltip valueFormatter={(v: number) =>
                    `${fmtNum(v)} (${total ? Math.round(v / total * 100) : 0}%)`
                  } />
                } />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-slate-900">{fmtNum(total)}</span>
              <span className="text-[10px] text-slate-400">Tổng leads</span>
            </div>
          </div>
          <div className="flex-1 space-y-2">
            {active.map(f => {
              const pct = total ? Math.round(f.count / total * 100) : 0;
              return (
                <div key={f.status} className="flex items-center gap-2.5 text-sm">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: FUNNEL_COLORS[f.status] }}
                  />
                  <span className="flex-1 text-slate-600">{FUNNEL_LABELS[f.status] || f.status}</span>
                  <span className="font-semibold tabular-nums text-slate-900">{fmtNum(f.count)}</span>
                  <span className="w-8 text-right text-xs tabular-nums text-slate-400">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
