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
import { DocumentUploadSection, buildDocumentDescription, type PendingDocument } from '@/components/orders/document-upload-section';
import { useProducts } from '@/hooks/use-products';
import { api } from '@/lib/api-client';
import { formatVND } from '@/lib/utils';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { NamedEntity, ProductRecord } from '@/types/entities';

interface CreateOrderDialogProps {
  /** Có thể trống khi tạo từ lead chưa convert - backend tự tạo customer từ leadId. */
  customerId?: string;
  leadId?: string;
  /** @deprecated Không còn dùng - products fetch qua useProducts hook. Giữ để không break callers cũ. */
  products?: ProductRecord[];
  paymentTypes?: NamedEntity[];
  /** Controlled mode: parent tự quản lý trạng thái open. Nếu truyền thì
   *  component không render Button trigger mặc định. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Ẩn Button trigger mặc định (vẫn dùng internal state). */
  hideDefaultTrigger?: boolean;
  /** Callback sau khi tạo đơn + payment thành công. Parent dùng để refresh data. */
  onSuccess?: () => void;
  /** Giá trị map sẵn khi mở dialog (vd từ lead). User vẫn sửa được. Seed 1 lần lúc mở. */
  defaultProductId?: string;
  defaultCustomerName?: string;
  defaultCustomerPhone?: string;
}

/** Single-step dialog: create order + payment together. */
// Products dùng useProducts hook chung (cache key 'products-cache' qua lib/product-cache.ts).
// Các entity khác (payment-types, bank-accounts, formats, groups, installments) vẫn cache local ở đây.
const CACHE_KEY_PT = 'crm_order_payment_types';
const CACHE_KEY_BA = 'crm_order_bank_accounts';
const CACHE_KEY_FORMATS = 'crm_order_formats';
const CACHE_KEY_GROUPS = 'crm_order_product_groups';
const CACHE_KEY_INSTALLMENTS = 'crm_order_installments';
const CACHE_KEY_LARK_SYNC = 'crm_order_lark_sync';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

/** Invalidate order dialog caches - call after adding/editing products, payment types, bank accounts */
export function invalidateOrderCaches() {
  try {
    // Products cache key 'products-cache' do hook useProducts quản lý -> import clear riêng nếu cần.
    localStorage.removeItem('products-cache');
    localStorage.removeItem(CACHE_KEY_PT);
    localStorage.removeItem(CACHE_KEY_BA);
    localStorage.removeItem(CACHE_KEY_FORMATS);
    localStorage.removeItem(CACHE_KEY_GROUPS);
    localStorage.removeItem(CACHE_KEY_INSTALLMENTS);
    localStorage.removeItem(CACHE_KEY_LARK_SYNC);
  } catch { /* */ }
}

function readOrderCache(key: string) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > CACHE_TTL) { localStorage.removeItem(key); return null; }
    return parsed.data;
  } catch { return null; }
}
function writeOrderCache(key: string, data: (ProductRecord | NamedEntity)[]) {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch { /* */ }
}

