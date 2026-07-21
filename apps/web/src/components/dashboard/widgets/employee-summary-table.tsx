'use client';

/**
 * Tab "Báo cáo tổng" - 10 cột metric per user.
 * Merge data từ employee-scores + employee-calls để có cột "Số cuộc gọi" và "Số phút gọi".
 */

import { useMemo } from 'react';
import { BarCellTable, type BarCellColumn } from './bar-cell-table';
import type { EmployeeScoreRaw } from '../hooks/use-employee-scores';
import type { EmployeeCallReportRow } from '../hooks/use-employee-call-report';

interface SummaryRow extends EmployeeScoreRaw {
  callsTotal: number;
  callMinutesTotal: number;
}

interface Props {
  scores: EmployeeScoreRaw[];
  calls: EmployeeCallReportRow[];
  loading: boolean;
}

const COLUMNS: BarCellColumn<SummaryRow>[] = [
  { key: 'leadsAssigned', label: 'Số lead', formula: '(1)', barColor: 'sky', format: 'number', align: 'right', sortable: true },
  { key: 'untouchedLeads', label: 'Lead chưa TN', formula: '(2)', barColor: 'sky', format: 'number', align: 'right', sortable: true },
  // Lượt tương tác: 1 lead × 1 ngày có note hoặc đổi nhãn = 1 lượt (gom theo timezone VN)
  { key: 'interactions', label: 'Lượt tương tác', formula: '(note + đổi nhãn / lead / ngày)', barColor: 'cyan', format: 'number', align: 'right', sortable: true },
  { key: 'ordersCount', label: 'Số đơn', formula: '(3)', barColor: 'amber', format: 'number', align: 'right', sortable: true },
  { key: 'productsCount', label: 'Số SP', formula: '(4)', barColor: 'teal', format: 'number', align: 'right', sortable: true },
  { key: 'revenue', label: 'Doanh thu ', formula: '(5)', barColor: 'emerald', format: 'currency', align: 'right', sortable: true },
  { key: 'netRevenue', label: 'Doanh thu về cty', formula: '(6=5-VAT)', barColor: 'teal', format: 'currency', align: 'right', sortable: true },
  {
    key: 'revPerLead',
    label: 'Doanh thu/Lead',
    formula: '(=5/1)',
    barColor: 'blue',
    format: 'currency',
    align: 'right',
    sortable: true,
    accessor: (r) => r.leadsAssigned > 0 ? Math.round(r.revenue / r.leadsAssigned) : 0,
  },
  {
    key: 'avgOrderValue',
    label: 'Giá trị đơn TB',
    formula: '(=5/3)',
    barColor: 'emerald',
    format: 'currency',
    align: 'right',
    sortable: true,
    accessor: (r) => r.ordersCount > 0 ? Math.round(r.revenue / r.ordersCount) : 0,
  },
  {
    key: 'conversionRate',
    label: 'Tỉ lệ chốt',
    formula: '(=3/1)',
    barColor: 'amber',
    format: 'percent',
    align: 'right',
    sortable: true,
    accessor: (r) => r.leadsAssigned > 0 ? (r.ordersCount / r.leadsAssigned) * 100 : 0,
  },
  { key: 'callsTotal', label: 'Số cuộc gọi', barColor: 'violet', format: 'number', align: 'right', sortable: true },
  { key: 'callMinutesTotal', label: 'Số phút gọi', barColor: 'violet', format: 'duration', align: 'right', sortable: true },
];

export function EmployeeSummaryTable({ scores, calls, loading }: Props) {
  const rows = useMemo<SummaryRow[]>(() => {
    // Index calls by userId for O(1) merge
    const callMap = new Map(calls.map(c => [c.userId, c]));
    return scores.map(s => {
      const c = callMap.get(s.userId);
      return {
        ...s,
        callsTotal: (c?.callsOutgoing ?? 0) + 0, // tổng OUT (đã bao gồm answer/missed)
        callMinutesTotal: c?.outgoingTotalSeconds ?? 0,
      };
    });
  }, [scores, calls]);

  return (
    <BarCellTable<SummaryRow>
      columns={COLUMNS}
      rows={rows}
      loading={loading}
      defaultSort={{ key: 'revenue', direction: 'desc' }}
      emptyMessage="Không có nhân viên nào trong kỳ đã chọn"
    />
  );
}
