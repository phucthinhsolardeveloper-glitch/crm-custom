'use client';

import { type AgingItem, type ConversionByHourItem, fmtNum, fmtPct, fmtVNDShort } from '../constants';
import type { EmployeeScorecard } from '../hooks/use-employee-scores';
import { BlockSectionLabel } from './block-section-label';
import { ChartCard } from '../widgets/chart-card';
import { LeadAgingCard } from '../widgets/lead-aging-card';

interface ExtensionBlockProps {
  employees: EmployeeScorecard[];
  employeesLoading: boolean;
  byHour: ConversionByHourItem[];
  aging: AgingItem[];
  loading: boolean;
}

/** Card A: top 5 sale theo doanh thu - lead nhận / CV% / DT, highlight CV max-min. */
function SaleConversionCard({ employees, loading }: { employees: EmployeeScorecard[]; loading: boolean }) {
  if (loading) {
    return (
      <ChartCard title="🧑‍💼 CV theo sale">
        <div className="h-[220px] animate-pulse rounded-lg bg-slate-100" />
      </ChartCard>
    );
  }

  const top = employees.slice().sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  if (top.length === 0) {
    return (
      <ChartCard title="🧑‍💼 CV theo sale">
        <p className="py-10 text-center text-xs text-slate-400">Chưa có dữ liệu sale trong kỳ</p>
      </ChartCard>
    );
  }
  const cvValues = top.map(e => e.conversionRate);
  const maxCv = Math.max(...cvValues);
  const minCv = Math.min(...cvValues);

  return (
    <ChartCard
      title="🧑‍💼 CV theo sale"
      infoTooltip="Top 5 sale theo doanh thu verified trong kỳ. Lead nhận = số lượt được gán lead; CV% = đơn tạo / lead nhận."
    >
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-100 text-[10px] font-semibold uppercase text-slate-500">
            <th className="py-1.5 text-left">Sale</th>
            <th className="py-1.5 text-right">Lead nhận</th>
            <th className="py-1.5 text-right">CV%</th>
            <th className="py-1.5 text-right">DT</th>
          </tr>
        </thead>
        <tbody>
          {top.map(e => {
            const isMax = e.conversionRate === maxCv && maxCv !== minCv;
            const isMin = e.conversionRate === minCv && maxCv !== minCv;
            return (
              <tr key={e.userId} className="border-b border-slate-50">
                <td className="max-w-[120px] truncate py-2 font-medium text-slate-800" title={e.name}>{e.name}</td>
                <td className="py-2 text-right tabular-nums text-slate-600">{fmtNum(e.leadsAssigned)}</td>
                <td className={`py-2 text-right font-bold tabular-nums ${isMax ? 'text-emerald-600' : isMin ? 'text-red-500' : 'text-slate-700'}`}>
                  {fmtPct(e.conversionRate, 0)}{isMax ? ' ▲' : isMin ? ' ▼' : ''}
                </td>
                <td className="py-2 text-right font-semibold tabular-nums text-slate-900">{fmtVNDShort(e.revenue)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ChartCard>
  );
}

/** Card B: CV% theo khung giờ tạo lead - hbar. */
function ConversionByHourCard({ byHour, loading }: { byHour: ConversionByHourItem[]; loading: boolean }) {
  if (loading) {
    return (
      <ChartCard title="🕐 CV theo khung giờ">
        <div className="h-[220px] animate-pulse rounded-lg bg-slate-100" />
      </ChartCard>
    );
  }
  const hasLeads = byHour.some(b => b.leads > 0);
  if (!hasLeads) {
    return (
      <ChartCard title="🕐 CV theo khung giờ">
        <p className="py-10 text-center text-xs text-slate-400">Chưa có lead trong kỳ</p>
      </ChartCard>
    );
  }
  const maxCv = Math.max(...byHour.map(b => b.cvRate), 1);

  return (
    <ChartCard
      title="🕐 CV theo khung giờ"
      infoTooltip="CV% theo khung giờ TẠO lead (giờ VN). Lead tạo trong kỳ; converted tính theo trạng thái hiện tại."
    >
      <div className="space-y-2.5">
        {byHour.map(b => (
          <div key={b.bucket}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-medium text-slate-700">{b.bucket}</span>
              <span className="tabular-nums text-slate-500">
                {fmtNum(b.leads)} lead · <b className="text-slate-800">{fmtPct(b.cvRate)}</b>
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400"
                style={{ width: `${Math.min((b.cvRate / maxCv) * 100, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

/** Block 5 - lát cắt mở rộng: CV theo sale, CV theo khung giờ, tồn kho chăm sóc (lead aging). */
export function ExtensionBlock({ employees, employeesLoading, byHour, aging, loading }: ExtensionBlockProps) {
  return (
    <section className="space-y-3">
      <BlockSectionLabel index={5} title="Lát cắt mở rộng" question="Cùng logic đó, nhìn thêm theo sale / giờ / tồn kho" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SaleConversionCard employees={employees} loading={employeesLoading} />
        <ConversionByHourCard byHour={byHour} loading={loading} />
        <LeadAgingCard aging={aging} loading={loading} />
      </div>
    </section>
  );
}
