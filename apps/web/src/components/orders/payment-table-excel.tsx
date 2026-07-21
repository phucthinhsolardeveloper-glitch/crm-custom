'use client';

import { useMemo, useRef, useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/shared/status-badge';
import { type ToggleableColumn } from '@/components/leads/lead-table-excel-column-toggle';
import { useLeadColumns } from '@/components/leads/lead-columns-context';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EditOrderDialog } from '@/components/orders/edit-order-dialog';
import { EditPaymentOnlyDialog } from '@/components/orders/edit-payment-only-dialog';
import { useAuth } from '@/providers/auth-provider';
import { api } from '@/lib/api-client';
import { cn, formatVND, formatDateTime } from '@/lib/utils';
// fontFamily đã sync với global font picker (xem use-global-font-pref.ts);
// bảng kế thừa qua var(--font-sans) trên <html>.
import type { RowStylePrefs } from '@/hooks/use-row-style-prefs';
import type { PaymentRecord } from '@/types/entities';
import type { ColumnPrefs } from '@/hooks/use-column-prefs';

// Storage keys riêng cho bảng payments-centric (/orders). v4: reset localStorage vì cột đổi hoàn toàn.
export const ORDER_COLUMNS_STORAGE_KEY = 'crm_order_columns_v4';
export const ORDER_TYPOGRAPHY_STORAGE_KEY = 'crm_order_typography_v1';
export const ORDER_COLUMN_STYLES_STORAGE_KEY = 'crm_order_column_styles_v1';
export const ORDER_ROW_STYLES_STORAGE_KEY = 'crm_order_row_styles_v1';

interface ColDef {
  key: string;
  label: string;
  width: number;
  hideable?: boolean;
  align?: 'left' | 'right' | 'center';
  stickyLeft?: boolean;
  stickyRight?: boolean;
  group: string;
}

interface GroupMeta {
  label: string;
  headerBg: string;
  headerText: string;
  colBg: string;
}

const GROUP_META: Record<string, GroupMeta> = {
  order:   { label: 'Đơn hàng',     headerBg: '#e2e8f0', headerText: '#475569', colBg: '#f1f5f9' },
  staff:   { label: 'Phụ trách',    headerBg: '#bae6fd', headerText: '#0369a1', colBg: '#e0f2fe' },
  product: { label: 'Sản phẩm',     headerBg: '#ddd6fe', headerText: '#6d28d9', colBg: '#ede9fe' },
  payment: { label: 'Thanh toán',   headerBg: '#fde68a', headerText: '#92400e', colBg: '#fef3c7' },
  invoice: { label: 'Hóa đơn B2B',  headerBg: '#fbcfe8', headerText: '#9d174d', colBg: '#fce7f3' },
  actions: { label: '',             headerBg: '#e2e8f0', headerText: '#64748b', colBg: '#f1f5f9' },
};

/** Cumulative left offset cho sticky cột (px). Tính runtime theo width thực tế (prefs). */
function computeStickyOffsets(cols: ColDef[], getWidth: (k: string, fb: number) => number) {
  const offsets: Record<string, number> = {};
  let acc = 0;
  for (const c of cols) {
    if (c.stickyLeft) { offsets[c.key] = acc; acc += getWidth(c.key, c.width); }
  }
  return offsets;
}

/**
 * Build column defs + toggleable subset cho PaymentTableExcel.
 * Mỗi row = 1 payment với thông tin đơn hàng auto-map từ payment.order.
 * Export để page wrapper compute cùng list feed vào Setting button toolbar.
 */
