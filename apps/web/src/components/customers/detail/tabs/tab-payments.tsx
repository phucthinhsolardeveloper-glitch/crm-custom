import Link from 'next/link';
import type { OrderRecord } from '@/types/entities';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDate, formatVND } from '@/lib/utils';

/**
 * Tab Payment - simplified view. Hiển thị orders với amount + status.
 * Quản lý payment chi tiết (verify/reject/match) ở trang Order detail.
 * Theo memory rule: chỉ SUPER_ADMIN verify payments, MANAGER tạo order.
 */
export function TabPayments({ orders }: { orders: OrderRecord[] }) {
  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
        <div className="text-4xl mb-2">💳</div>
        <div className="text-sm font-semibold text-slate-700">Chưa có giao dịch</div>
      </div>
    );
  }

  const totalAmount = orders.reduce((s, o) => s + Number(o.totalAmount ?? 0), 0);
  const paidAmount = orders
    .filter((o) => o.status === 'COMPLETED')
    .reduce((s, o) => s + Number(o.totalAmount ?? 0), 0);
  const pendingCount = orders.filter((o) => o.status === 'PENDING').length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <SummaryCard label="Tổng giá trị" value={formatVND(totalAmount)} />
        <SummaryCard label="Đã thanh toán" value={formatVND(paidAmount)} accent="emerald" />
        <SummaryCard label="Chờ xử lý" value={`${pendingCount} đơn`} accent={pendingCount > 0 ? 'amber' : undefined} />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
        {orders.map((order) => (
          <Link
            key={order.id}
            href={`/orders/${order.id}`}
            className="flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors"
          >
            <span className="font-mono text-xs text-slate-500 w-16 shrink-0">#{order.id}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-800 truncate">
                {(order as { product?: { name?: string } }).product?.name ?? 'Đơn hàng'}
              </div>
              <div className="text-xs text-slate-500">{formatDate(order.createdAt)}</div>
            </div>
            <span className="text-sm font-bold text-slate-900 shrink-0">
              {formatVND(Number(order.totalAmount))}
            </span>
            <StatusBadge status={order.status} />
          </Link>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'emerald' | 'amber';
}) {
  const colorClass =
    accent === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : accent === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-slate-200 bg-white text-slate-900';
  return (
    <div className={`rounded-2xl border p-3.5 shadow-sm ${colorClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider opacity-75">{label}</div>
      <div className="mt-1 text-lg font-extrabold">{value}</div>
    </div>
  );
}
