'use client';

import {
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, Area, AreaChart, Legend,
} from 'recharts';
import { ChartCard } from '../widgets/chart-card';
import { ChartTooltip } from '../widgets/chart-tooltip';
import {
  COLORS, FUNNEL_COLORS, FUNNEL_LABELS, fmtNum,
} from '../constants';
import type { CustomersTabData } from '../hooks/use-tab-data';

interface TabCustomersProps {
  data: CustomersTabData | null;
  loading: boolean;
  isAdmin: boolean;
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="h-[280px] animate-pulse rounded-xl bg-slate-100" />
      ))}
    </div>
  );
}

export function TabCustomers({ data, loading, isAdmin }: TabCustomersProps) {
  if (loading || !data) return <LoadingSkeleton />;

  const activeFunnel = data.funnel.filter(f => f.count > 0);
  const totalFunnel = activeFunnel.reduce((s, f) => s + f.count, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Full-size Lead Funnel */}
        <ChartCard title="Chi tiết phân bổ leads">
          {activeFunnel.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">Chưa có dữ liệu</p>
          ) : (
            <div className="flex items-center gap-6">
              <div className="relative shrink-0">
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie
                      data={activeFunnel} dataKey="count" nameKey="status"
                      cx="50%" cy="50%" outerRadius={80} innerRadius={50}
                      paddingAngle={2} strokeWidth={0}
                    >
                      {activeFunnel.map(f => (
                        <Cell key={f.status} fill={FUNNEL_COLORS[f.status] || '#9ca3af'} />
                      ))}
                    </Pie>
                    <Tooltip content={
                      <ChartTooltip valueFormatter={(v: number) =>
                        `${fmtNum(v)} (${totalFunnel ? Math.round(v / totalFunnel * 100) : 0}%)`
                      } />
                    } />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold text-slate-900">{fmtNum(totalFunnel)}</span>
                  <span className="text-[10px] text-slate-400">Tổng</span>
                </div>
              </div>
              <div className="flex-1 space-y-2">
                {activeFunnel.map(f => {
                  const pct = totalFunnel ? Math.round(f.count / totalFunnel * 100) : 0;
                  return (
                    <div key={f.status} className="flex items-center gap-2.5 text-sm">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: FUNNEL_COLORS[f.status] }} />
                      <span className="flex-1 text-slate-600">{FUNNEL_LABELS[f.status] || f.status}</span>
                      <span className="font-semibold text-slate-900 tabular-nums">{fmtNum(f.count)}</span>
                      <span className="text-xs text-slate-400 w-8 text-right tabular-nums">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </ChartCard>

        {/* Lead Aging */}
        <ChartCard title="Lead chưa tương tác - cảnh báo bỏ quên">
          {data.aging.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">Không có lead đang xử lý</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
              {data.aging.map(a => {
                const isDanger = a.bucket.includes('7+');
                const isWarn = a.bucket.includes('3-7');
                const color = isDanger ? COLORS.danger : isWarn ? COLORS.warning : COLORS.success;
                return (
                  <div key={a.bucket} className="text-center">
                    <span className="text-3xl font-bold tabular-nums" style={{ color }}>{a.count}</span>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ backgroundColor: color, width: '100%' }} />
                    </div>
                    <span className="text-xs text-slate-500 mt-1 block">{a.bucket}</span>
                  </div>
                );
              })}
            </div>
          )}
        </ChartCard>
      </div>

      {/* Admin-only: Conversion Trend + Sources */}
      {isAdmin && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.convTrend.length > 0 && (
            <ChartCard title="Xu hướng chuyển đổi - Leads mới vs Convert">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={data.convTrend}>
                  <defs>
                    <linearGradient id="newLeadsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.primary} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={COLORS.primary} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="convertGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.success} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={COLORS.success} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="newLeads" stroke={COLORS.primary} strokeWidth={2} fill="url(#newLeadsGrad)" name="Leads mới" dot={false} />
                  <Area type="monotone" dataKey="converted" stroke={COLORS.success} strokeWidth={2} fill="url(#convertGrad)" name="Đã convert" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {data.sourceData.length > 0 && (
            <ChartCard title="Chất lượng nguồn lead - Tỷ lệ chuyển đổi">
              <div className="space-y-3">
                {data.sourceData.map(s => (
                  <div key={s.source} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{s.source}</span>
                      <span className="text-xs text-slate-500">
                        {s.converted}/{s.total} -{' '}
                        <span className="font-bold" style={{
                          color: s.rate >= 30 ? COLORS.success : s.rate >= 10 ? COLORS.warning : COLORS.danger,
                        }}>{s.rate}%</span>
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{
                        width: `${s.rate}%`,
                        background: s.rate >= 30 ? COLORS.success : s.rate >= 10 ? COLORS.warning : COLORS.danger,
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>
          )}
        </div>
      )}
    </div>
  );
}
