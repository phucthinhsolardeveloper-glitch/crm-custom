'use client';

/**
 * Tab "Báo cáo cuộc gọi" - 3 cột:
 * 1. Nghe máy / Gọi ra (format "answered/outgoing")
 * 2. Tổng thời gian gọi ra
 * 3. Thời gian gọi TB
 */

import { BarCellTable, type BarCellColumn } from './bar-cell-table';
import type { EmployeeCallReportRow } from '../hooks/use-employee-call-report';
import { fmtNumber } from '../utils/format-value';

interface Props {
  rows: EmployeeCallReportRow[];
  loading: boolean;
}

const COLUMNS: BarCellColumn<EmployeeCallReportRow>[] = [
  {
    key: 'callsAnswered',
    label: 'Nghe máy / Gọi ra',
    barColor: 'teal',
    align: 'right',
    sortable: true,
    accessor: (r) => r.callsAnswered,
    renderCell: (r) => (
      <span>
        <span className="text-teal-700">{fmtNumber(r.callsAnswered)}</span>
        <span className="text-slate-400 mx-0.5">/</span>
        <span className="text-rose-700">{fmtNumber(r.callsOutgoing)}</span>
      </span>
    ),
  },
  {
    key: 'outgoingTotalSeconds',
    label: 'Tổng TG gọi ra',
    barColor: 'rose',
    format: 'duration',
    align: 'right',
    sortable: true,
  },
  {
    key: 'outgoingAvgSeconds',
    label: 'TG gọi TB',
    barColor: 'rose',
    format: 'duration',
    align: 'right',
    sortable: true,
  },
];

export function EmployeeCallTable({ rows, loading }: Props) {
  return (
    <BarCellTable<EmployeeCallReportRow>
      columns={COLUMNS}
      rows={rows}
      loading={loading}
      defaultSort={{ key: 'callsOutgoing', direction: 'desc' }}
      emptyMessage="Không có dữ liệu cuộc gọi trong kỳ"
    />
  );
}
