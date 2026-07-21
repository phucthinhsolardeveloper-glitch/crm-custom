'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { formatNumber, formatVND } from '@/lib/utils';

/**
 * Trang "Team của tôi" - dành cho LEADER giám sát đội (member + KPI kỳ này).
 * Dữ liệu lấy từ GET /users/my-team (BE đã ép scope theo team của caller).
 * Shape trùng EmployeeScoreRaw của dashboard employees (tái dùng định nghĩa KPI).
 */
interface TeamMemberKpi {
  userId: string;
  name: string;
  deptName: string;
  leadsAssigned: number;
  leadsConverted: number;
  revenue: number;
  overdueTasks: number;
}

export default function MyTeamPage() {
  const [members, setMembers] = useState<TeamMemberKpi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ data: TeamMemberKpi[] }>('/users/my-team')
      .then(res => setMembers(res.data || []))
      .catch(err => setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu team'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Team của tôi</h1>
        <p className="mt-1 text-sm text-slate-500">
          Hiệu suất thành viên trong đội (kỳ tháng hiện tại). Chỉ xem.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}

      {loading ? (
        <div className="h-[300px] animate-pulse rounded-xl bg-slate-100" />
      ) : members.length === 0 ? (
        <div className="flex h-[300px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400">
          Chưa có thành viên nào trong team của bạn
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Thành viên</th>
                <th className="px-4 py-3 text-right">Leads nhận</th>
                <th className="px-4 py-3 text-right">Chốt đơn</th>
                <th className="px-4 py-3 text-right">Tỷ lệ chốt</th>
                <th className="px-4 py-3 text-right">Doanh thu</th>
                <th className="px-4 py-3 text-right">Quá hạn</th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => {
                const convRate = m.leadsAssigned > 0
                  ? Math.round((m.leadsConverted / m.leadsAssigned) * 100)
                  : 0;
                return (
                  <tr key={m.userId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{m.name}</div>
                      <div className="text-xs text-slate-400">{m.deptName}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">{formatNumber(m.leadsAssigned)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{formatNumber(m.leadsConverted)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{convRate}%</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">{formatVND(m.revenue)}</td>
                    <td className="px-4 py-3 text-right">
                      {m.overdueTasks > 0
                        ? <span className="font-medium text-red-600">{m.overdueTasks}</span>
                        : <span className="text-slate-400">0</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
