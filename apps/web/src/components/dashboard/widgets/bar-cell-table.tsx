'use client';

/**
 * BarCellTable - generic table với bar-in-cell visualization.
 * Mỗi cell numeric có thanh nền chiều dài tỉ lệ với max của cột.
 *
 * Dùng cho 3 tab dashboard employees: Báo cáo tổng, Cuộc gọi, Bán hàng.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { formatValue, type ValueFormat } from '../utils/format-value';

export type BarColor =
  | 'sky' | 'teal' | 'amber' | 'emerald' | 'rose'
  | 'violet' | 'blue' | 'cyan' | 'slate';

// Map color key -> Tailwind classes. KHÔNG dùng template literal (Tailwind purge sẽ strip).
// Phải khai literal class name đầy đủ.
const COLOR_MAP: Record<BarColor, { bg: string; text: string }> = {
  sky:     { bg: 'bg-sky-400/30',     text: 'text-sky-900' },
  teal:    { bg: 'bg-teal-400/30',    text: 'text-teal-900' },
  amber:   { bg: 'bg-amber-400/40',   text: 'text-amber-900' },
  emerald: { bg: 'bg-emerald-400/30', text: 'text-emerald-900' },
  rose:    { bg: 'bg-rose-400/30',    text: 'text-rose-900' },
  violet:  { bg: 'bg-violet-400/30',  text: 'text-violet-900' },
  blue:    { bg: 'bg-blue-500/40',    text: 'text-blue-900' },
  cyan:    { bg: 'bg-cyan-400/30',    text: 'text-cyan-900' },
  slate:   { bg: 'bg-slate-300/40',   text: 'text-slate-700' },
};

export interface BarCellColumn<T> {
  key: string;
  label: string;
  /** Hiển thị "(1)", "(=5/1)" cạnh label */
  formula?: string;
  barColor?: BarColor;
  /** Inline style override khi color không nằm trong palette (vd label động) */
  barStyle?: { bg?: string; text?: string };
  format?: ValueFormat;
  align?: 'left' | 'right' | 'center';
  sticky?: boolean;
  sortable?: boolean;
  /** Lấy giá trị numeric từ row (mặc định row[key]) */
  accessor?: (row: T) => number;
  /** Click cell → callback. Wrap cell trong button nếu set. */
  onCellClick?: (row: T) => void;
  /** Custom render content (vẫn dùng accessor cho bar). Nếu set, không format value mặc định. */
  renderCell?: (row: T) => ReactNode;
}

interface Props<T extends { userId: string; name: string; deptName: string }> {
  columns: BarCellColumn<T>[];
  rows: T[];
  loading?: boolean;
  defaultSort?: { key: string; direction: 'asc' | 'desc' };
  emptyMessage?: string;
  /** Hiện totals row dưới header (sum mỗi cột) */
  showTotals?: boolean;
}

