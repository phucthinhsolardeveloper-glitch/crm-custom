import type { CustomerRecord, OrderRecord } from '@/types/entities';

export interface CustomerKpi {
  /** Tổng số đơn (mọi status, không filter COMPLETED). */
  totalOrders: number;
  /** Số đơn tạo trong tháng hiện tại (mọi status). */
  ordersThisMonth: number;
  /** Tổng doanh thu = sum order.totalAmount (mọi status, không filter verified). */
  totalRevenue: number;
}

// User intent: "có đơn là tính, có payment là tính" - đếm/tổng tất cả không filter status.
// Verified vs pending là chuyện của bookkeeping, KPI overview cần con số "raw" cho sale nhìn nhanh.
export function calcCustomerKpi(customer: CustomerRecord): CustomerKpi {
  const orders = customer.orders ?? [];
  const totalRevenue = orders.reduce((s, o) => s + Number(o.totalAmount ?? 0), 0);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const ordersThisMonth = orders.filter(
    (o) => new Date(o.createdAt) >= startOfMonth,
  ).length;

  return { totalOrders: orders.length, ordersThisMonth, totalRevenue };
}

/** Tính tổng đơn count (mọi status, chưa xóa) - dùng cho tab badge. */
export function countActiveOrders(orders: OrderRecord[] | undefined): number {
  return orders?.length ?? 0;
}
