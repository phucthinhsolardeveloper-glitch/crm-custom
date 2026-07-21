import Link from 'next/link';
import { Package } from 'lucide-react';
import type { OrderRecord } from '@/types/entities';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDate, formatCompactMoney } from '@/lib/utils';

interface Props {
  customerId: string;
  orders: OrderRecord[];
}

export function OrdersMiniCard({ customerId, orders }: Props) {
  const recent = orders.slice(0, 3);
  const totalCount = orders.length;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm h-full transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between mb-2">
        <h5 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          <Package className="h-4 w-4 text-sky-600" /> Đơn hàng gần đây
        </h5>
        {totalCount > 3 && (
          <Link
            href={`/customers/${customerId}?tab=orders`}
            className="text-xs font-semibold text-sky-600 hover:underline"
          >
            Xem tất cả {totalCount}
          </Link>
        )}
      </div>
      {recent.length === 0 ? (
        <p className="text-xs text-slate-500">Chưa có đơn hàng</p>
      ) : (
        <ul className="space-y-1.5">
          {recent.map((order) => (
            <li key={order.id}>
              <Link
                href={`/orders/${order.id}`}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <span className="font-mono text-[11px] text-slate-500 shrink-0">#{order.id}</span>
                <span className="text-xs text-slate-600 truncate flex-1">
                  {formatDate(order.createdAt)}
                </span>
                <span className="text-xs font-bold text-slate-900 shrink-0">
                  {formatCompactMoney(Number(order.totalAmount))}
                </span>
                <StatusBadge status={order.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
