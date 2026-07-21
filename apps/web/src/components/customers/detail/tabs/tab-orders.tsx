import type { OrderRecord } from '@/types/entities';
import { CustomerOrderList } from '@/components/customers/customer-order-list';

/**
 * Tab Đơn hàng - re-use existing CustomerOrderList full table.
 * Filter / sort UI sẽ thêm ở iteration sau (YAGNI - existing list đã có pagination + status).
 */
export function TabOrders({ orders }: { orders: OrderRecord[] }) {
  if (orders.length === 0) {
    return (
      <EmptyTab message="Chưa có đơn hàng" />
    );
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <CustomerOrderList orders={orders as unknown as Parameters<typeof CustomerOrderList>[0]['orders']} />
    </div>
  );
}

function EmptyTab({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
      <div className="text-4xl mb-2">📭</div>
      <div className="text-sm font-semibold text-slate-700">{message}</div>
    </div>
  );
}
