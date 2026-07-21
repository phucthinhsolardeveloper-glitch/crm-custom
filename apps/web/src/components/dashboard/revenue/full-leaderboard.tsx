'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import { ChartCard } from '../widgets/chart-card';
import { fmtVNDShort, fmtNum, type LeaderboardItem } from '../constants';

interface FullLeaderboardProps {
  data: LeaderboardItem[];
  loading: boolean;
}

const DEFAULT_VISIBLE = 10;

/**
 * Chọn màu thanh tiến độ KPI theo % hoàn thành (class màu nền Tailwind cho <div> bar).
 */
function kpiBarColor(pct: number): string {
  if (pct >= 100) return 'bg-emerald-500'; // đạt / vượt chỉ tiêu
  if (pct >= 80) return 'bg-sky-500'; // gần đạt, đang theo kịp
  if (pct >= 50) return 'bg-amber-500'; // giữa kỳ, cần đẩy
  return 'bg-rose-500'; // nguy hiểm, còn xa mục tiêu
}

export function FullLeaderboard({ data, loading }: FullLeaderboardProps) {
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <ChartCard title="Bảng xếp hạng nhân viên">
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      </ChartCard>
    );
  }

  if (data.length === 0) {
    return (
      <ChartCard title="Bảng xếp hạng nhân viên">
        <p className="py-12 text-center text-sm text-slate-400">Chưa có doanh số trong kỳ</p>
      </ChartCard>
    );
  }

  const visible = expanded ? data : data.slice(0, DEFAULT_VISIBLE);

  return (
    <ChartCard title="Bảng xếp hạng nhân viên">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-semibold">#</th>
              <th className="px-3 py-2 font-semibold">Nhân viên</th>
              <th className="px-3 py-2 font-semibold">Phòng</th>
              <th className="px-3 py-2 text-right font-semibold">
                <span className="inline-flex items-center justify-end gap-1">
                  Doanh số
                  <span
                    title="Doanh số KPI = chỉ tính thanh toán đã xác nhận (VERIFIED). Không tính các khoản bị đánh dấu sai thông tin (REJECTED)."
                    className="cursor-help text-slate-400 hover:text-sky-500"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </span>
                </span>
              </th>
              <th className="px-3 py-2 text-right font-semibold">Đơn</th>
              <th className="px-3 py-2 font-semibold">KPI tháng</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map(row => {
              const isTop = row.rank <= 3;
              const rowCls = row.rank === 1
                ? 'bg-amber-50/50 hover:bg-amber-50'
                : isTop
                  ? 'hover:bg-slate-50'
                  : 'hover:bg-slate-50';
              return (
                <tr key={row.userId} className={rowCls}>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        row.rank === 1
                          ? 'bg-amber-500 text-white'
                          : row.rank === 2
                            ? 'bg-slate-400 text-white'
                            : row.rank === 3
                              ? 'bg-orange-400 text-white'
                              : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {row.rank}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-medium text-slate-800">{row.name}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{row.deptName}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                    {fmtVNDShort(row.revenue)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{fmtNum(row.ordersCount)}</td>
                  <td className="px-3 py-2.5">
                    {row.kpiTarget == null ? (
                      <span className="text-slate-300">-</span>
                    ) : (
                      <div className="min-w-[120px]">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="tabular-nums text-slate-500">
                            {fmtVNDShort(row.kpiActual)} / {fmtVNDShort(row.kpiTarget)}
                          </span>
                          <span className="font-semibold tabular-nums text-slate-700">{row.kpiPct}%</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full transition-all ${kpiBarColor(row.kpiPct ?? 0)}`}
                            style={{ width: `${Math.min(row.kpiPct ?? 0, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data.length > DEFAULT_VISIBLE && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => setExpanded(prev => !prev)}
            className="text-xs font-medium text-sky-600 transition hover:text-sky-800"
          >
            {expanded ? `Thu gọn (${DEFAULT_VISIBLE} hàng)` : `Xem tất cả (${data.length} người)`}
          </button>
        </div>
      )}
    </ChartCard>
  );
}
