'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FormField } from '@/components/shared/form-field';
import { ProductCombobox } from '@/components/ui/product-combobox';
import { EditPaymentSection, type PaymentEditValue } from '@/components/orders/edit-payment-section';
import { useProducts } from '@/hooks/use-products';
import { api } from '@/lib/api-client';
import { formatVND } from '@/lib/utils';
import { toast } from 'sonner';
import type { NamedEntity, OrderRecord, PaymentRecord } from '@/types/entities';

interface EditOrderDialogProps {
  orderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nếu truyền, dialog sửa thêm thông tin THANH TOÁN của payment này (PATCH /payments). */
  paymentId?: string;
  /** Gọi sau khi lưu thành công (parent refresh data). */
  onSuccess?: () => void;
}

/** Đổi Date/ISO -> YYYY-MM-DD cho input date. */
function toDateInput(d: string | Date | null | undefined): string {
  if (!d) return '';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '' : dt.toISOString().slice(0, 10);
}

const EMPTY_PAYMENT: PaymentEditValue = {
  installmentId: '', amount: '', transferDate: '', paymentTypeId: '',
  bankAccountId: '', transferContent: '', notes: '', status: 'PENDING',
};

/**
 * Dialog sửa thông tin đơn hàng (MANAGER+). Fetch GET /orders/:id khi mở để prefill,
 * submit PATCH /orders/:id. Chỉ sửa thông tin ĐƠN (sản phẩm, giá, hình thức, nhóm SP,
 * thông tin xuất VAT, STT, mã khoá, ghi chú) - không đụng các lần thanh toán.
 */
