'use client';

/**
 * Tab "Bán hàng" - dynamic columns:
 * - 1..7: top 7 label name từ API
 * - 8: Khác (label ngoài top 7)
 * - 9: KH chưa tiếp cận (lead chưa có outgoing call > 0)
 *
 * Click cell → mở drill-down panel với mode tương ứng.
 */

import { useMemo } from 'react';
import { BarCellTable, type BarCellColumn } from './bar-cell-table';
import { hexToColorKey } from '../utils/hex-to-color-key';
import type { SalesBreakdownRow, TopLabel } from '../hooks/use-employee-sales-breakdown';
import type { DrillDownMode } from '../hooks/use-customer-drill-down';

interface Props {
  topLabels: TopLabel[];
  rows: SalesBreakdownRow[];
  loading: boolean;
  onCellClick?: (userId: string, mode: DrillDownMode) => void;
}

function buildColumns(
  topLabels: TopLabel[],
  onCellClick?: (userId: string, mode: DrillDownMode) => void,
): BarCellColumn<SalesBreakdownRow>[] {
  const labelCols: BarCellColumn<SalesBreakdownRow>[] = topLabels.map((label) => ({
    key: `label_${label.id}`,
    label: label.name,
    barColor: hexToColorKey(label.color),
    format: 'number',
    align: 'right',
    sortable: true,
    accessor: (r) => r.labelCounts[label.id] ?? 0,
    onCellClick: onCellClick ? (r) => onCellClick(r.userId, { labelId: label.id }) : undefined,
  }));

  return [
    ...labelCols,
    {
      key: 'otherCount',
      label: 'Khác',
      barColor: 'slate',
      format: 'number',
      align: 'right',
      sortable: true,
      accessor: (r) => r.otherCount,
      onCellClick: onCellClick ? (r) => onCellClick(r.userId, { other: true }) : undefined,
    },
    {
      key: 'untouchedCount',
      label: 'KH chưa tiếp cận',
      barColor: 'rose',
      format: 'number',
      align: 'right',
      sortable: true,
      accessor: (r) => r.untouchedCount,
      onCellClick: onCellClick ? (r) => onCellClick(r.userId, { untouched: true }) : undefined,
    },
  ];
}

export function EmployeeSalesTable({ topLabels, rows, loading, onCellClick }: Props) {
  const columns = useMemo(
    () => buildColumns(topLabels, onCellClick),
    [topLabels, onCellClick],
  );

  return (
    <BarCellTable<SalesBreakdownRow>
      columns={columns}
      rows={rows}
      loading={loading}
      defaultSort={{ key: 'untouchedCount', direction: 'desc' }}
      emptyMessage="Chưa có dữ liệu phân loại khách hàng"
    />
  );
}
