'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FormField } from '@/components/shared/form-field';
import { ProductCombobox } from '@/components/ui/product-combobox';
import { useProducts } from '@/hooks/use-products';
import { api } from '@/lib/api-client';
import { formatVND } from '@/lib/utils';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import type { RefundRecord, NamedEntity } from '@/types/entities';

// Tập giá trị cố định - hardcode (YAGNI, chưa cần lookup table). Sale sửa thì đổi ở đây.
const GROUP_OPTIONS = ['ZOOM PHỄU', 'SALE TỰ CHỐT', 'COACHING', 'SP LIÊN KẾT'];
const TEAM_OPTIONS = ['TEAM TÂM', 'TEAM HỒI', 'SALE CÁ NHÂN', 'CSKH', 'SUPPORT', 'QUẢN LÝ'];
const METHOD_OPTIONS = ['CK', 'TM'];
const BANK_OPTIONS = ['VIB 666 NTK', 'VCB 666 NTK', 'VIB 668 TAKI', 'ACB 688 TAKI', 'TCB 999 NTK'];

interface CreateRefundDialogProps {
  /** Dòng cần sửa. Có -> dialog ở chế độ sửa (PATCH). Không -> tạo mới (POST). */
  refund?: RefundRecord;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideDefaultTrigger?: boolean;
}