export function EditOrderDialog({ orderId, open, onOpenChange, paymentId, onSuccess }: EditOrderDialogProps) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Payment fields (chỉ dùng khi có paymentId). Giữ bản gốc để so sánh -> chỉ PATCH khi đổi.
  const [payment, setPayment] = useState<PaymentEditValue>(EMPTY_PAYMENT);
  const originalPaymentRef = useRef<PaymentEditValue>(EMPTY_PAYMENT);
  const patchPayment = (patch: Partial<PaymentEditValue>) => setPayment((prev) => ({ ...prev, ...patch }));

  const { products } = useProducts(open);
  const [orderFormats, setOrderFormats] = useState<NamedEntity[]>([]);
  const [productGroups, setProductGroups] = useState<NamedEntity[]>([]);

  // Order fields
  const [productId, setProductId] = useState('');
  const [amount, setAmount] = useState('');
  const [formatId, setFormatId] = useState('');
  const [productGroupId, setProductGroupId] = useState('');
  const [stt, setStt] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [vatEmail, setVatEmail] = useState('');
  const [notes, setNotes] = useState('');
  // vatRate gốc của đơn - dùng khi user không đổi sản phẩm.
  const [originalVatRate, setOriginalVatRate] = useState(0);
  // Snapshot giá trị order lúc mở -> chỉ PATCH /orders khi có field order thực sự đổi
  // (tránh ghi thừa + recompute khi user chỉ sửa thanh toán).
  const orderSnapshotRef = useRef<Record<string, string>>({});

  // Fetch order detail + lookup lists khi mở dialog.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.get<{ data: OrderRecord }>(`/orders/${orderId}`)
      .then((r) => {
        const o = r.data;
        setProductId(o.product?.id ?? '');
        setAmount(o.amount != null ? String(o.amount) : '');
        setFormatId(o.formatId ?? o.orderFormat?.id ?? '');
        setProductGroupId(o.productGroupId ?? o.productGroup?.id ?? '');
        setStt(o.stt ?? '');
        setCourseCode(o.courseCode ?? '');
        setCompanyName(o.companyName ?? '');
        setTaxCode(o.taxCode ?? '');
        setContactPerson(o.contactPerson ?? '');
        setCustomerName(o.customerName ?? '');
        setCustomerPhone(o.customerPhone ?? '');
        setAddress(o.address ?? '');
        setVatEmail(o.vatEmail ?? '');
        setNotes(o.notes ?? '');
        setOriginalVatRate(Number(o.vatRate ?? 0));
        orderSnapshotRef.current = {
          productId: o.product?.id ?? '',
          amount: o.amount != null ? String(o.amount) : '',
          formatId: o.formatId ?? o.orderFormat?.id ?? '',
          productGroupId: o.productGroupId ?? o.productGroup?.id ?? '',
          stt: o.stt ?? '', courseCode: o.courseCode ?? '',
          companyName: o.companyName ?? '', taxCode: o.taxCode ?? '',
          contactPerson: o.contactPerson ?? '', customerName: o.customerName ?? '',
          customerPhone: o.customerPhone ?? '', address: o.address ?? '',
          vatEmail: o.vatEmail ?? '', notes: o.notes ?? '',
        };
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Lỗi tải đơn hàng'))
      .finally(() => setLoading(false));

    api.get<{ data: NamedEntity[] }>('/order-formats')
      .then((r) => setOrderFormats((r.data || []).map((f) => ({ id: String(f.id), name: f.name })))).catch(() => {});
    api.get<{ data: NamedEntity[] }>('/product-groups')
      .then((r) => setProductGroups((r.data || []).map((g) => ({ id: String(g.id), name: g.name })))).catch(() => {});

    // Nạp thông tin payment nếu dialog mở kèm paymentId.
    if (paymentId) {
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
          originalPaymentRef.current = v;
          setPayment(v);
        })
        .catch((err) => toast.error(err instanceof Error ? err.message : 'Lỗi tải thanh toán'));
    }
  }, [open, orderId, paymentId]);

  // Đổi sản phẩm -> lấy vatRate mới; giữ nguyên thì dùng vatRate gốc của đơn.
  const selectedProduct = products.find((p) => p.id === productId);
  const vatRate = selectedProduct ? Number(selectedProduct.vatRate || 0) : originalVatRate;
  const amountNum = Number(amount) || 0;
  // Giá SP đã bao gồm VAT -> tách phần VAT nằm trong giá; tổng đúng bằng giá, không cộng thêm.
  const vatAmount = Math.round((amountNum * vatRate) / (100 + vatRate));
  const totalAmount = amountNum;

  async function handleSubmit() {
    // So field order hiện tại với snapshot -> chỉ PATCH order khi có thay đổi thật.
    const cur: Record<string, string> = {
      productId, amount, formatId, productGroupId, stt, courseCode, companyName,
      taxCode, contactPerson, customerName, customerPhone, address, vatEmail, notes,
    };
    const snap = orderSnapshotRef.current;
    const orderChanged = Object.keys(cur).some((k) => cur[k] !== (snap[k] ?? ''));

    // Chỉ chặn giá đơn khi user thực sự sửa order (sửa payment-only không cần giá đơn).
    if (orderChanged && amountNum <= 0) { toast.error('Vui lòng nhập giá đơn hợp lệ'); return; }

    // Gom diff payment (nếu có paymentId).
    const pBody: Record<string, unknown> = {};
    if (paymentId) {
      const orig = originalPaymentRef.current;
      if (payment.installmentId !== orig.installmentId) pBody.installmentId = payment.installmentId;
      if (payment.transferDate !== orig.transferDate && payment.transferDate) pBody.transferDate = payment.transferDate;
      if (payment.paymentTypeId !== orig.paymentTypeId) pBody.paymentTypeId = payment.paymentTypeId;
      if (payment.bankAccountId !== orig.bankAccountId) pBody.bankAccountId = payment.bankAccountId;
      if (payment.transferContent !== orig.transferContent) pBody.transferContent = payment.transferContent;
      if (payment.notes !== orig.notes) pBody.notes = payment.notes;
      // amount chỉ gửi khi PENDING (BE khoá) + có đổi.
      if (payment.status === 'PENDING' && payment.amount !== orig.amount) {
        pBody.amount = Number(payment.amount) || 0;
      }
    }

    if (!orderChanged && Object.keys(pBody).length === 0) {
      toast.info('Không có thay đổi nào');
      onOpenChange(false);
      return;
    }

    setSubmitting(true);
    try {
      // PATCH payment TRƯỚC (dễ fail vì BE validate amount/trần) -> nếu lỗi thì order chưa bị ghi.
      if (Object.keys(pBody).length > 0) {
        await api.patch(`/payments/${paymentId}`, pBody);
      }

      if (orderChanged) {
        const body: Record<string, unknown> = {
          amount: amountNum,
          stt, courseCode, companyName, taxCode, contactPerson,
          customerName, customerPhone, address, vatEmail, notes,
        };
        if (productId) body.productId = productId;
        if (formatId) body.formatId = formatId;
        if (productGroupId) body.productGroupId = productGroupId;
        await api.patch(`/orders/${orderId}`, body);
      }

      toast.success('Đã cập nhật');
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
        <DialogHeader><DialogTitle>{paymentId ? 'Sửa đơn + thanh toán' : 'Sửa đơn hàng'} #{orderId}</DialogTitle></DialogHeader>
        {loading ? (
          <p className="py-8 text-center text-sm text-slate-400">Đang tải...</p>
        ) : (
          <div className="space-y-4 py-2">
            {/* Sản phẩm + giá */}
            <FormField label="Sản phẩm">
              <ProductCombobox value={productId} onChange={setProductId} showPrice placeholder="Chọn sản phẩm" />
            </FormField>
            <FormField label="Giá đơn (chưa VAT)" required>
              <MoneyInput value={amount} onChange={setAmount} placeholder="Giá sản phẩm" />
            </FormField>
            <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">Giá (đã gồm VAT)</span><span className="font-medium">{formatVND(amountNum)}</span></div>
              {vatRate > 0 && <div className="flex justify-between"><span className="text-slate-500">Trong đó VAT ({vatRate}%)</span><span>{formatVND(vatAmount)}</span></div>}
              <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold"><span>Tổng</span><span className="text-sky-600">{formatVND(totalAmount)}</span></div>
            </div>

            {/* Chi tiết đơn */}
            <div className="border-t border-slate-200 pt-3">
              <p className="text-sm font-semibold text-slate-700 mb-3">Chi tiết đơn hàng</p>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Hình thức">
                  <Select value={formatId} onValueChange={setFormatId}>
                    <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
                    <SelectContent>
                      {orderFormats.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Nhóm sản phẩm">
                  <Select value={productGroupId} onValueChange={setProductGroupId}>
                    <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
                    <SelectContent>
                      {productGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="STT">
                  <Input value={stt} onChange={(e) => setStt(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="VD: 1, 2, 3..." />
                </FormField>
                <FormField label="Mã khoá">
                  <Input value={courseCode} onChange={(e) => setCourseCode(e.target.value)} placeholder="VD: KH001" />
                </FormField>
              </div>
            </div>

            {/* Thông tin xuất VAT */}
            <div className="border-t border-slate-200 pt-3">
              <p className="text-sm font-semibold text-slate-700 mb-3">Thông tin khách / xuất VAT</p>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Tên khách"><Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Họ tên" /></FormField>
                <FormField label="SĐT khách"><Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="0912345678" /></FormField>
                <FormField label="Tên công ty"><Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Công ty ABC" /></FormField>
                <FormField label="Mã số thuế"><Input value={taxCode} onChange={(e) => setTaxCode(e.target.value)} placeholder="0123456789" /></FormField>
                <FormField label="Người liên hệ"><Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="Tên người LH" /></FormField>
                <FormField label="Địa chỉ"><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Địa chỉ" /></FormField>
                <FormField label="Mail nhận VAT" className="col-span-2"><Input value={vatEmail} onChange={(e) => setVatEmail(e.target.value)} placeholder="email@example.com" type="email" /></FormField>
              </div>
            </div>

            <FormField label="Ghi chú">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ghi chú đơn hàng..." rows={2} />
            </FormField>

            {/* Section sửa thanh toán - chỉ khi mở từ 1 dòng payment cụ thể. */}
            {paymentId && <EditPaymentSection value={payment} onChange={patchPayment} />}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button onClick={handleSubmit} disabled={loading || submitting}>
            {submitting ? 'Đang lưu...' : 'Lưu thay đổi'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
