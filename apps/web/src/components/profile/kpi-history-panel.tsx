'use client';

import { useEffect, useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { kpiTargetsApi, type KpiTargetsRecord, type KpiActualResponse } from '@/lib/api/kpi-targets';
import { computeAchievement, parseTargetString, MONTH_NAMES_VN } from '@/lib/kpi-calculation';
import { formatVND } from '@/lib/utils';
import { TrendingUp } from 'lucide-react';

interface KpiHistoryPanelProps {
  userId: string;
}

const MONTH_TARGET_KEYS = [
  'targetJan', 'targetFeb', 'targetMar', 'targetApr',
  'targetMay', 'targetJun', 'targetJul', 'targetAug',
  'targetSep', 'targetOct', 'targetNov', 'targetDec',
] as const;

/**
 * Panel "Lịch sử KPI" trên profile: bảng 12 tháng + tổng năm.
 * Year selector cho phép xem lại KPI cũ.
 */
export function KpiHistoryPanel({ userId }: KpiHistoryPanelProps) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [targets, setTargets] = useState<KpiTargetsRecord | null>(null);
  const [actual, setActual] = useState<KpiActualResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const yearOptions = useMemo(() => {
    const opts: number[] = [];
    for (let y = currentYear + 1; y >= 2020; y--) opts.push(y);
    return opts;
  }, [currentYear]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      kpiTargetsApi.getOne(userId, year),
      kpiTargetsApi.getActual(userId, year),
    ])
      .then(([t, a]) => {
        setTargets(t.data);
        setActual(a.data);
      })
      .catch(() => {
        setTargets(null);
        setActual(null);
      })
      .finally(() => setLoading(false));
  }, [userId, year]);

  const rows = useMemo(() => {
    return MONTH_TARGET_KEYS.map((key, i) => {
      const target = targets ? parseTargetString(targets[key]) : null;
      const actualMonth = actual?.monthly[i + 1] ?? 0;
      const ach = computeAchievement(actualMonth, target);
      return { month: i + 1, name: MONTH_NAMES_VN[i], target, actual: actualMonth, ach };
    });
  }, [targets, actual]);

  const yearlyRow = useMemo(() => {
    const target = targets ? parseTargetString(targets.targetYearly) : null;
    const actualYearly = actual?.yearly ?? 0;
    return { target, actual: actualYearly, ach: computeAchievement(actualYearly, target) };
  }, [targets, actual]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp size={18} className="text-sky-500" />
          Lịch sử KPI doanh số
        </CardTitle>
        <select
          value={year}
          onChange={(e) => setYear(parseInt(e.target.value, 10))}
          className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>Năm {y}</option>
          ))}
        </select>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-slate-400">Đang tải...</div>
        ) : !targets ? (
          <p className="text-sm text-slate-500">
            Chưa được set KPI cho năm {year}. Liên hệ quản trị viên.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="py-2 text-left font-medium">Tháng</th>
                  <th className="py-2 text-right font-medium">Target</th>
                  <th className="py-2 text-right font-medium">Actual</th>
                  <th className="py-2 text-right font-medium">% Đạt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.month} className="border-b border-slate-100">
                    <td className="py-2 text-left text-slate-700">{r.name}</td>
                    <td className="py-2 text-right text-slate-600">
                      {r.target === null ? '—' : formatVND(r.target)}
                    </td>
                    <td className="py-2 text-right text-slate-900">{formatVND(r.actual)}</td>
                    <td className="py-2 text-right font-medium">
                      <AchievementBadge percent={r.ach.percent} status={r.ach.status} />
                    </td>
                  </tr>
                ))}
                <tr className="bg-sky-50 font-semibold">
                  <td className="py-3 text-left text-slate-900">Cả năm {year}</td>
                  <td className="py-3 text-right text-slate-700">
                    {yearlyRow.target === null ? '—' : formatVND(yearlyRow.target)}
                  </td>
                  <td className="py-3 text-right text-slate-900">{formatVND(yearlyRow.actual)}</td>
                  <td className="py-3 text-right">
                    <AchievementBadge percent={yearlyRow.ach.percent} status={yearlyRow.ach.status} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface AchievementBadgeProps {
  percent: number | null;
  status: 'not-set' | 'zero' | 'below' | 'on-track' | 'exceeded';
}

function AchievementBadge({ percent, status }: AchievementBadgeProps) {
  if (percent === null) return <span className="text-slate-400">—</span>;
  const color = {
    'not-set': 'text-slate-400',
    'zero': 'text-slate-400',
    'below': 'text-amber-600',
    'on-track': 'text-sky-600',
    'exceeded': 'text-emerald-600',
  }[status];
  return <span className={color}>{percent}%</span>;
}
