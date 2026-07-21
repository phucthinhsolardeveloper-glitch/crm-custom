'use client';

import { useMemo } from 'react';
import { LeadColumnsProvider, useLeadColumns } from '@/components/leads/lead-columns-context';
import { LeadTableExcelColumnToggle } from '@/components/leads/lead-table-excel-column-toggle';
import {
  PaymentTableExcel,
  buildPaymentColumns,
  ORDER_COLUMNS_STORAGE_KEY,
  ORDER_TYPOGRAPHY_STORAGE_KEY,
  ORDER_COLUMN_STYLES_STORAGE_KEY,
  ORDER_ROW_STYLES_STORAGE_KEY,
} from '@/components/orders/payment-table-excel';
import { BulkDeleteBar } from '@/components/shared/bulk-delete-bar';
import { useBulkSelection } from '@/hooks/use-bulk-selection';
import { useAuth } from '@/providers/auth-provider';
import type { PaymentRecord } from '@/types/entities';

interface Props {
  payments: PaymentRecord[];
  totals?: { amount: number; vatAmount: number; netRevenue: number };
}

/**
 * Client wrapper: bọc PaymentTableExcel trong LeadColumnsProvider (storage keys riêng cho /orders)
 * + render Setting toggle + bulk delete cho SUPER_ADMIN. Page.tsx (RSC) fetch /payments rồi truyền xuống.
 *
 * Bulk delete: SUPER_ADMIN only. Endpoint /payments/bulk-delete (max 500 IDs/lần).
 * Cảnh báo: payment VERIFIED khi bulk delete sẽ revert bank tx match, KHÔNG revert lead status.
 */
export function OrderTableWithSettings({ payments, totals }: Props) {
  const { columnDefaults } = useMemo(() => buildPaymentColumns(), []);

  return (
    <LeadColumnsProvider
      storageKey={ORDER_COLUMNS_STORAGE_KEY}
      typographyKey={ORDER_TYPOGRAPHY_STORAGE_KEY}
      columnStylesKey={ORDER_COLUMN_STYLES_STORAGE_KEY}
      rowStylesKey={ORDER_ROW_STYLES_STORAGE_KEY}
      columnDefaults={columnDefaults}
    >
      <InnerTable payments={payments} totals={totals} />
    </LeadColumnsProvider>
  );
}

function InnerTable({ payments, totals }: Props) {
  const { isVisible, toggleVisible, resetAll, order, setOrder } = useLeadColumns();
  const { toggleableColumns } = useMemo(() => buildPaymentColumns(), []);
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  // useBulkSelection cần items có id: string. Map PaymentRecord.id -> string một lần.
  const selectableItems = useMemo(() => payments.map((p) => ({ id: String(p.id) })), [payments]);
  const selection = useBulkSelection(selectableItems);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-2">
        <LeadTableExcelColumnToggle
          columns={toggleableColumns}
          isVisible={isVisible}
          onToggle={toggleVisible}
          onReset={resetAll}
          order={order}
          onReorder={setOrder}
        />
      </div>

      <PaymentTableExcel
        payments={payments}
        totals={totals}
        enableSelection={isSuperAdmin}
        selectedIds={selection.selected}
        onToggleOne={selection.toggleOne}
        onToggleAll={selection.toggleAll}
        allSelected={selection.allSelected}
        someSelected={selection.someSelected}
      />

      {isSuperAdmin && (
        <BulkDeleteBar
          count={selection.count}
          ids={selection.selectedIds}
          endpoint="/payments/bulk-delete"
          entityLabel="thanh toán"
          onClear={selection.clear}
          hint="Payment VERIFIED sẽ revert bank transaction match (lead status KHÔNG revert)."
        />
      )}
    </div>
  );
}
