'use client';

import { Crown, User, Users } from 'lucide-react';
import { TrendBadge } from './trend-badge';
import { fmtVNDShort, fmtPct, type DeptComparisonItem } from '../constants';

interface DeptComparisonCardProps {
  dept: DeptComparisonItem;
  isWinner: boolean;
}

export function DeptComparisonCard({ dept, isWinner }: DeptComparisonCardProps) {
  const wrapperCls = isWinner
    ? 'relative overflow-hidden rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-5 shadow-sm'
    : 'relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md';

  return (
    <div className={wrapperCls}>
      {isWinner && (
        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">
          <Crown className="h-3 w-3" />
          Dẫn đầu
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-slate-900">{dept.name}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
            <Users className="h-3 w-3" />
            {dept.memberCount} thành viên
          </p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs uppercase tracking-wide text-slate-400">Doanh thu</p>
        <div className="mt-1 flex items-end gap-2">
          <span className="text-2xl font-bold tabular-nums text-slate-900">{fmtVNDShort(dept.revenue)}</span>
          <TrendBadge trendPct={dept.trendPctVsPrev} size="sm" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Leads</p>
          <p className="text-sm font-semibold tabular-nums text-slate-700">{dept.leads}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Đơn</p>
          <p className="text-sm font-semibold tabular-nums text-slate-700">{dept.orders}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Conv</p>
          <p className="text-sm font-semibold tabular-nums text-emerald-600">{fmtPct(dept.convRate, 1)}</p>
        </div>
      </div>

      {dept.topSale && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
            <User className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-slate-700" title={dept.topSale.name}>
              {dept.topSale.name}
            </p>
            <p className="text-[10px] text-slate-500">Top sale</p>
          </div>
          <span className="shrink-0 text-xs font-bold tabular-nums text-teal-600">
            {fmtVNDShort(dept.topSale.revenue)}
          </span>
        </div>
      )}
    </div>
  );
}
