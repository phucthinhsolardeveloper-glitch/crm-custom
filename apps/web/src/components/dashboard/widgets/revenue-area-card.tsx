'use client';

import {
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Area, AreaChart,
} from 'recharts';
import { ChartTooltip } from './chart-tooltip';
import {
  type RevenueDayItem, COLORS, fmtVND, fmtShort,
} from '../constants';

interface RevenueAreaCardProps {
  revenue: RevenueDayItem[];
  loading: boolean;
}

/** Revenue area chart - full-width card theo WF1. Height 220px, gradient sky fill. */
export function RevenueAreaCard({ revenue, loading }: RevenueAreaCardProps) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-[0_4px_20px_-2px_rgba(14,165,233,0.08)]">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Doanh thu theo ngày</h3>
          <p className="text-xs text-slate-500">Theo kỳ đã chọn</p>
        </div>
      </div>

      {revenue.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-400">
          {loading ? 'Đang tải...' : 'Chưa có dữ liệu trong kỳ'}
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={revenue}>
            <defs>
              <linearGradient id="revenueGradFull" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.primary} stopOpacity={0.35} />
                <stop offset="100%" stopColor={COLORS.primary} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={fmtShort}
            />
            <Tooltip content={<ChartTooltip valueFormatter={fmtVND} />} />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke={COLORS.primary}
              strokeWidth={2.5}
              fill="url(#revenueGradFull)"
              name="Doanh thu"
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, fill: '#fff' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
