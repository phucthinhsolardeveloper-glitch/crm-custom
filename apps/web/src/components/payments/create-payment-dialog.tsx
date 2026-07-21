'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FormField } from '@/components/shared/form-field';
import { useFormAction } from '@/hooks/use-form-action';
import { formatVND } from '@/lib/utils';
import { api } from '@/lib/api-client';
import { toast } from 'sonner';
import type { NamedEntity } from '@/types/entities';

/**
 * Dialog tạo payment cho 1 order CÓ SẴN - reusable.
 *
 * Dùng tại:
 * - Trang order detail (/orders/[id]) qua PaymentActions
 * - Flow tạo đơn từ leads (khi khách đã có đơn chưa thanh toán full)
 *
 * Tự load paymentTypes/installments/bankAccounts nếu không truyền qua props
 * (fallback an toàn khi component được mount ở nơi chưa prefetch data).
 */
interface OrderSummary {
  /** Tổng tiền đơn hàng (gồm VAT). */
  totalAmount: number;
  /** Đã thanh toán (tổng các payment VERIFIED). */
  paidAmount: number;
  /** Tên sản phẩm hiển thị ở subtitle (tùy chọn). */
  productName?: string;
}

interface CreatePaymentDialogProps {
  orderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Callback sau khi tạo payment thành công (parent refresh data). */
  onSuccess?: () => void;
  /** Pre-fetched reference data. Nếu rỗng, component tự fetch khi mở. */
  paymentTypes?: NamedEntity[];
  paymentInstallments?: NamedEntity[];
  bankAccounts?: NamedEntity[];
  /** VAT rate của order để auto-tính tiền VAT từ số tiền thanh toán. */
  vatRate?: number;
  /** Tóm tắt đơn hàng để hiển thị tổng/đã TT/còn lại. */
  orderSummary?: OrderSummary;
  /** Bảng Lark mặc định = bảng của đơn cha. Payment có thể chọn bảng khác; để trống -> fallback bảng đơn. */
  defaultLarkSyncId?: string;
}

