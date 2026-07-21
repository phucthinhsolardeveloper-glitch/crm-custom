import { serverFetch } from '@/lib/auth';
import type { OrderRecord, NamedEntity } from '@/types/entities';
import { StatusBadge } from '@/components/shared/status-badge';
import { OrderActions } from '@/components/orders/order-actions';
import { PaymentActions } from '@/components/payments/payment-actions';
import { formatDate, formatVND } from '@/lib/utils';
import { notFound } from 'next/navigation';
import { BackButton } from '@/components/shared/back-button';

/** Order detail: info + actions + payments with CRUD. */
export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let orderData: OrderRecord | undefined;
  let paymentTypes: NamedEntity[] = [];
  let paymentInstallments: NamedEntity[] = [];
  let bankAccounts: NamedEntity[] = [];

  try {
    [orderData, paymentTypes, paymentInstallments, bankAccounts] = await Promise.all([
      serverFetch<{ data: OrderRecord }>(`/orders/${id}`).then(r => r.data),
      serverFetch<{ data: NamedEntity[] }>('/payment-types').then(r => r.data).catch(() => []),
      serverFetch<{ data: NamedEntity[] }>('/payment-installments').then(r => r.data).catch(() => []),
      serverFetch<{ data: NamedEntity[] }>('/bank-accounts').then(r => r.data).catch(() => []),
    ]);
  } catch {
    notFound();
  }

  const order = orderData as OrderRecord;

  return (
    <div className="space-y-6">
      <BackButton />
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Đơn hàng #{order.id}</h1>
          <p className="text-slate-500">{order.customer?.name} - {order.customer?.phone}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* Actions */}
      <OrderActions order={order!} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Order Details */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-3 font-semibold text-slate-900">Chi tiết</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Sản phẩm</dt><dd className="text-slate-700">{order.product?.name || '-'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Giá</dt><dd className="text-slate-700">{formatVND(Number(order.amount))}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">VAT ({order.vatRate}%)</dt><dd className="text-slate-700">{formatVND(Number(order.vatAmount))}</dd></div>
            <div className="flex justify-between border-t border-slate-100 pt-2"><dt className="font-medium text-slate-700">Tổng</dt><dd className="font-bold text-slate-900">{formatVND(Number(order.totalAmount))}</dd></div>
            {order.orderFormat && (
              <div className="flex justify-between"><dt className="text-slate-500">Hình thức</dt><dd className="text-slate-700">{order.orderFormat.name}</dd></div>
            )}
            {order.productGroup && (
              <div className="flex justify-between"><dt className="text-slate-500">Nhóm sản phẩm</dt><dd className="text-slate-700">{order.productGroup.name}</dd></div>
            )}
            {order.vatEmail && (
              <div className="flex justify-between"><dt className="text-slate-500">Mail nhận VAT</dt><dd className="text-slate-700">{order.vatEmail}</dd></div>
            )}
            <div className="flex justify-between"><dt className="text-slate-500">Người tạo</dt><dd className="text-slate-700">{order.creator?.name}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Ngày tạo</dt><dd className="text-slate-700">{formatDate(order.createdAt)}</dd></div>
            {order.notes && (
              <div className="border-t border-slate-100 pt-2">
                <dt className="text-slate-500 mb-1">Ghi chú</dt>
                <dd className="text-slate-700">{order.notes}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Payments with CRUD */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <PaymentActions
            orderId={order.id}
            payments={order.payments || []}
            paymentTypes={paymentTypes}
            paymentInstallments={paymentInstallments}
            bankAccounts={bankAccounts}
            vatRate={order.vatRate}
            orderTotalAmount={Number(order.totalAmount)}
            productName={order.product?.name}
            orderCreatedById={order.creator?.id}
            orderLarkSyncId={order.larkSyncId ?? undefined}
          />
        </div>
      </div>
    </div>
  );
}
