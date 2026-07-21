'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { ChartCard } from '../widgets/chart-card';
import { COLORS, fmtVNDShort, type ProductSlice } from '../constants';

interface ProductPieChartProps {
  data: ProductSlice[];
  loading: boolean;
}

const PIE_COLORS = [COLORS.primary, COLORS.teal, COLORS.purple, COLORS.warning, COLORS.indigo, COLORS.cyan];

export function ProductPieChart({ data, loading }: ProductPieChartProps) {
  const total = data.reduce((s, r) => s + r.revenue, 0);

  if (loading) {
    return (
      <ChartCard title="Cơ cấu sản phẩm">
        <div className="h-[300px] animate-pulse rounded-xl bg-slate-100" />
      </ChartCard>
    );
  }

  if (data.length === 0 || total === 0) {
    return (
      <ChartCard title="Cơ cấu sản phẩm">
        <p className="py-12 text-center text-sm text-slate-400">Chưa có dữ liệu sản phẩm</p>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Cơ cấu sản phẩm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="relative h-[220px] flex-1">
          {/* height co dinh thay vi "100%": tranh warning width(-1)/height(-1) cua recharts o frame dau tien truoc khi ResizeObserver do duoc container */}
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={data}
                dataKey="revenue"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={2}
                strokeWidth={2}
                stroke="#fff"
              >
                {data.map((_, idx) => (
                  <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v) => fmtVNDShort(typeof v === 'number' ? v : Number(v) || 0)}
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Tổng</p>
            <p className="text-sm font-bold text-slate-800">{fmtVNDShort(total)}</p>
          </div>
        </div>
        <ul className="flex flex-1 flex-col gap-2 text-sm">
          {data.map((slice, idx) => (
            <li key={slice.productId ?? `other-${idx}`} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 truncate text-slate-700">
                <span
                  className="h-3 w-3 shrink-0 rounded-sm"
                  style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }}
                />
                <span className="truncate" title={slice.name}>{slice.name}</span>
              </span>
              <span className="shrink-0 tabular-nums font-semibold text-slate-900">
                {slice.pct.toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ChartCard>
  );
}
