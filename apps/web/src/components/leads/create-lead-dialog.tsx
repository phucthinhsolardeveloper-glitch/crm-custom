'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { SourceCombobox } from '@/components/ui/source-combobox';
import { ProductCombobox } from '@/components/ui/product-combobox';
import { GroupCombobox } from '@/components/ui/group-combobox';
import { FormField } from '@/components/shared/form-field';
import { LeadDuplicateDialog } from '@/components/leads/lead-duplicate-dialog';
import { api } from '@/lib/api-client';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

interface CreateLeadDialogProps {
  /** @deprecated SourceCombobox tự fetch + cache 24h. Prop giữ lại để không break parent pages. */
  sources?: { id: string; name: string }[];
  /** @deprecated ProductCombobox tự fetch + cache 24h. Prop giữ lại để không break parent pages. */
  products?: { id: string; name: string }[];
}

/** Popup dialog for quick lead creation. Sources + products fetched + cached qua *Combobox (24h). */
export function CreateLeadDialog(_props: CreateLeadDialogProps = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({ phone: '', name: '', email: '', sourceId: '', groupId: '', productId: '', note: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [phoneDuplicate, setPhoneDuplicate] = useState<{ name: string; phone: string } | null>(null);

  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateDialogPhone, setDuplicateDialogPhone] = useState('');
  const autoShownPhoneRef = useRef('');

  // Auto-fill from existing customer + check lead duplicates
  useEffect(() => {
    if (form.phone.length < 10) { setPhoneDuplicate(null); return; }
    const timer = setTimeout(async () => {
      // Gọi song song: customer auto-fill + lead duplicate check
      const [customerResult, duplicateResult] = await Promise.allSettled([
        api.get<{ data: { name: string; phone: string; email?: string }[] }>(`/customers/search?phone=${form.phone}`),
        api.get<{ data: { leads: { id: string }[] } }>(`/leads/duplicates?phone=${encodeURIComponent(form.phone)}`),
      ]);

      // Customer auto-fill
      if (customerResult.status === 'fulfilled') {
        const match = customerResult.value.data?.[0];
        if (match) {
          setForm(prev => ({ ...prev, name: prev.name || match.name || '', email: prev.email || match.email || '' }));
          setPhoneDuplicate({ name: match.name, phone: match.phone });
        } else {
          setPhoneDuplicate(null);
        }
      } else {
        setPhoneDuplicate(null);
      }

      // Lead duplicate popup - auto-open 1 lần / 1 SĐT
      if (duplicateResult.status === 'fulfilled') {
        const leads = duplicateResult.value.data?.leads;
        if (leads && leads.length > 0 && autoShownPhoneRef.current !== form.phone) {
          autoShownPhoneRef.current = form.phone;
          setDuplicateDialogPhone(form.phone);
          setDuplicateDialogOpen(true);
        }
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.phone]);

  function update(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) setFieldErrors(prev => ({ ...prev, [key]: '' }));
  }

  function resetAndClose() {
    setOpen(false);
    setForm({ phone: '', name: '', email: '', sourceId: '', groupId: '', productId: '', note: '' });
    setFieldErrors({});
    setPhoneDuplicate(null);
    setDuplicateDialogOpen(false);
    setDuplicateDialogPhone('');
    autoShownPhoneRef.current = '';
  }

  async function handleSubmit() {
    // Validate phone
    if (!form.phone || !/^\+?\d{8,14}$/.test(form.phone)) {
      setFieldErrors({ phone: 'SĐT không hợp lệ (8-14 chữ số, có thể bắt đầu bằng + hoặc 0)' });
      return;
    }
    // Validate note length (defense in depth - HTML maxLength + backend đã chặn 2000)
    const trimmedNote = form.note.trim();
    if (trimmedNote.length > 2000) {
      setFieldErrors({ note: 'Note tối đa 2000 ký tự' });
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      const body: Record<string, string> = { phone: form.phone };
      if (form.name) body.name = form.name;
      if (form.email) body.email = form.email;
      if (form.sourceId) body.sourceId = form.sourceId;
      // groupId tự kéo theo sourceId ở backend (auto-sync nguồn cha của nhóm).
      if (form.groupId) body.groupId = form.groupId;
      if (form.productId) body.productId = form.productId;
      // Skip note nếu rỗng sau trim - tránh tạo activity rỗng + tiết kiệm payload
      if (trimmedNote) body.note = trimmedNote;

      await api.post('/leads', body);
      toast.success('Đã tạo lead');
      resetAndClose();
      router.refresh();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Lỗi tạo lead');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1" />Tạo Lead
      </Button>
      <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Tạo lead mới</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <FormField label="Số điện thoại" required error={fieldErrors.phone}>
              <Input value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="0912345678" autoFocus />
              {phoneDuplicate && (
                <p className="mt-1 text-xs text-sky-600">
                  KH đã có: <span className="font-semibold">{phoneDuplicate.name}</span> - dữ liệu đã tự điền
                </p>
              )}
            </FormField>

            <FormField label="Họ tên">
              <Input value={form.name} onChange={e => update('name', e.target.value)} placeholder="Nguyễn Văn A" />
            </FormField>

            <FormField label="Email">
              <Input type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="email@example.com" />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Nguồn">
                <SourceCombobox
                  value={form.sourceId}
                  onChange={(v) => update('sourceId', v)}
                  placeholder="Chọn"
                />
              </FormField>

              {/* Nhóm độc lập với Nguồn: chọn nhóm bất kỳ (có search).
                  Chọn nhóm -> tự fill ô Nguồn = nguồn cha của nhóm đó. */}
              <FormField label="Nhóm">
                <GroupCombobox
                  value={form.groupId}
                  onChange={(v, srcId) => {
                    update('groupId', v);
                    if (srcId) update('sourceId', srcId);
                  }}
                  placeholder="Chọn"
                />
              </FormField>
            </div>

            <FormField label="Sản phẩm">
              <ProductCombobox
                value={form.productId}
                onChange={(v) => update('productId', v)}
                placeholder="Chọn"
              />
            </FormField>

            <FormField label="Ghi chú ban đầu" error={fieldErrors.note}>
              <Textarea
                value={form.note}
                onChange={e => update('note', e.target.value)}
                placeholder="VD: Khách hẹn gọi lại 3h chiều..."
                rows={3}
                maxLength={2000}
                className="resize-y max-h-40"
              />
              <div className={`mt-1 text-xs text-right ${form.note.length > 2000 ? 'text-red-500' : 'text-slate-400'}`}>
                {form.note.length}/2000
              </div>
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetAndClose}>Hủy</Button>
            <Button onClick={handleSubmit} disabled={!form.phone || submitting}>
              {submitting ? 'Đang tạo...' : 'Tạo lead'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Popup Lead trùng SĐT - xếp chồng trên form tạo (Radix portal) */}
      <LeadDuplicateDialog
        open={duplicateDialogOpen}
        onOpenChange={setDuplicateDialogOpen}
        phone={duplicateDialogPhone}
      />
    </>
  );
}