export function CreateRefundDialog({ refund, open: controlledOpen, onOpenChange, hideDefaultTrigger }: CreateRefundDialogProps) {
  const router = useRouter();
  const isEdit = !!refund;
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined && onOpenChange !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => { if (isControlled) onOpenChange!(v); else setInternalOpen(v); };

  // Danh sách SP từ hệ thống (có giá + vatRate). Chỉ fetch khi dialog mở.
  const { products } = useProducts(open);

  const [submitting, setSubmitting] = useState(false);
  const [uploadingBill, setUploadingBill] = useState(false);
  const [customerName, setCustomerName] = useState(refund?.customerName ?? '');
  const [customerPhone, setCustomerPhone] = useState(refund?.customerPhone ?? '');
  const [productId, setProductId] = useState(refund?.productId ?? '');
  const [groupName, setGroupName] = useState(refund?.groupName ?? '');
  const [teamName, setTeamName] = useState(refund?.teamName ?? '');
  const [refundDate, setRefundDate] = useState(refund?.refundDate ? refund.refundDate.slice(0, 10) : '');
  const [amount, setAmount] = useState(refund ? String(Math.round(Number(refund.amount))) : '');
  const [refundMethod, setRefundMethod] = useState(refund?.refundMethod ?? '');
  const [refundBank, setRefundBank] = useState(refund?.refundBank ?? '');
  const [billImage, setBillImage] = useState(refund?.billImage ?? '');
  const [notes, setNotes] = useState(refund?.notes ?? '');

  // Đường ống Lark đang bật - dropdown "Đổ về bảng Lark" (mọi role gọi /lark-sync/options).
  const [larkSyncOptions, setLarkSyncOptions] = useState<NamedEntity[]>([]);
  const [larkSyncId, setLarkSyncId] = useState(refund?.larkSyncId ?? '');
  useEffect(() => {
    if (!open || larkSyncOptions.length > 0) return;
    api.get<{ data: NamedEntity[] }>('/lark-sync/options')
      .then(r => setLarkSyncOptions(r.data))
      .catch(() => { /* Lark tắt/không có đường ống -> ẩn dropdown */ });
  }, [open, larkSyncOptions.length]);

  // SP đang chọn -> lấy giá + %VAT. Doanh thu = giá (gồm VAT); tiền VAT = giá*vat/(100+vat).
  const selectedProduct = products.find(p => p.id === productId);
  // Khi sửa dòng cũ mà catalog chưa load kịp/SP đã xoá -> fallback snapshot đã lưu.
  const price = selectedProduct ? selectedProduct.price : Number(refund?.productPrice) || 0;
  const vatRate = selectedProduct ? selectedProduct.vatRate : Number(refund?.vatRate) || 0;
  const vatAmount = price > 0 && vatRate > 0 ? Math.round(price * vatRate / (100 + vatRate)) : 0;

  function resetAndClose() {
    setOpen(false);
    if (!isEdit) {
      setCustomerName(''); setCustomerPhone(''); setProductId(''); setGroupName('');
      setTeamName(''); setRefundDate(''); setAmount(''); setRefundMethod('');
      setRefundBank(''); setBillImage(''); setNotes(''); setLarkSyncId('');
    }
  }

  // Upload ảnh bill qua endpoint chung /files/upload (multipart). Trả relative path -> lưu vào billImage.
  async function handleBillUpload(file: File) {
    setUploadingBill(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/proxy/files/upload', { method: 'POST', credentials: 'include', body: fd });
      if (!res.ok) throw new Error('Upload lỗi');
      const json = await res.json();
      setBillImage(json.data?.filePath || '');
      toast.success('Đã tải ảnh bill');
    } catch {
      toast.error('Lỗi tải ảnh bill');
    } finally {
      setUploadingBill(false);
    }
  }

  async function handleSubmit() {
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) { toast.error('Vui lòng nhập số tiền hoàn (> 0)'); return; }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        productId: productId || undefined,
        productName: selectedProduct?.name || refund?.productName || undefined,
        productPrice: price > 0 ? price : undefined,
        vatRate: selectedProduct ? vatRate : (refund?.vatRate ?? undefined),
        groupName: groupName || undefined,
        teamName: teamName || undefined,
        refundDate: refundDate || undefined,
        amount: amountNum,
        refundMethod: refundMethod || undefined,
        refundBank: refundBank || undefined,
        billImage: billImage || undefined,
        notes: notes || undefined,
        larkSyncId: larkSyncId || undefined,
      };
      if (isEdit) await api.patch(`/refunds/${refund!.id}`, body);
      else await api.post('/refunds', body);
      toast.success(isEdit ? 'Đã cập nhật hoàn tiền' : 'Đã thêm dòng hoàn tiền');
      resetAndClose();
      router.refresh();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Lỗi lưu hoàn tiền');
    } finally {
      setSubmitting(false);
    }
  }

  const showTrigger = !isControlled && !hideDefaultTrigger;

  return (
    <>
      {showTrigger && (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />Thêm hoàn tiền
        </Button>
      )}
      <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{isEdit ? 'Sửa hoàn tiền' : 'Thêm hoàn tiền'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Tên khách">
                <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Họ tên" />
              </FormField>
              <FormField label="SĐT">
                <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="0912345678" />
              </FormField>
              <FormField label="Sản phẩm" className="col-span-2">
                <ProductCombobox value={productId} onChange={setProductId} showPrice placeholder="Chọn sản phẩm" />
              </FormField>
            </div>

            {/* Doanh thu + VAT tự tính từ giá SP hệ thống (chỉ hiện khi có SP). */}
            {price > 0 && (
              <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-slate-500">Doanh thu về công ty (gồm VAT)</span><span className="font-medium">{formatVND(price)}</span></div>
                {vatRate > 0 && <div className="flex justify-between"><span className="text-slate-500">% VAT</span><span>{vatRate}%</span></div>}
                {vatRate > 0 && <div className="flex justify-between"><span className="text-slate-500">Số tiền VAT</span><span className="text-sky-600">{formatVND(vatAmount)}</span></div>}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Nhóm">
                <Select value={groupName} onValueChange={setGroupName}>
                  <SelectTrigger><SelectValue placeholder="Chọn nhóm" /></SelectTrigger>
                  <SelectContent>
                    {GROUP_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Team">
                <Select value={teamName} onValueChange={setTeamName}>
                  <SelectTrigger><SelectValue placeholder="Chọn team" /></SelectTrigger>
                  <SelectContent>
                    {TEAM_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Ngày hoàn tiền">
                <Input type="date" value={refundDate} onChange={e => setRefundDate(e.target.value)} />
              </FormField>
              <FormField label="Số tiền hoàn" required>
                <MoneyInput value={amount} onChange={setAmount} placeholder="Số tiền" />
              </FormField>
              <FormField label="Hình thức hoàn">
                <Select value={refundMethod} onValueChange={setRefundMethod}>
                  <SelectTrigger><SelectValue placeholder="CK / TM" /></SelectTrigger>
                  <SelectContent>
                    {METHOD_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Ngân hàng hoàn">
                <Select value={refundBank} onValueChange={setRefundBank}>
                  <SelectTrigger><SelectValue placeholder="Chọn NH" /></SelectTrigger>
                  <SelectContent>
                    {BANK_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            {/* Ảnh bill thanh toán - upload qua /files/upload, lưu relative path. */}
            <FormField label="Ảnh bill thanh toán">
              {billImage ? (
                <div className="flex items-center gap-2">
                  <a href={`/api/proxy/files/${billImage}`} target="_blank" rel="noreferrer" className="text-sm text-sky-600 underline truncate">Xem ảnh bill</a>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => setBillImage('')}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Input
                  type="file"
                  accept="image/*"
                  disabled={uploadingBill}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleBillUpload(f); }}
                />
              )}
            </FormField>

            <FormField label="Ghi chú">
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ghi chú..." rows={2} />
            </FormField>

            {/* Đổ về bảng Lark - chỉ hiện khi admin đã cấu hình ít nhất 1 đường ống. Không bắt buộc. */}
            {larkSyncOptions.length > 0 && (
              <FormField label="Đổ về bảng Lark">
                <Select value={larkSyncId} onValueChange={setLarkSyncId}>
                  <SelectTrigger><SelectValue placeholder="Không đổ (chỉ lưu nội bộ)" /></SelectTrigger>
                  <SelectContent>
                    {larkSyncOptions.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetAndClose}>Hủy</Button>
            <Button onClick={handleSubmit} disabled={submitting || uploadingBill}>
              {submitting ? 'Đang lưu...' : (isEdit ? 'Lưu' : 'Thêm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
