'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { EditPaymentSection, type PaymentEditValue } from '@/components/orders/edit-payment-section';
import { api } from '@/lib/api-client';
import type { PaymentRecord } from '@/types/entities';

interface Props {
  paymentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const EMPTY: PaymentEditValue = {
  installmentId: '', amount: '', transferDate: '', paymentTypeId: '',
  bankAccountId: '', transferContent: '', notes: '', status: 'PENDING',
};

/** YYYY-MM-DD cho input type=date. */
function toDateInput(d: string | Date | null | undefined): string {
  if (!d) return '';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '' : dt.toISOString().slice(0, 10);
}

/**
 * Dialog sửa CHỈ thông tin thanh toán (không đụng tới đơn hàng) - dành cho USER/LEADER
 * tự sửa payment PENDING do chính mình tạo. Backend enforce quyền + trạng thái PENDING;
 * dialog này chỉ gửi diff các field payment. MANAGER+ dùng EditOrderDialog (gộp đơn + payment).
 */
export function EditPaymentOnlyDialog({ paymentId, open, onOpenChange, onSuccess }: Props) {
  const [value, setValue] = useState<PaymentEditValue>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const originalRef = useRef<PaymentEditValue>(EMPTY);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.get<{ data: PaymentRecord }>(`/payments/${paymentId}`)
      .then((r) => {
        const p = r.data;
        const v: PaymentEditValue = {
          installmentId: p.installmentId ?? p.installment?.id ?? '',
          amount: p.amount != null ? String(p.amount) : '',
          transferDate: toDateInput(p.transferDate),
          paymentTypeId: p.paymentType?.id ?? '',
          bankAccountId: p.bankAccount?.id ?? '',
          transferContent: p.transferContent ?? '',
          notes: p.notes ?? '',
          status: p.status ?? 'PENDING',
        };
        originalRef.current = v;
        setValue(v);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Lỗi tải thanh toán'))
      .finally(() => setLoading(false));
  }, [open, paymentId]);

  const patch = (p: Partial<PaymentEditValue>) => setValue((prev) => ({ ...prev, ...p }));

  async function handleSubmit() {
    // Chỉ gửi field payment thực sự đổi so với bản gốc.
    const orig = originalRef.current;
    const body: Record<string, unknown> = {};
    if (value.installmentId !== orig.installmentId) body.installmentId = value.installmentId;
    if (value.transferDate !== orig.transferDate && value.transferDate) body.transferDate = value.transferDate;
    if (value.paymentTypeId !== orig.paymentTypeId) body.paymentTypeId = value.paymentTypeId;
    if (value.bankAccountId !== orig.bankAccountId) body.bankAccountId = value.bankAccountId;
    if (value.transferContent !== orig.transferContent) body.transferContent = value.transferContent;
    if (value.notes !== orig.notes) body.notes = value.notes;
    // amount chỉ gửi khi PENDING (BE khoá) + có đổi.
    if (value.status === 'PENDING' && value.amount !== orig.amount) {
      body.amount = Number(value.amount) || 0;
    }

    if (Object.keys(body).length === 0) {
      toast.info('Không có thay đổi nào');
      onOpenChange(false);
      return;
    }

    setSubmitting(true);
    try {
      await api.patch(`/payments/${paymentId}`, body);
      toast.success('Đã cập nhật thanh toán');
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Lỗi cập nhật');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Sửa thanh toán #{paymentId}</DialogTitle></DialogHeader>
        {loading ? (
          <p className="py-8 text-center text-sm text-slate-400">Đang tải...</p>
        ) : (
          <div className="py-2">
            <EditPaymentSection value={value} onChange={patch} />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Hủy</Button>
          <Button onClick={handleSubmit} disabled={submitting || loading}>
            {submitting ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
