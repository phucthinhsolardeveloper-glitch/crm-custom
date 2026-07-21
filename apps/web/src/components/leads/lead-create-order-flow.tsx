'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CreateOrderDialog } from '@/components/orders/create-order-dialog';
import { CreatePaymentDialog } from '@/components/payments/create-payment-dialog';
import { api } from '@/lib/api-client';
import { formatVND } from '@/lib/utils';
import { ShoppingCart, CreditCard, Loader2 } from 'lucide-react';
import type { OrderRecord } from '@/types/entities';

type FlowStep = 'loading' | 'choose' | 'create-order' | 'add-payment';

interface Props {
  /** Không có (lead chưa convert) -> bỏ qua bước check đơn, mở thẳng tạo đơn mới. */
  customerId?: string;
  /** Không có (mở từ trang customer) -> CreateOrderDialog ẩn phần upload tài liệu lead. */
  leadId?: string;
  leadName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /** Giá trị map sẵn cho CreateOrderDialog (vd từ lead khi gán nhãn chốt đơn). */
  defaultProductId?: string;
  defaultCustomerName?: string;
  defaultCustomerPhone?: string;
}

interface UnpaidOrder {
  id: string;
  totalAmount: number;
  paidAmount: number;
  productName?: string;
  vatRate: number;
  larkSyncId?: string;
}

/**
 * Multi-step flow khi sale bấm "Tạo đơn hàng" từ lead action menu.
 *
 * Flow:
 * 1. Fetch orders cho customer
 * 2. Nếu không có / tất cả đã TT full → mở CreateOrderDialog
 * 3. Nếu có đơn chưa TT full → hiện dialog chọn: thêm TT hoặc tạo đơn mới
 * 4. Mỗi step có nút quay lại
 */