export function CreateOrderDialog({
  customerId, leadId, products: _propProducts, paymentTypes: propPaymentTypes = [],
  open: controlledOpen, onOpenChange: controlledOnOpenChange,
  hideDefaultTrigger = false, onSuccess,
  defaultProductId, defaultCustomerName, defaultCustomerPhone,
}: CreateOrderDialogProps) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Controlled mode: ưu tiên props nếu cả 2 (open + onOpenChange) được truyền.
  const isControlled = controlledOpen !== undefined && controlledOnOpenChange !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) controlledOnOpenChange!(next);
    else setInternalOpen(next);
  };

  // Products: dùng useProducts hook (cache 24h chung toàn app, hỗ trợ search VN + lazy display).
  // Prop `products` cũ đã deprecated - hook tự fetch + cache.
  const { products: hookedProducts } = useProducts(open);
  const [loadedPaymentTypes, setLoadedPaymentTypes] = useState<NamedEntity[]>(propPaymentTypes);
  const [bankAccounts, setBankAccounts] = useState<NamedEntity[]>([]);
  const [orderFormats, setOrderFormats] = useState<NamedEntity[]>([]);
  const [productGroups, setProductGroups] = useState<NamedEntity[]>([]);
  const [paymentInstallments, setPaymentInstallments] = useState<NamedEntity[]>([]);
  // Đường ống Lark đang bật - dropdown "Đổ về bảng Lark" (mọi role gọi /lark-sync/options).
  const [larkSyncOptions, setLarkSyncOptions] = useState<NamedEntity[]>([]);

  useEffect(() => {
    if (!open) return;
    // Payment types
    if (loadedPaymentTypes.length === 0) {
      const cached = readOrderCache(CACHE_KEY_PT);
      if (cached) { setLoadedPaymentTypes(cached); }
      else {
        api.get<{ data: NamedEntity[] }>('/payment-types').then(r => {
          const mapped = (r.data || []).map((pt) => ({ ...pt, id: String(pt.id) }));
          setLoadedPaymentTypes(mapped);
          writeOrderCache(CACHE_KEY_PT, mapped);
        }).catch(() => {});
      }
    }
    // Bank accounts
    if (bankAccounts.length === 0) {
      const cached = readOrderCache(CACHE_KEY_BA);
      if (cached) { setBankAccounts(cached); }
      else {
        api.get<{ data: NamedEntity[] }>('/bank-accounts').then(r => {
          const mapped = (r.data || []).map((ba) => ({ id: String(ba.id), name: ba.name }));
          setBankAccounts(mapped);
          writeOrderCache(CACHE_KEY_BA, mapped);
        }).catch(() => {});
      }
    }
    // Order formats
    if (orderFormats.length === 0) {
      const cached = readOrderCache(CACHE_KEY_FORMATS);
      if (cached) { setOrderFormats(cached); }
      else {
        api.get<{ data: NamedEntity[] }>('/order-formats').then(r => {
          const mapped = (r.data || []).map((f) => ({ id: String(f.id), name: f.name }));
          setOrderFormats(mapped);
          writeOrderCache(CACHE_KEY_FORMATS, mapped);
        }).catch(() => {});
      }
    }
    // Product groups
    if (productGroups.length === 0) {
      const cached = readOrderCache(CACHE_KEY_GROUPS);
      if (cached) { setProductGroups(cached); }
      else {
        api.get<{ data: NamedEntity[] }>('/product-groups').then(r => {
          const mapped = (r.data || []).map((g) => ({ id: String(g.id), name: g.name }));
          setProductGroups(mapped);
          writeOrderCache(CACHE_KEY_GROUPS, mapped);
        }).catch(() => {});
      }
    }
    // Payment installments
    if (paymentInstallments.length === 0) {
      const cached = readOrderCache(CACHE_KEY_INSTALLMENTS);
      if (cached) { setPaymentInstallments(cached); }
      else {
        api.get<{ data: NamedEntity[] }>('/payment-installments').then(r => {
          const mapped = (r.data || []).map((i) => ({ id: String(i.id), name: i.name }));
          setPaymentInstallments(mapped);
          writeOrderCache(CACHE_KEY_INSTALLMENTS, mapped);
        }).catch(() => {});
      }
    }
    // Lark sync options (đường ống đang bật) - dropdown bắt buộc khi có ít nhất 1.
    if (larkSyncOptions.length === 0) {
      const cached = readOrderCache(CACHE_KEY_LARK_SYNC);
      if (cached) { setLarkSyncOptions(cached); }
      else {
        api.get<{ data: NamedEntity[] }>('/lark-sync/options').then(r => {
          const mapped = (r.data || []).map((m) => ({ id: String(m.id), name: m.name }));
          setLarkSyncOptions(mapped);
          writeOrderCache(CACHE_KEY_LARK_SYNC, mapped);
        }).catch(() => {});
      }
    }
  }, [open]);

  // Order fields
  const [productId, setProductId] = useState('');
  // So luong don (mac dinh 1). Tong tien hien thi = don gia * so luong.
  const [quantity, setQuantity] = useState(1);
  // Combo: id các SP con user đã tích. Giá đơn = tổng giá các con đã tích.
  const [comboChildIds, setComboChildIds] = useState<string[]>([]);
  const [larkSyncId, setLarkSyncId] = useState('');
  const [notes, setNotes] = useState('');
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

  // Seed giá trị mặc định khi dialog mở (từ lead data). Chạy 1 lần trên mỗi open.
  // resetAndClose clear khi đóng. User sửa thoải mái sau seed.
  useEffect(() => {
    if (!open) return;
    if (defaultProductId) setProductId(defaultProductId);
    if (defaultCustomerName) setCustomerName(defaultCustomerName);
    if (defaultCustomerPhone) setCustomerPhone(defaultCustomerPhone);
  }, [open, defaultProductId, defaultCustomerName, defaultCustomerPhone]);

  // Payment fields
  const [paymentTypeId, setPaymentTypeId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [transferContent, setTransferContent] = useState('');
  const [transferDate, setTransferDate] = useState('');
  const [installmentId, setInstallmentId] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Documents: chỉ enable khi có leadId (endpoint là POST /leads/:leadId/documents).
  // Khi mở dialog từ customer detail (không có leadId) -> section ẩn hoàn toàn.
  const [pendingDocs, setPendingDocs] = useState<PendingDocument[]>([]);
  const [docUploadIndex, setDocUploadIndex] = useState(0); // track progress khi đang upload

  const paymentTypes = loadedPaymentTypes;
  // hookedProducts có shape { id, name, price, vatRate, isCombo, comboItems } - đủ cho tính tổng VAT.
  const selectedProduct = hookedProducts.find(p => p.id === productId);
  const isComboProduct = !!selectedProduct?.isCombo;
  const comboChildren = selectedProduct?.comboItems ?? [];
  const basePrice = selectedProduct ? Number(selectedProduct.price) : 0;
  // Combo: giá = tổng giá các SP con user đã tích. SP thường: giá gốc.
  const price = isComboProduct
    ? comboChildren.filter(c => comboChildIds.includes(c.id)).reduce((sum, c) => sum + c.price, 0)
    : basePrice;
  const vatRate = selectedProduct?.vatRate || 0;
  // Tong tien = don gia * so luong. amount gui di van la DON GIA (price), backend tu nhan quantity.
  const totalAmount = price * quantity;
  // Giá SP đã bao gồm VAT -> tách phần VAT nằm trong tổng; tổng đúng bằng đơn giá * số lượng, không cộng thêm.
  const vatAmount = Math.round(totalAmount * vatRate / (100 + vatRate));

  // Số CK đã bao gồm VAT -> tách phần VAT nằm trong số tiền.
  const pmtAmountNum = Number(paymentAmount) || totalAmount;
  const pmtVatAmount = vatRate > 0 ? Math.round(pmtAmountNum * vatRate / (100 + vatRate)) : 0;

  function resetAndClose() {
    setOpen(false);
    setProductId(''); setQuantity(1); setComboChildIds([]); setLarkSyncId('');
    setNotes(''); setFormatId(''); setProductGroupId('');
    setStt(''); setCourseCode('');
    setCompanyName(''); setTaxCode(''); setContactPerson('');
    setCustomerName(''); setCustomerPhone(''); setAddress(''); setVatEmail('');
    setPaymentTypeId(''); setBankAccountId(''); setPaymentAmount('');
    setTransferContent(''); setTransferDate(''); setInstallmentId(''); setPaymentNotes('');
    setPendingDocs([]); setDocUploadIndex(0);
  }

  /**
   * Upload sequential từng file qua POST /leads/:leadId/documents.
   * Endpoint nhận 1 file/request (multipart) - không có batch endpoint.
   * Trả về số file fail để parent hiện warning.
   */
  async function uploadPendingDocs(leadIdForUpload: string): Promise<{ failed: number; failedNames: string[] }> {
    let failed = 0;
    const failedNames: string[] = [];
    for (let i = 0; i < pendingDocs.length; i++) {
      setDocUploadIndex(i);
      const doc = pendingDocs[i];
      try {
        const fd = new FormData();
        fd.append('file', doc.file);
        fd.append('description', buildDocumentDescription(doc.kind));
        // Direct fetch vì api-client chỉ hỗ trợ JSON body. credentials: include để gửi cookie auth.
        const res = await fetch(`/api/proxy/leads/${leadIdForUpload}/documents`, {
          method: 'POST',
          credentials: 'include',
          body: fd,
        });
        if (!res.ok) {
          failed++;
          failedNames.push(doc.file.name);
        }
      } catch {
        failed++;
        failedNames.push(doc.file.name);
      }
    }
    setDocUploadIndex(pendingDocs.length);
    return { failed, failedNames };
  }

  async function handleSubmit() {
    if (!productId) { toast.error('Vui lòng chọn sản phẩm'); return; }
    // Đường ống Lark bắt buộc khi đã cấu hình ít nhất 1 (chưa có thì bỏ qua, đơn không sync).
    if (larkSyncOptions.length > 0 && !larkSyncId) { toast.error('Vui lòng chọn bảng Lark để đổ dữ liệu'); return; }
    if (isComboProduct && comboChildIds.length === 0) { toast.error('Vui lòng chọn ít nhất 1 sản phẩm con trong combo'); return; }
    if (price <= 0) { toast.error('Vui lòng nhập giá bán'); return; }
    // Bắt buộc chọn khi admin đã cấu hình danh sách (chưa cấu hình thì bỏ qua để không kẹt tạo đơn).
    if (orderFormats.length > 0 && !formatId) { toast.error('Vui lòng chọn hình thức đơn'); return; }
    if (productGroups.length > 0 && !productGroupId) { toast.error('Vui lòng chọn nhóm sản phẩm'); return; }
    // Validate ĐỦ phần thanh toán TRƯỚC khi gửi (khớp quy tắc bắt buộc của backend) -
    // thiếu là fail sau khi đơn đã tạo -> đơn mồ côi (bug đơn 5861/5862 prod).
    if (!paymentTypeId) { toast.error('Vui lòng chọn hình thức thanh toán'); return; }
    if (bankAccounts.length > 0 && !bankAccountId) { toast.error('Vui lòng chọn tài khoản ngân hàng'); return; }
    if (!installmentId) { toast.error('Vui lòng chọn đợt thanh toán'); return; }
    if (!transferContent.trim()) { toast.error('Vui lòng nhập Nội dung chuyển khoản'); return; }
    if (!transferDate) { toast.error('Vui lòng nhập Ngày chuyển khoản'); return; }
    const pmtAmount = Number(paymentAmount) || totalAmount;
    if (!Number.isFinite(pmtAmount) || pmtAmount <= 0) { toast.error('Số tiền CK phải lớn hơn 0'); return; }
    // Cho phép thu vượt tối đa 110% giá đơn (bù phí CK / làm tròn).
    if (pmtAmount > totalAmount * 1.1) { toast.error('Số tiền CK vượt quá 110% giá trị đơn hàng'); return; }
    setSubmitting(true);
    try {
      // 1 request duy nhất: đơn + thanh toán tạo atomic trong cùng transaction ở backend.
      // Bất kỳ lỗi nào -> không có gì được tạo, user sửa form rồi bấm lại không bị "trùng đơn".
      // amount = DON GIA (khong nhan quantity); backend tu tinh totalAmount = amount * quantity.
      const orderBody: Record<string, unknown> = { productId, amount: price, quantity };
      if (customerId) orderBody.customerId = customerId;
      if (leadId) orderBody.leadId = leadId;
      if (larkSyncId) orderBody.larkSyncId = larkSyncId;
      if (notes) orderBody.notes = notes;
      if (formatId) orderBody.formatId = formatId;
      if (productGroupId) orderBody.productGroupId = productGroupId;
      if (stt) orderBody.stt = stt;
      if (courseCode) orderBody.courseCode = courseCode;
      if (companyName) orderBody.companyName = companyName;
      if (taxCode) orderBody.taxCode = taxCode;
      if (contactPerson) orderBody.contactPerson = contactPerson;
      if (customerName) orderBody.customerName = customerName;
      if (customerPhone) orderBody.customerPhone = customerPhone;
      if (address) orderBody.address = address;
      if (vatEmail) orderBody.vatEmail = vatEmail;

      // Không gửi vatAmount - server tự tính từ vatRate của đơn (fix cứng theo sản phẩm).
      const pmtBody: Record<string, unknown> = { amount: pmtAmount, transferDate };
      if (paymentTypeId) pmtBody.paymentTypeId = paymentTypeId;
      if (bankAccountId) pmtBody.bankAccountId = bankAccountId;
      if (transferContent) pmtBody.transferContent = transferContent;
      if (installmentId) pmtBody.installmentId = installmentId;
      if (paymentNotes.trim()) pmtBody.notes = paymentNotes.trim();
      orderBody.payment = pmtBody;

      await api.post<{ data: { id: string; totalAmount: number } }>('/orders', orderBody);

      // Step 3: Upload documents (chỉ khi có leadId + có file pending).
      // Đơn + payment đã tạo OK -> không rollback nếu upload fail, chỉ warning user.
      if (leadId && pendingDocs.length > 0) {
        const { failed, failedNames } = await uploadPendingDocs(leadId);
        if (failed > 0) {
          toast.warning(
            `Đã tạo đơn + thanh toán. ${failed}/${pendingDocs.length} file upload lỗi: ${failedNames.join(', ')}`,
            { duration: 6000 },
          );
        } else {
          toast.success(`Đã tạo đơn + thanh toán + ${pendingDocs.length} tài liệu`);
        }
      } else {
        toast.success('Đã tạo đơn hàng + thanh toán');
      }

      resetAndClose();
      router.refresh();
      onSuccess?.();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Lỗi tạo đơn hàng');
    } finally {
      setSubmitting(false);
    }
  }

  const showTrigger = !isControlled && !hideDefaultTrigger;

  return (
    <>
      {showTrigger && (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />Tạo đơn hàng
        </Button>
      )}
      <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Tạo đơn hàng + thanh toán</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {/* Product selection - Combobox có search VN bỏ dấu + cache 24h chung toàn app */}
            <FormField label="Sản phẩm" required>
              <ProductCombobox
                value={productId}
                onChange={(id) => { setProductId(id); setPaymentAmount(''); setComboChildIds([]); }}
                showPrice
                placeholder="Chọn sản phẩm"
              />
            </FormField>

            {/* Combo: xổ danh sách SP con, user tích chọn -> giá đơn tự cộng tổng giá con đã tích */}
            {isComboProduct && (
              <FormField label="Chọn sản phẩm trong combo" required>
                {comboChildren.length === 0 ? (
                  <p className="text-sm text-slate-400">Combo này chưa có sản phẩm con.</p>
                ) : (
                  <div className="max-h-[360px] space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                    {comboChildren.map(child => {
                      const checked = comboChildIds.includes(child.id);
                      return (
                        <label
                          key={child.id}
                          className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50"
                        >
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setComboChildIds(prev =>
                                  checked ? prev.filter(id => id !== child.id) : [...prev, child.id],
                                );
                                setPaymentAmount('');
                              }}
                              className="h-4 w-4 accent-sky-500"
                            />
                            <span className="text-sm text-slate-700">{child.name}</span>
                          </span>
                          <span className="text-sm text-slate-500">{formatVND(child.price)}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </FormField>
            )}

            {/* So luong */}
            {selectedProduct && (
              <FormField label="Số lượng">
                <Input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={e => setQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                />
              </FormField>
            )}

            {/* Price summary */}
            {selectedProduct && (
              <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-slate-500">Đơn giá (đã gồm VAT)</span><span className="font-medium">{formatVND(price)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Số lượng</span><span>{quantity}</span></div>
                {vatRate > 0 && <div className="flex justify-between"><span className="text-slate-500">Trong đó VAT ({vatRate}%)</span><span>{formatVND(vatAmount)}</span></div>}
                <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold"><span>Tổng</span><span className="text-sky-600">{formatVND(totalAmount)}</span></div>
              </div>
            )}

            {/* Customer info */}
            <div className="border-t border-slate-200 pt-3">
              <p className="text-sm font-semibold text-slate-700 mb-3">Thông tin khách hàng</p>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Tên khách">
                  <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Họ tên" />
                </FormField>
                <FormField label="SĐT khách">
                  <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="0912345678" />
                </FormField>
                <FormField label="Tên công ty">
                  <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Công ty ABC" />
                </FormField>
                <FormField label="Mã số thuế">
                  <Input value={taxCode} onChange={e => setTaxCode(e.target.value)} placeholder="0123456789" />
                </FormField>
                <FormField label="Người liên hệ">
                  <Input value={contactPerson} onChange={e => setContactPerson(e.target.value)} placeholder="Tên người LH" />
                </FormField>
                <FormField label="Địa chỉ">
                  <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Địa chỉ" />
                </FormField>
                <FormField label="Mail nhận VAT" className="col-span-2">
                  <Input value={vatEmail} onChange={e => setVatEmail(e.target.value)} placeholder="email@example.com" type="email" />
                </FormField>
              </div>
            </div>

            {/* Order details */}
            <div className="border-t border-slate-200 pt-3">
              <p className="text-sm font-semibold text-slate-700 mb-3">Chi tiết đơn hàng</p>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Hình thức" required={orderFormats.length > 0}>
                  <Select value={formatId} onValueChange={setFormatId}>
                    <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
                    <SelectContent>
                      {orderFormats.map(f => (
                        <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Nhóm sản phẩm" required={productGroups.length > 0}>
                  <Select value={productGroupId} onValueChange={setProductGroupId}>
                    <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
                    <SelectContent>
                      {productGroups.map(g => (
                        <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="STT">
                  {/* Chi nhap so - khi day sang Lark se them tien to "NGAY " (vd "NGAY 1") */}
                  <Input
                    value={stt}
                    onChange={e => setStt(e.target.value.replace(/\D/g, ''))}
                    inputMode="numeric"
                    placeholder="VD: 1, 2, 3..."
                  />
                </FormField>
                <FormField label="Mã khoá">
                  <Input value={courseCode} onChange={e => setCourseCode(e.target.value)} placeholder="VD: KH001" />
                </FormField>
              </div>
              {/* Đổ về bảng Lark - chỉ hiện khi admin đã cấu hình ít nhất 1 đường ống. Bắt buộc chọn. */}
              {larkSyncOptions.length > 0 && (
                <FormField label="Đổ về bảng Lark" required className="mt-3">
                  <Select value={larkSyncId} onValueChange={setLarkSyncId}>
                    <SelectTrigger><SelectValue placeholder="Chọn bảng Lark đích" /></SelectTrigger>
                    <SelectContent>
                      {larkSyncOptions.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormField>
              )}
            </div>

            {/* Payment section */}
            <div className="border-t border-slate-200 pt-3">
              <p className="text-sm font-semibold text-slate-700 mb-3">Thanh toán</p>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Hình thức CK" required>
                  <Select value={paymentTypeId} onValueChange={setPaymentTypeId}>
                    <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
                    <SelectContent>
                      {paymentTypes.map(pt => <SelectItem key={pt.id} value={pt.id}>{pt.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormField>
                {bankAccounts.length > 0 && (
                  <FormField label="Tài khoản NH" required>
                    <Select value={bankAccountId} onValueChange={setBankAccountId}>
                      <SelectTrigger><SelectValue placeholder="Chọn TK" /></SelectTrigger>
                      <SelectContent>
                        {bankAccounts.map(ba => <SelectItem key={ba.id} value={ba.id}>{ba.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormField>
                )}
                <FormField label="Đợt thanh toán" required>
                  <Select value={installmentId} onValueChange={setInstallmentId}>
                    <SelectTrigger><SelectValue placeholder="Chọn đợt" /></SelectTrigger>
                    <SelectContent>
                      {paymentInstallments.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Số tiền CK">
                  <MoneyInput value={paymentAmount} onChange={setPaymentAmount}
                    placeholder={totalAmount > 0 ? `Mặc định: ${formatVND(totalAmount)}` : 'Số tiền'} />
                </FormField>
                <FormField label="Ngày chuyển khoản" required>
                  <Input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} required />
                </FormField>
                {vatRate > 0 && pmtAmountNum > 0 && (
                  <FormField label="Tiền VAT (tính từ số CK)">
                    <Input value={formatVND(pmtVatAmount)} readOnly className="bg-slate-50 text-slate-600" />
                  </FormField>
                )}
              </div>
              <FormField label="Nội dung CK" required className="mt-3">
                <Input value={transferContent} onChange={e => setTransferContent(e.target.value)} placeholder="VD: CK LAN 1 KHOA HOC DM" required />
              </FormField>
              <FormField label="Ghi chú thanh toán" className="mt-3">
                <Input value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} placeholder="Ghi chú cho lần thanh toán này (tùy chọn)" />
              </FormField>
            </div>

            <FormField label="Ghi chú">
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ghi chú đơn hàng..." rows={2} />
            </FormField>

            {/* Documents - chỉ hiện khi có leadId (endpoint POST /leads/:leadId/documents).
                Mở dialog từ customer detail không có leadId -> ẩn section này. */}
            {leadId && (
              <div className="border-t border-slate-200 pt-3">
                <DocumentUploadSection
                  files={pendingDocs}
                  onChange={setPendingDocs}
                  uploading={submitting && pendingDocs.length > 0}
                  uploadedCount={docUploadIndex}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetAndClose}>Hủy</Button>
            <Button onClick={handleSubmit} disabled={!productId || submitting}>
              {submitting ? 'Đang tạo...' : 'Tạo đơn + thanh toán'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