export function CreatePaymentDialog({
  orderId,
  open,
  onOpenChange,
  onSuccess,
  paymentTypes: propPaymentTypes = [],
  paymentInstallments: propInstallments = [],
  bankAccounts: propBankAccounts = [],
  vatRate = 0,
  orderSummary,
  defaultLarkSyncId = '',
}: CreatePaymentDialogProps) {
  const [paymentTypes, setPaymentTypes] = useState<NamedEntity[]>(propPaymentTypes);
  const [installments, setInstallments] = useState<NamedEntity[]>(propInstallments);
  const [bankAccounts, setBankAccounts] = useState<NamedEntity[]>(propBankAccounts);
  const [larkSyncOptions, setLarkSyncOptions] = useState<NamedEntity[]>([]);
  // Bảng Lark payment sẽ đổ về. Mặc định = bảng của đơn cha; user có thể đổi.
  const [larkSyncId, setLarkSyncId] = useState(defaultLarkSyncId);

  const [form, setForm] = useState({
    amount: '',
    paymentTypeId: '',
    bankAccountId: '',
    installmentId: '',
    transferDate: '',
    transferContent: '',
    notes: '',
  });

  const createAction = useFormAction({ successMessage: 'Đã tạo thanh toán' });

  // Số tiền còn lại - gợi ý default cho field amount.
  const remaining = orderSummary
    ? Math.max(0, orderSummary.totalAmount - orderSummary.paidAmount)
    : 0;

  // Self-load reference data khi mở dialog (chỉ fetch cái còn thiếu).
  useEffect(() => {
    if (!open) return;
    if (paymentTypes.length === 0) {
      api.get<{ data: NamedEntity[] }>('/payment-types')
        .then(r => setPaymentTypes((r.data || []).map(i => ({ id: String(i.id), name: i.name }))))
        .catch(() => {});
    }
    if (installments.length === 0) {
      api.get<{ data: NamedEntity[] }>('/payment-installments')
        .then(r => setInstallments((r.data || []).map(i => ({ id: String(i.id), name: i.name }))))
        .catch(() => {});
    }
    if (bankAccounts.length === 0) {
      api.get<{ data: NamedEntity[] }>('/bank-accounts')
        .then(r => setBankAccounts((r.data || []).map(i => ({ id: String(i.id), name: i.name }))))
        .catch(() => {});
    }
    if (larkSyncOptions.length === 0) {
      api.get<{ data: NamedEntity[] }>('/lark-sync/options')
        .then(r => setLarkSyncOptions((r.data || []).map(m => ({ id: String(m.id), name: m.name }))))
        .catch(() => {});
    }
    // Mở dialog: reset bảng Lark về mặc định của đơn cha đang chọn.
    setLarkSyncId(defaultLarkSyncId);
  }, [open]);

  function update(key: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  const amountNum = Number(form.amount);
  // VAT fix cứng theo vatRate của sản phẩm trên đơn - KHÔNG cho sửa tay.
  // Số CK đã bao gồm VAT -> tách phần VAT nằm trong số tiền (khớp create-order-dialog).
  const vatNum = vatRate > 0 && amountNum > 0
    ? Math.round(amountNum * vatRate / (100 + vatRate))
    : 0;

  async function handleCreate() {
    // Bắt buộc đủ: loại TT, đợt TT, nội dung CK (khớp validate backend) - thiếu là chặn ngay.
    if (!form.paymentTypeId) { toast.error('Vui lòng chọn Loại thanh toán'); return; }
    if (!form.installmentId) { toast.error('Vui lòng chọn Đợt thanh toán'); return; }
    if (!form.transferContent.trim()) { toast.error('Vui lòng nhập Nội dung chuyển khoản'); return; }

    // Không gửi vatAmount - server tự tính từ vatRate của đơn (fix cứng theo sản phẩm).
    const body: Record<string, unknown> = {
      orderId,
      amount: amountNum,
      paymentTypeId: form.paymentTypeId,
      installmentId: form.installmentId,
      transferContent: form.transferContent.trim(),
    };
    if (form.bankAccountId) body.bankAccountId = form.bankAccountId;
    if (form.transferDate) body.transferDate = form.transferDate;
    if (form.notes.trim()) body.notes = form.notes.trim();
    // Bảng Lark: gửi nếu có chọn; để trống -> backend fallback bảng của đơn.
    if (larkSyncId) body.larkSyncId = larkSyncId;

    const result = await createAction.execute('post', '/payments', body);
    if (result) {
      onOpenChange(false);
      setForm({ amount: '', paymentTypeId: '', bankAccountId: '', installmentId: '', transferDate: '', transferContent: '', notes: '' });
      setLarkSyncId(defaultLarkSyncId);
      onSuccess?.();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Thêm thanh toán</DialogTitle>
          {orderSummary?.productName && (
            <p className="text-xs text-slate-400">Đơn hàng #{orderId} - {orderSummary.productName}</p>
          )}
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Tóm tắt số tiền đơn hàng */}
          {orderSummary && (
            <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">Tổng đơn hàng</span><span className="font-medium">{formatVND(orderSummary.totalAmount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Đã thanh toán</span><span className="font-medium text-emerald-600">{formatVND(orderSummary.paidAmount)}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold"><span>Còn lại</span><span className="text-sky-600">{formatVND(remaining)}</span></div>
            </div>
          )}

          <FormField label="Số tiền (VNĐ)" required>
            <MoneyInput
              value={form.amount}
              onChange={d => update('amount', d)}
              placeholder={remaining > 0 ? `Còn lại: ${formatVND(remaining)}` : '1.000.000'}
            />
          </FormField>

          {/* VAT fix cứng theo sản phẩm của đơn - chỉ hiển thị, không sửa được */}
          {vatRate > 0 && amountNum > 0 && (
            <FormField label={`Tiền VAT (${vatRate}% - tính từ số CK)`}>
              <Input value={formatVND(vatNum)} readOnly className="bg-slate-50 text-slate-600" />
            </FormField>
          )}

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Loại thanh toán" required>
              <Select value={form.paymentTypeId} onValueChange={v => update('paymentTypeId', v)}>
                <SelectTrigger><SelectValue placeholder="Chọn loại" /></SelectTrigger>
                <SelectContent>
                  {paymentTypes.map(pt => <SelectItem key={pt.id} value={pt.id}>{pt.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Đợt thanh toán" required>
              <Select value={form.installmentId} onValueChange={v => update('installmentId', v)}>
                <SelectTrigger><SelectValue placeholder="Chọn đợt" /></SelectTrigger>
                <SelectContent>
                  {installments.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          {bankAccounts.length > 0 && (
            <FormField label="Tài khoản ngân hàng">
              <Select value={form.bankAccountId} onValueChange={v => update('bankAccountId', v)}>
                <SelectTrigger><SelectValue placeholder="Chọn tài khoản" /></SelectTrigger>
                <SelectContent>
                  {bankAccounts.map(ba => <SelectItem key={ba.id} value={ba.id}>{ba.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
          )}

          {larkSyncOptions.length > 0 && (
            <FormField label="Đổ về bảng Lark">
              <Select value={larkSyncId} onValueChange={setLarkSyncId}>
                <SelectTrigger><SelectValue placeholder="Chọn bảng (mặc định bảng của đơn)" /></SelectTrigger>
                <SelectContent>
                  {larkSyncOptions.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
          )}

          <FormField label="Ngày chuyển khoản" required>
            <Input
              type="date"
              value={form.transferDate}
              onChange={e => update('transferDate', e.target.value)}
              required
            />
          </FormField>

          <FormField label="Nội dung chuyển khoản" required>
            <Input
              value={form.transferContent}
              onChange={e => update('transferContent', e.target.value)}
              placeholder="VD: CK LAN 1 NGUYEN VAN A"
              required
            />
          </FormField>

          <FormField label="Ghi chú">
            <Textarea
              value={form.notes}
              onChange={e => update('notes', e.target.value)}
              placeholder="Ghi chú thanh toán (tùy chọn)"
              rows={2}
            />
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button
            onClick={handleCreate}
            disabled={!form.amount || !form.transferDate || !form.paymentTypeId || !form.installmentId || !form.transferContent.trim() || createAction.isLoading}
          >
            {createAction.isLoading ? 'Đang tạo...' : 'Tạo thanh toán'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