export function LeadCreateOrderFlow({
  customerId, leadId, leadName, open, onOpenChange, onSuccess,
  defaultProductId, defaultCustomerName, defaultCustomerPhone,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<FlowStep>('loading');
  const [unpaidOrder, setUnpaidOrder] = useState<UnpaidOrder | null>(null);

  // Dialog flags cho CreateOrderDialog và CreatePaymentDialog.
  // Flow dialog (choose step) đóng khi mở 1 trong 2 dialog con.
  // Khi dialog con đóng mà chưa thành công → quay lại flow dialog.
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

  // Check orders khi flow dialog mở.
  useEffect(() => {
    if (!open) return;
    // Chưa có customer (lead chưa convert) -> chắc chắn chưa có đơn, mở tạo đơn mới luôn.
    if (!customerId) {
      onOpenChange(false);
      setOrderDialogOpen(true);
      return;
    }
    setStep('loading');
    setUnpaidOrder(null);

    // Endpoint chuyên dụng: trả về 1 đơn chưa thu đủ (hoặc null), KHÔNG scope theo role.
    // Đảm bảo USER cũng thấy đơn tồn của khách giống SUPER_ADMIN (tránh tạo trùng đơn).
    api.get<{ data: OrderRecord | null }>(`/orders/customer/${customerId}/unpaid-check`)
      .then(res => {
        const unpaid = res.data;
        // "Đã thu" = tổng VERIFIED+REJECTED (REJECTED là tiền có về) - khớp định nghĩa backend.
        const paidReal = (o: OrderRecord) => (o.payments || [])
          .filter(p => p.status === 'VERIFIED' || p.status === 'REJECTED')
          .reduce((sum, p) => sum + Number(p.amount), 0);

        if (unpaid) {
          const paid = paidReal(unpaid);
          setUnpaidOrder({
            id: unpaid.id,
            totalAmount: Number(unpaid.totalAmount),
            paidAmount: paid,
            productName: unpaid.product?.name,
            vatRate: Number(unpaid.vatRate) || 0,
            larkSyncId: unpaid.larkSyncId ?? undefined,
          });
          setStep('choose');
        } else {
          // Không có đơn chưa TT full → mở tạo đơn mới luôn.
          onOpenChange(false);
          setOrderDialogOpen(true);
        }
      })
      .catch(() => {
        // Lỗi fetch → fallback tạo đơn mới.
        onOpenChange(false);
        setOrderDialogOpen(true);
      });
  }, [open, customerId]);

  const handlePickPayment = useCallback(() => {
    onOpenChange(false);
    setPaymentDialogOpen(true);
  }, [onOpenChange]);

  const handlePickNewOrder = useCallback(() => {
    onOpenChange(false);
    setOrderDialogOpen(true);
  }, [onOpenChange]);

  // Khi dialog con đóng: nếu chưa thành công, quay lại flow dialog.
  function handleOrderDialogClose(nextOpen: boolean) {
    setOrderDialogOpen(nextOpen);
    if (!nextOpen && unpaidOrder) {
      // Quay lại choose step (user đóng dialog mà không tạo).
      onOpenChange(true);
      setStep('choose');
    }
  }

  function handlePaymentDialogClose(nextOpen: boolean) {
    setPaymentDialogOpen(nextOpen);
    if (!nextOpen && unpaidOrder) {
      onOpenChange(true);
      setStep('choose');
    }
  }

  function handleSuccess() {
    setOrderDialogOpen(false);
    setPaymentDialogOpen(false);
    onOpenChange(false);
    setUnpaidOrder(null);
    router.refresh();
    onSuccess?.();
  }

  const remaining = unpaidOrder
    ? Math.max(0, unpaidOrder.totalAmount - unpaidOrder.paidAmount)
    : 0;

  return (
    <>
      {/* Flow dialog - step choose */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tạo đơn hàng</DialogTitle>
            {leadName && <p className="text-xs text-slate-400">Lead: {leadName}</p>}
          </DialogHeader>

          {step === 'loading' && (
            <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Đang kiểm tra đơn hàng...</span>
            </div>
          )}

          {step === 'choose' && unpaidOrder && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Khách hàng có <strong>đơn hàng chưa thanh toán đầy đủ</strong>. Bạn muốn thêm thanh toán cho đơn này hay tạo đơn mới?
              </div>

              {/* Thông tin đơn hiện có */}
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-semibold text-slate-900">Đơn #{unpaidOrder.id}</span>
                  <span className="inline-flex rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-xs font-semibold">
                    Chưa đủ
                  </span>
                </div>
                {unpaidOrder.productName && (
                  <p className="text-xs text-slate-500 mb-2">{unpaidOrder.productName}</p>
                )}
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tổng tiền</span>
                    <span className="font-medium">{formatVND(unpaidOrder.totalAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Đã thanh toán</span>
                    <span className="font-medium text-emerald-600">{formatVND(unpaidOrder.paidAmount)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                    <span>Còn lại</span>
                    <span className="text-sky-600">{formatVND(remaining)}</span>
                  </div>
                </div>
              </div>

              {/* 2 options */}
              <button
                type="button"
                onClick={handlePickPayment}
                className="flex w-full items-center gap-4 rounded-xl border-2 border-slate-200 p-4 hover:border-sky-400 hover:bg-sky-50 transition-all text-left"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-100 to-cyan-100">
                  <CreditCard className="h-5 w-5 text-sky-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">Thêm thanh toán cho đơn này</p>
                  <p className="text-xs text-slate-500">Tạo giao dịch thanh toán cho Đơn #{unpaidOrder.id}</p>
                </div>
                <span className="text-slate-300 text-lg">&rsaquo;</span>
              </button>

              <button
                type="button"
                onClick={handlePickNewOrder}
                className="flex w-full items-center gap-4 rounded-xl border-2 border-slate-200 p-4 hover:border-sky-400 hover:bg-sky-50 transition-all text-left"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-100 to-cyan-100">
                  <ShoppingCart className="h-5 w-5 text-sky-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">Tạo đơn hàng mới</p>
                  <p className="text-xs text-slate-500">Tạo đơn hàng + thanh toán mới hoàn toàn</p>
                </div>
                <span className="text-slate-300 text-lg">&rsaquo;</span>
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* CreatePaymentDialog - khi user chọn "thêm TT cho đơn cũ" */}
      {unpaidOrder && (
        <CreatePaymentDialog
          orderId={unpaidOrder.id}
          open={paymentDialogOpen}
          onOpenChange={handlePaymentDialogClose}
          onSuccess={handleSuccess}
          vatRate={unpaidOrder.vatRate}
          orderSummary={{
            totalAmount: unpaidOrder.totalAmount,
            paidAmount: unpaidOrder.paidAmount,
            productName: unpaidOrder.productName,
          }}
          defaultLarkSyncId={unpaidOrder.larkSyncId}
        />
      )}

      {/* CreateOrderDialog - khi user chọn "tạo đơn mới" hoặc không có đơn chưa TT */}
      <CreateOrderDialog
        customerId={customerId}
        leadId={leadId}
        products={[]}
        open={orderDialogOpen}
        onOpenChange={handleOrderDialogClose}
        onSuccess={handleSuccess}
        defaultProductId={defaultProductId}
        defaultCustomerName={defaultCustomerName}
        defaultCustomerPhone={defaultCustomerPhone}
      />
    </>
  );
}
