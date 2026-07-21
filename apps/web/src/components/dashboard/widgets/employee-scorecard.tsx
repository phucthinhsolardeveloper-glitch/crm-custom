'use client';

import { fmtVND, fmtNum } from '../constants';
import type { EmployeeScorecard } from '../hooks/use-employee-scores';

function scoreColor(score: number) {
  if (score >= 70) return { bg: '#10b981', label: 'Tốt' };
  if (score >= 40) return { bg: '#f59e0b', label: 'TB' };
  return { bg: '#ef4444', label: 'Yếu' };
}

function scoreCardClass(score: number) {
  if (score < 40) return 'border-red-200 bg-red-50/40';
  if (score < 70) return 'border-amber-100';
  return 'border-slate-100';
}

interface Props {
  employee: EmployeeScorecard;
}

export function EmployeeScorecardCard({ employee: e }: Props) {
  const sc = scoreColor(e.score);
  const initials = e.name.split(' ').slice(-2).map(w => w[0]).join('').toUpperCase();

  return (
    <div className={`rounded-xl border bg-white p-4 shadow-[0_2px_12px_-2px_rgba(14,165,233,0.06)] transition-all hover:shadow-[0_4px_20px_-2px_rgba(14,165,233,0.1)] ${scoreCardClass(e.score)}`}>
      {/* Top row: avatar + name + score */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ backgroundColor: sc.bg }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900 truncate">{e.name}</div>
          <span className="inline-block rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-600">
            {e.deptName}
          </span>
        </div>
        <div className="text-center shrink-0">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-extrabold text-white"
            style={{ backgroundColor: sc.bg }}
          >
            {e.score}
          </div>
          <div className="mt-0.5 text-[9px] font-semibold text-slate-400 uppercase">{sc.label}</div>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-4 gap-2 text-center mb-3">
        <div>
          <div className="text-sm font-bold text-slate-900">{fmtNum(e.leadsAssigned)}</div>
          <div className="text-[10px] text-slate-400">Leads</div>
        </div>
        <div>
          <div className="text-sm font-bold text-slate-900">
            {fmtNum(e.leadsConverted)} <span className="text-[10px] text-slate-400">({e.conversionRate}%)</span>
          </div>
          <div className="text-[10px] text-slate-400">Convert</div>
        </div>
        <div>
          <div className="text-sm font-bold text-slate-900">{fmtVND(e.revenue)}</div>
          <div className="text-[10px] text-slate-400">Doanh thu</div>
        </div>
        <div>
          <div className={`text-sm font-bold ${e.overdueTasks > 0 ? 'text-red-500' : 'text-slate-900'}`}>
            {e.overdueTasks > 0 ? `${e.overdueTasks} ⚠` : '0'}
          </div>
          <div className="text-[10px] text-slate-400">Quá hạn</div>
        </div>
      </div>

      {/* Comparison bar */}
      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(e.score, 100)}%`, backgroundColor: sc.bg }}
          />
        </div>
        <span className={`text-[10px] font-bold whitespace-nowrap ${
          e.vsDeptAvg >= 0 ? 'text-emerald-600' : 'text-red-500'
        }`}>
          {e.vsDeptAvg >= 0 ? '+' : ''}{e.vsDeptAvg}% TB
        </span>
      </div>
    </div>
  );
}