export function buildPaymentColumns(): {
  columns: ColDef[];
  toggleableColumns: ToggleableColumn[];
  columnDefaults: ColumnPrefs;
  groups: Record<string, GroupMeta>;
} {
  const orderCols: ColDef[] = [
    { key: 'orderId', label: 'Mã đơn', width: 90, stickyLeft: true, group: 'order' },
    { key: 'customerName', label: 'Khách hàng', width: 180, stickyLeft: true, group: 'order' },
    { key: 'phone', label: 'SĐT', width: 140, stickyLeft: true, hideable: true, group: 'order' },
  ];
  const staffCols: ColDef[] = [
    { key: 'creator', label: 'Nhân viên', width: 150, hideable: true, group: 'staff' },
    { key: 'team', label: 'Team', width: 120, hideable: true, group: 'staff' },
    { key: 'source', label: 'Nguồn', width: 120, hideable: true, group: 'staff' },
    { key: 'sourceGroup', label: 'Nhóm nguồn', width: 130, hideable: true, group: 'staff' },
  ];
  const productCols: ColDef[] = [
    { key: 'product', label: 'Sản phẩm', width: 180, hideable: true, group: 'product' },
    { key: 'productGroup', label: 'Nhóm SP', width: 130, hideable: true, group: 'product' },
    { key: 'orderFormat', label: 'Hình thức', width: 130, hideable: true, group: 'product' },
    { key: 'listPrice', label: 'Giá bán niêm yết', width: 150, align: 'right', hideable: true, group: 'product' },
  ];
  const paymentCols: ColDef[] = [
    { key: 'installment', label: 'Đợt TT', width: 110, hideable: true, group: 'payment' },
    { key: 'amount', label: 'Doanh thu về cty', width: 150, align: 'right', hideable: true, group: 'payment' },
    { key: 'vatRate', label: 'VAT %', width: 80, align: 'right', hideable: true, group: 'payment' },
    { key: 'vatAmount', label: 'Tiền VAT', width: 120, align: 'right', hideable: true, group: 'payment' },
    { key: 'netRevenue', label: 'DT thuần', width: 130, align: 'right', hideable: true, group: 'payment' },
    { key: 'completionRate', label: 'Tỉ lệ TT', width: 110, align: 'center', hideable: true, group: 'payment' },
    { key: 'transferDate', label: 'Ngày CK', width: 150, hideable: true, group: 'payment' },
    { key: 'paymentType', label: 'Hình thức', width: 130, hideable: true, group: 'payment' },
    { key: 'bankAccount', label: 'Ngân hàng', width: 120, hideable: true, group: 'payment' },
    { key: 'transferContent', label: 'Nội dung CK', width: 150, hideable: true, group: 'payment' },
    { key: 'status', label: 'Trạng thái', width: 120, hideable: true, group: 'payment' },
    { key: 'verifier', label: 'KT xác nhận', width: 130, hideable: true, group: 'payment' },
    { key: 'notes', label: 'Ghi chú', width: 180, hideable: true, group: 'payment' },
  ];
  const invoiceCols: ColDef[] = [
    { key: 'companyName', label: 'Tên CTY', width: 180, hideable: true, group: 'invoice' },
    { key: 'taxCode', label: 'MST', width: 130, hideable: true, group: 'invoice' },
    { key: 'vatEmail', label: 'Email VAT', width: 180, hideable: true, group: 'invoice' },
    { key: 'address', label: 'Địa chỉ', width: 200, hideable: true, group: 'invoice' },
  ];
  const actionsCol: ColDef = { key: 'actions', label: 'Thao tác', width: 96, align: 'center', stickyRight: true, group: 'actions' };

  const columns: ColDef[] = [
    ...orderCols, ...staffCols, ...productCols, ...paymentCols, ...invoiceCols, actionsCol,
  ];

  const toggleableColumns: ToggleableColumn[] = columns
    .filter((c) => c.hideable || c.stickyLeft || c.stickyRight)
    .map((c) => ({ key: c.key, label: c.label || c.key, sticky: !!(c.stickyLeft || c.stickyRight) }));

  return { columns, toggleableColumns, columnDefaults: {}, groups: GROUP_META };
}

// ── Main table ─────────────────────────────────────────────────────────────

interface PaymentTableExcelProps {
  payments: PaymentRecord[];
  totals?: { amount: number; vatAmount: number; netRevenue: number };
  enableSelection?: boolean;
  selectedIds?: Set<string>;
  onToggleOne?: (id: string) => void;
  onToggleAll?: () => void;
  allSelected?: boolean;
  someSelected?: boolean;
}