function defaultAccessor<T>(row: T, key: string): number {
  const v = (row as Record<string, unknown>)[key];
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const parsed = Number(v);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function BarCell<T>({
  row, column, max,
}: { row: T; column: BarCellColumn<T>; max: number }) {
  const value = column.accessor
    ? column.accessor(row)
    : defaultAccessor(row, column.key);
  const percent = max === 0 ? 0 : Math.min(100, (value / max) * 100);
  const colorKey = column.barColor || 'sky';
  const colorClasses = COLOR_MAP[colorKey];
  const bgClass = column.barStyle?.bg || colorClasses.bg;
  const textClass = column.barStyle?.text || colorClasses.text;

  const content = column.renderCell
    ? column.renderCell(row)
    : formatValue(value, column.format);

  const alignClass = column.align === 'right'
    ? 'justify-end pr-2'
    : column.align === 'center'
      ? 'justify-center'
      : 'justify-start pl-2';

  const inner = (
    <div className="relative h-7 w-full rounded overflow-hidden" title={`${value}`}>
      <div
        className={`absolute inset-y-0 left-0 ${bgClass} rounded transition-all`}
        style={{ width: `${percent}%` }}
      />
      <div className={`relative flex h-full items-center ${alignClass} text-xs font-semibold ${textClass}`}>
        {content}
      </div>
    </div>
  );

  if (column.onCellClick) {
    return (
      <button
        type="button"
        onClick={() => column.onCellClick!(row)}
        className="block w-full text-left cursor-pointer rounded transition-all hover:ring-2 hover:ring-sky-300"
      >
        {inner}
      </button>
    );
  }
  return inner;
}

export function BarCellTable<T extends { userId: string; name: string; deptName: string }>({
  columns,
  rows,
  loading,
  defaultSort,
  emptyMessage = 'Không có dữ liệu',
  showTotals = true,
}: Props<T>) {
  const [sort, setSort] = useState(defaultSort);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find(c => c.key === sort.key);
    if (!col) return rows;
    const accessor = col.accessor || ((r: T) => defaultAccessor(r, col.key));
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = accessor(a);
      const vb = accessor(b);
      if (va === vb) return a.userId.localeCompare(b.userId);
      return (va - vb) * dir;
    });
  }, [rows, columns, sort]);

  // Max per column
  const maxPerCol = useMemo(() => {
    const m: Record<string, number> = {};
    for (const col of columns) {
      const accessor = col.accessor || ((r: T) => defaultAccessor(r, col.key));
      let max = 0;
      for (const row of rows) {
        const v = accessor(row);
        if (v > max) max = v;
      }
      m[col.key] = max;
    }
    return m;
  }, [columns, rows]);

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const col of columns) {
      const accessor = col.accessor || ((r: T) => defaultAccessor(r, col.key));
      let sum = 0;
      for (const row of rows) sum += accessor(row);
      t[col.key] = sum;
    }
    return t;
  }, [columns, rows]);

  function toggleSort(key: string, sortable?: boolean) {
    if (!sortable) return;
    setSort(prev => {
      if (prev?.key === key) {
        return { key, direction: prev.direction === 'desc' ? 'asc' : 'desc' };
      }
      return { key, direction: 'desc' };
    });
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-8 my-2 animate-pulse rounded bg-slate-100" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-100 bg-white p-12 text-center text-sm text-slate-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 sticky top-0 z-10">
            <tr className="border-b border-slate-200">
              <th className="sticky left-0 z-20 bg-slate-50 px-3 py-2 text-left text-[11px] font-semibold uppercase text-slate-500 w-12">
                STT
              </th>
              <th className="sticky left-12 z-20 bg-slate-50 px-3 py-2 text-left text-[11px] font-semibold uppercase text-slate-500 min-w-[180px]">
                Nhân viên
              </th>
              {columns.map(col => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key, col.sortable)}
                  className={`px-2 py-2 text-[11px] font-semibold uppercase text-slate-500 whitespace-nowrap ${
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                  } ${col.sortable ? 'cursor-pointer hover:bg-slate-100 select-none' : ''}`}
                  aria-sort={sort?.key === col.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  <div>{col.label}</div>
                  {col.formula && (
                    <div className="text-[10px] font-normal normal-case text-slate-400">{col.formula}</div>
                  )}
                </th>
              ))}
            </tr>
            {showTotals && (
              <tr className="border-b border-slate-200 bg-slate-100/60">
                <td className="sticky left-0 z-20 bg-slate-100/60 px-3 py-1.5 text-[11px] font-semibold text-slate-600" colSpan={2}>
                  TỔNG
                </td>
                {columns.map(col => (
                  <td
                    key={col.key}
                    className={`px-2 py-1.5 text-xs font-bold text-slate-700 whitespace-nowrap ${
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                    }`}
                  >
                    {formatValue(totals[col.key] || 0, col.format)}
                  </td>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => (
              <tr key={row.userId} className="border-b border-slate-100 hover:bg-sky-50/30 transition-colors">
                <td className="sticky left-0 z-10 bg-white px-3 py-2 text-xs text-slate-500">{idx + 1}</td>
                <td className="sticky left-12 z-10 bg-white px-3 py-2 min-w-[180px]">
                  <div className="text-sm font-semibold text-slate-900 truncate">{row.name}</div>
                  <div className="text-[10px] text-slate-400 truncate">{row.deptName}</div>
                </td>
                {columns.map(col => (
                  <td key={col.key} className="px-2 py-1.5 min-w-[110px]">
                    <BarCell row={row} column={col} max={maxPerCol[col.key] || 0} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