export function PaymentTableExcel(props: PaymentTableExcelProps) {
  const {
    payments, totals, enableSelection = false, selectedIds,
    onToggleOne, onToggleAll, allSelected = false, someSelected = false,
  } = props;

  const { columns, groups } = useMemo(() => buildPaymentColumns(), []);
  const { isVisible, getWidth, setWidth, order, typography, getColumnStyle, rowStyles } = useLeadColumns();

  // Apply order chỉ cho non-sticky columns. Sticky giữ vị trí gốc (đầu/cuối) để bảo toàn freeze.
  const orderedColumns = useMemo(() => {
    if (order.length === 0) return columns;
    const stickyLeftCols = columns.filter((c) => c.stickyLeft);
    const stickyRightCols = columns.filter((c) => c.stickyRight);
    const middleCols = columns.filter((c) => !c.stickyLeft && !c.stickyRight);
    const middleMap = new Map(middleCols.map((c) => [c.key, c]));
    const orderedMiddle = order.map((k) => middleMap.get(k)).filter((c): c is ColDef => !!c);
    const used = new Set(orderedMiddle.map((c) => c.key));
    const tail = middleCols.filter((c) => !used.has(c.key));
    return [...stickyLeftCols, ...orderedMiddle, ...tail, ...stickyRightCols];
  }, [columns, order]);

  const visibleCols = useMemo(
    () => orderedColumns.filter((c) => !c.hideable || isVisible(c.key)),
    [orderedColumns, isVisible],
  );
  const stickyOffsets = useMemo(() => computeStickyOffsets(visibleCols, getWidth), [visibleCols, getWidth]);

  // Group spans cho group header row: gom các cột liền kề cùng group thành 1 cell colspan.
  const groupSpans = useMemo(() => {
    const spans: { groupId: string; colSpan: number; allStickyLeft: boolean; allStickyRight: boolean; firstKey: string }[] = [];
    let i = 0;
    while (i < visibleCols.length) {
      const g = visibleCols[i].group;
      let span = 1;
      let allLeft = !!visibleCols[i].stickyLeft;
      let allRight = !!visibleCols[i].stickyRight;
      while (i + span < visibleCols.length && visibleCols[i + span].group === g) {
        allLeft = allLeft && !!visibleCols[i + span].stickyLeft;
        allRight = allRight && !!visibleCols[i + span].stickyRight;
        span++;
      }
      spans.push({ groupId: g, colSpan: span, allStickyLeft: allLeft, allStickyRight: allRight, firstKey: visibleCols[i].key });
      i += span;
    }
    return spans;
  }, [visibleCols]);

  // Cột cuối mỗi group → border phải dày hơn (phân tách nhóm trong data cells).
  const groupEndKeys = useMemo(() => {
    const keys = new Set<string>();
    for (let i = 0; i < visibleCols.length - 1; i++) {
      if (visibleCols[i].group !== visibleCols[i + 1].group) keys.add(visibleCols[i].key);
    }
    return keys;
  }, [visibleCols]);

  // Resize drag - dùng ref để tránh re-render mỗi pixel (commit width vào state ở mousemove).
  const resizeRef = useRef<{ key: string; startX: number; startW: number } | null>(null);
  const onResizeStart = useCallback((key: string, startW: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { key, startX: e.clientX, startW };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = ev.clientX - resizeRef.current.startX;
      const newW = Math.max(60, resizeRef.current.startW + delta);
      setWidth(resizeRef.current.key, newW);
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [setWidth]);

  if (payments.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400">
        Không có thanh toán nào
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-xl border-2 border-slate-300 bg-white max-h-[calc(100vh-280px)]">
      <table
        className="border-separate border-spacing-0"
        style={{
          width: 'max-content',
          minWidth: '100%',
        }}
      >
        <thead className="sticky top-0 z-30">
          {/* Row 1: Group header - tên nhóm, màu nhóm, colspan */}
          <tr>
            {enableSelection && (
              <th className="sticky left-0 z-40 w-10 bg-slate-100 border-b border-r border-slate-300" rowSpan={2} style={{ padding: '4px 8px' }}>
                <input type="checkbox" aria-label="Chon tat ca" checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                  onChange={onToggleAll}
                  className="h-3.5 w-3.5 rounded border-slate-400 text-sky-600 focus:ring-sky-500" />
              </th>
            )}
            {groupSpans.map((gs) => {
              const gm = groups[gs.groupId];
              const isGroupStickyLeft = gs.allStickyLeft;
              const isGroupStickyRight = gs.allStickyRight;
              const leftOffset = isGroupStickyLeft
                ? (enableSelection ? (stickyOffsets[gs.firstKey] ?? 0) + 40 : stickyOffsets[gs.firstKey] ?? 0)
                : undefined;
              return (
                <th
                  key={`grp-${gs.groupId}`}
                  colSpan={gs.colSpan}
                  style={{
                    backgroundColor: gm?.headerBg ?? '#e2e8f0',
                    color: gm?.headerText ?? '#475569',
                    ...(leftOffset !== undefined ? { left: leftOffset } : {}),
                  }}
                  className={cn(
                    'px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-center border-b border-r-2 border-slate-300 select-none whitespace-nowrap',
                    isGroupStickyLeft && 'sticky z-40',
                    isGroupStickyRight && 'sticky right-0 z-40',
                  )}
                >
                  {gm?.label ?? ''}
                </th>
              );
            })}
          </tr>

          {/* Row 2: Column header - tên cột, màu nhạt theo nhóm, resize handle */}
          <tr>
            {visibleCols.map((c) => {
              const w = getWidth(c.key, c.width);
              const stickyL = c.stickyLeft ? (enableSelection ? stickyOffsets[c.key] + 40 : stickyOffsets[c.key]) : undefined;
              const headerColStyle = getColumnStyle(c.key);
              const gm = groups[c.group];
              const isGroupEnd = groupEndKeys.has(c.key);
              const headerStyle: React.CSSProperties = {
                width: w,
                minWidth: w,
                maxWidth: w,
                backgroundColor: headerColStyle.bgColor || gm?.colBg || '#f1f5f9',
                ...(stickyL !== undefined ? { left: stickyL } : {}),
                ...(typography.applyToHeader ? {
                  fontSize: `${typography.fontSize}px`,
                  fontWeight: typography.fontWeight,
                  color: typography.color,
                } : {}),
                ...(headerColStyle.fontSize !== undefined ? { fontSize: `${headerColStyle.fontSize}px` } : {}),
                ...(headerColStyle.fontWeight !== undefined ? { fontWeight: headerColStyle.fontWeight } : {}),
                ...(headerColStyle.textColor ? { color: headerColStyle.textColor } : {}),
              };
              return (
                <th
                  key={c.key}
                  style={headerStyle}
                  className={cn(
                    'relative px-2 py-2 font-semibold border-b-2 border-slate-300 select-none',
                    !headerColStyle.textColor && 'text-slate-700',
                    c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                    c.stickyLeft && 'sticky z-30',
                    c.stickyRight && 'sticky right-0 z-30 shadow-[-2px_0_4px_rgba(0,0,0,0.04)]',
                    isGroupEnd ? 'border-r-2 border-r-slate-300' : 'border-r border-r-slate-200',
                  )}
                >
                  <span className="inline-flex items-center gap-1">{c.label}</span>
                  <span
                    onMouseDown={onResizeStart(c.key, w)}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-sky-400/60 active:bg-sky-500"
                  />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {payments.map((p, idx) => {
            const idStr = String(p.id);
            return (
              <PaymentExcelRow
                key={p.id}
                payment={p}
                idx={idx}
                cols={visibleCols}
                getWidth={getWidth}
                stickyOffsets={stickyOffsets}
                enableSelection={enableSelection}
                isSelected={selectedIds?.has(idStr) ?? false}
                onSelectToggle={() => onToggleOne?.(idStr)}
                rowStyles={rowStyles}
                groupEndKeys={groupEndKeys}
              />
            );
          })}
        </tbody>
        {totals && (
          <tfoot>
            <tr>
              {enableSelection && (
                <td className="sticky left-0 bottom-0 z-30 w-10 bg-slate-100 border-t-2 border-slate-300" />
              )}
              {visibleCols.map((c, i) => {
                const w = getWidth(c.key, c.width);
                const stickyL = c.stickyLeft ? (enableSelection ? stickyOffsets[c.key] + 40 : stickyOffsets[c.key]) : undefined;
                // Cong thuc trung khop renderDisplay: amount/vatAmount/netRevenue.
                let content: React.ReactNode = null;
                if (c.key === 'amount') content = formatVND(totals.amount);
                else if (c.key === 'vatAmount') content = formatVND(totals.vatAmount);
                else if (c.key === 'netRevenue') content = formatVND(totals.netRevenue);
                else if (i === 0) content = 'TỔNG';
                return (
                  <td
                    key={c.key}
                    style={{
                      width: w, minWidth: w, maxWidth: w,
                      ...(stickyL !== undefined ? { left: stickyL } : {}),
                    }}
                    className={cn(
                      'px-2 py-2 bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-800 sticky bottom-0 z-20',
                      c.align === 'right' ? 'text-right tabular-nums' : c.align === 'center' ? 'text-center' : 'text-left',
                      c.stickyLeft && 'z-30',
                      c.stickyRight && 'right-0 z-30',
                    )}
                  >
                    {content}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────

interface RowProps {
  payment: PaymentRecord;
  idx: number;
  cols: ColDef[];
  getWidth: (k: string, fb: number) => number;
  stickyOffsets: Record<string, number>;
  enableSelection: boolean;
  isSelected: boolean;
  onSelectToggle: () => void;
  rowStyles: RowStylePrefs;
  groupEndKeys: Set<string>;
}

function PaymentExcelRow({
  payment, idx, cols, getWidth, stickyOffsets, enableSelection, isSelected, onSelectToggle,
  rowStyles, groupEndKeys,
}: RowProps) {
  const { typography, getColumnStyle } = useLeadColumns();

  const rowBgColor = isSelected ? rowStyles.selectedBg
    : idx % 2 === 1 ? rowStyles.oddRowBg
    : rowStyles.evenRowBg;
  const rowTextColor = isSelected ? rowStyles.selectedText
    : idx % 2 === 1 ? rowStyles.oddRowText
    : rowStyles.evenRowText;

  const trStyle: React.CSSProperties = {
    backgroundColor: rowBgColor,
    color: rowTextColor,
    ['--row-hover-bg' as keyof React.CSSProperties]: rowStyles.hoverBg,
    ['--row-hover-text' as keyof React.CSSProperties]: rowStyles.hoverText,
  } as React.CSSProperties;

  return (
    <tr style={trStyle} className="hover:bg-[var(--row-hover-bg)] hover:text-[var(--row-hover-text)]">
      {enableSelection && (
        <td
          style={{ backgroundColor: rowBgColor, color: rowTextColor }}
          className="sticky left-0 z-20 w-10 px-2 py-1.5 border-b border-r border-slate-200"
          onClick={(e) => e.stopPropagation()}
        >
          <input type="checkbox" checked={isSelected} onChange={onSelectToggle}
            className="h-3.5 w-3.5 rounded border-slate-400 text-sky-600 focus:ring-sky-500" />
        </td>
      )}
      {cols.map((c) => {
        const w = getWidth(c.key, c.width);
        const stickyL = c.stickyLeft ? (enableSelection ? stickyOffsets[c.key] + 40 : stickyOffsets[c.key]) : undefined;
        const dataColStyle = getColumnStyle(c.key);
        const isSticky = c.stickyLeft || c.stickyRight;
        const cellBg = isSticky ? rowBgColor : (dataColStyle.bgColor ?? undefined);
        const isGroupEnd = groupEndKeys.has(c.key);
        const cellCls = cn(
          'px-2 py-1.5 border-b overflow-hidden',
          isGroupEnd ? 'border-r-2 border-r-slate-300' : 'border-r border-r-slate-200',
          c.align === 'right' ? 'text-right tabular-nums' : c.align === 'center' ? 'text-center' : 'text-left',
          c.stickyLeft && 'sticky z-10',
          c.stickyRight && 'sticky right-0 z-10 shadow-[-2px_0_4px_rgba(0,0,0,0.04)]',
        );
        const style: React.CSSProperties = {
          width: w,
          minWidth: w,
          maxWidth: w,
          ...(stickyL !== undefined ? { left: stickyL } : {}),
          ...(cellBg ? { backgroundColor: cellBg } : {}),
          ...(typography.applyToData ? {
            fontSize: `${typography.fontSize}px`,
            fontWeight: typography.fontWeight,
            color: typography.color,
          } : {}),
          ...(dataColStyle.fontSize !== undefined ? { fontSize: `${dataColStyle.fontSize}px` } : {}),
          ...(dataColStyle.fontWeight !== undefined ? { fontWeight: dataColStyle.fontWeight } : {}),
          ...(dataColStyle.textColor ? { color: dataColStyle.textColor } : {}),
        };
        return (
          <td key={c.key} style={style} className={cellCls}>
            {renderDisplay(c.key, payment)}
          </td>
        );
      })}
    </tr>
  );
}

// ── Cell renderer (switch theo column key) ────────────────────────────────────

const EMPTY = <span className="text-slate-300">-</span>;

function renderDisplay(col: string, payment: PaymentRecord): React.ReactNode {
  const o = payment.order;
  switch (col) {
    case 'orderId':
      return o ? <Link href={`/orders/${o.id}`} className="font-medium text-sky-600 hover:underline">#{o.id}</Link> : EMPTY;
    case 'customerName':
      return <span>{o?.customerName || o?.customer?.name || '-'}</span>;
    case 'phone':
      return <span>{o?.customerPhone || o?.customer?.phone || '-'}</span>;
    case 'creator':
      // Nguoi tao payment (dong nay). Payment cu / import / webhook khong co -> fallback nguoi tao don.
      return <span>{payment.creator?.name || o?.creator?.name || '-'}</span>;
    case 'team':
      return o?.creator?.team?.name ? <span>{o.creator.team.name}</span> : EMPTY;
    case 'source':
      return o?.lead?.source?.name ? <span>{o.lead.source.name}</span> : EMPTY;
    case 'sourceGroup':
      return o?.lead?.group?.name ? <span>{o.lead.group.name}</span> : EMPTY;
    case 'product':
      return <span>{o?.product?.name || '-'}</span>;
    case 'productGroup':
      return o?.productGroup?.name ? <span>{o.productGroup.name}</span> : EMPTY;
    case 'orderFormat':
      return o?.orderFormat?.name ? <span>{o.orderFormat.name}</span> : EMPTY;
    case 'listPrice':
      // Giá bán niêm yết = giá của sản phẩm (product.price), KHÔNG phải tổng giá trị đơn.
      return o?.product?.price != null ? <>{formatVND(Number(o.product.price))}</> : EMPTY;
    case 'installment':
      return payment.installment?.name
        ? <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">{payment.installment.name}</span>
        : EMPTY;
    case 'amount':
      return <span className="font-medium">{formatVND(Number(payment.amount))}</span>;
    case 'vatRate':
      return o?.vatRate != null ? <>{Number(o.vatRate)}%</> : EMPTY;
    case 'vatAmount': {
      if (o?.vatRate == null) return EMPTY;
      // Số CK đã bao gồm VAT -> tách phần VAT nằm trong số tiền.
      const rate = Number(o.vatRate);
      const vat = Math.round(Number(payment.amount) * rate / (100 + rate));
      return <span className="text-slate-500">{formatVND(vat)}</span>;
    }
    case 'netRevenue': {
      const amount = Number(payment.amount);
      const rate = o?.vatRate != null ? Number(o.vatRate) : 0;
      // Số CK đã bao gồm VAT -> DT thuần = số tiền trừ phần VAT nằm trong đó.
      const net = amount - Math.round(amount * rate / (100 + rate));
      return <span className="font-medium text-emerald-700">{formatVND(net)}</span>;
    }
    case 'completionRate': {
      const rate = payment.completionRate != null ? Number(payment.completionRate) : null;
      if (rate == null) return EMPTY;
      const color = rate >= 100 ? '#16a34a' : '#d97706';
      const barColor = rate >= 100 ? '#16a34a' : '#f59e0b';
      return (
        <div className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color }}>
          <div className="w-12 h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.min(rate, 100)}%`, backgroundColor: barColor }} />
          </div>
          {rate}%
        </div>
      );
    }
    case 'transferDate':
      return payment.transferDate
        ? <span className="text-xs text-slate-500">{formatDateTime(payment.transferDate)}</span>
        : (payment.createdAt ? <span className="text-xs text-slate-400">{formatDateTime(payment.createdAt)}</span> : EMPTY);
    case 'paymentType':
      return payment.paymentType?.name ? <span>{payment.paymentType.name}</span> : EMPTY;
    case 'bankAccount':
      return payment.bankAccount?.name ? <span>{payment.bankAccount.name}</span> : EMPTY;
    case 'transferContent':
      return payment.transferContent
        ? <span className="block truncate text-xs text-slate-500" title={payment.transferContent}>{payment.transferContent}</span>
        : EMPTY;
    case 'status':
      return <StatusBadge status={payment.status} />;
    case 'verifier':
      return payment.verifier?.name ? <span className="text-xs text-emerald-600">{payment.verifier.name}</span> : EMPTY;
    case 'notes':
      return payment.notes
        ? <span className="block truncate text-xs text-slate-500" title={payment.notes}>{payment.notes}</span>
        : EMPTY;
    case 'companyName':
      return o?.companyName ? <span>{o.companyName}</span> : EMPTY;
    case 'taxCode':
      return o?.taxCode ? <span>{o.taxCode}</span> : EMPTY;
    case 'vatEmail':
      return o?.vatEmail ? <span className="text-xs">{o.vatEmail}</span> : EMPTY;
    case 'address':
      return o?.address
        ? <span className="block truncate text-xs text-slate-500" title={o.address}>{o.address}</span>
        : EMPTY;
    case 'actions':
      return <PaymentRowActions payment={payment} />;
    default:
      return null;
  }
}

/**
 * Action buttons cho 1 row payment trong /orders table.
 * - Eye: vào order detail (ai cũng thấy)
 * - MANAGER+: Pencil mở EditOrderDialog (sửa đơn + payment). SUPER_ADMIN thêm Trash xoá hẳn.
 * - USER/LEADER: Pencil sửa + Trash huỷ CHỈ khi payment PENDING do chính mình tạo.
 */
function PaymentRowActions({ payment }: { payment: PaymentRecord }) {
  const router = useRouter();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isManager = user?.role === 'MANAGER' || isSuperAdmin;
  // USER/LEADER: chỉ sửa/huỷ payment DO CHÍNH MÌNH tạo và CÒN PENDING (backend enforce lại).
  const isMinePending =
    payment.status === 'PENDING' &&
    payment.createdBy != null &&
    String(payment.createdBy) === String(user?.id);
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editPaymentOpen, setEditPaymentOpen] = useState(false);

  if (!payment.order) return null;

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/payments/${payment.id}`);
      toast.success('Đã xoá thanh toán');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi xoá thanh toán');
    } finally {
      setDeleting(false);
    }
  }

  // USER/LEADER huỷ payment PENDING của mình: POST /cancel (xoá thẳng bản ghi PENDING).
  async function handleCancel() {
    setDeleting(true);
    try {
      await api.post(`/payments/${payment.id}/cancel`, {});
      toast.success('Đã huỷ thanh toán');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi huỷ thanh toán');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="inline-flex items-center justify-center gap-0.5">
      <Link
        href={`/orders/${payment.order.id}`}
        className="inline-flex items-center justify-center rounded p-1 text-sky-600 hover:bg-sky-100"
        title="Xem chi tiết"
        onClick={(e) => e.stopPropagation()}
      >
        <Eye className="h-4 w-4" />
      </Link>
      {isManager && (
        <span onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center justify-center rounded p-1 text-slate-400 hover:bg-amber-50 hover:text-amber-600"
            title="Sửa đơn + thanh toán"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <EditOrderDialog
            orderId={payment.order.id}
            paymentId={String(payment.id)}
            open={editOpen}
            onOpenChange={setEditOpen}
            onSuccess={() => router.refresh()}
          />
        </span>
      )}
      {/* USER/LEADER: sửa + huỷ payment PENDING do chính mình tạo (không phải manager). */}
      {!isManager && isMinePending && (
        <span onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setEditPaymentOpen(true)}
            className="inline-flex items-center justify-center rounded p-1 text-slate-400 hover:bg-amber-50 hover:text-amber-600"
            title="Sửa thanh toán"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <EditPaymentOnlyDialog
            paymentId={String(payment.id)}
            open={editPaymentOpen}
            onOpenChange={setEditPaymentOpen}
            onSuccess={() => router.refresh()}
          />
          <ConfirmDialog
            trigger={
              <button
                type="button"
                disabled={deleting}
                className="inline-flex items-center justify-center rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                title="Huỷ thanh toán"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            }
            title="Huỷ thanh toán"
            description={`Huỷ thanh toán ${formatVND(Number(payment.amount))} đang chờ xác nhận? Bản ghi sẽ bị xoá.`}
            confirmLabel="Huỷ thanh toán"
            onConfirm={handleCancel}
            isLoading={deleting}
          />
        </span>
      )}
      {isSuperAdmin && (
        <span onClick={(e) => e.stopPropagation()}>
          <ConfirmDialog
            trigger={
              <button
                type="button"
                disabled={deleting}
                className="inline-flex items-center justify-center rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                title="Xoá thanh toán"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            }
            title="Xoá thanh toán"
            description={
              payment.status === 'VERIFIED'
                ? `Xoá thanh toán ${formatVND(Number(payment.amount))} đã VERIFIED? Bank transaction match sẽ revert. Lead status KHÔNG revert.`
                : `Xoá thanh toán ${formatVND(Number(payment.amount))} (${payment.status})?`
            }
            confirmLabel="Xoá"
            onConfirm={handleDelete}
            isLoading={deleting}
          />
        </span>
      )}
    </div>
  );
}
