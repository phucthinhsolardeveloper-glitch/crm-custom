'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Phone, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { leadSecondaryPhonesApi } from '@/lib/api/lead-secondary-phones';
import type { CustomerPhoneRecord } from '@/types/entities';

interface Props {
  leadId: string;
  /** Hint hiển thị: nếu lead chưa có customer, backend sẽ auto-create khi thêm SĐT phụ. */
  hasCustomer?: boolean;
}

// Relaxed: 8-14 digits, optional leading '+' (VN mobile / service / international)
const PHONE_RE = /^\+?\d{8,14}$/;

/**
 * Section "Số điện thoại khác" trong LeadForm/LeadEditDrawer.
 *
 * 2026-05-23 refactor: BỎ BUFFER PATTERN - auto-save từng thao tác.
 * - Add/Edit/Delete: gọi API ngay -> refresh list.
 * - Backend tự auto-create customer khi lead chưa có (ensureCustomerForLead).
 * - Loading state per row khi đang call API.
 * - Không còn forwardRef/imperative API - parent KHÔNG cần flush khi submit form.
 *
 * Lý do bỏ buffer: user complaint "thêm SĐT phụ không tạo dữ liệu" - thực ra
 * buffer pattern yêu cầu user phải bấm "Cập nhật" form mới flush, dễ miss.
 * Auto-save khớp expectation hơn (giống Documents section đã làm sẵn).
 */
export function LeadSecondaryPhonesSection({ leadId, hasCustomer }: Props) {
  const [phones, setPhones] = useState<CustomerPhoneRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerPhoneRecord | null>(null);
  /** Track ID đang submit (add/edit/delete) để disable button + show spinner. */
  const [submittingId, setSubmittingId] = useState<string | 'new' | null>(null);

  // Đánh dấu sau khi action thành công (auto-create customer); bypass skip-fetch.
  const [bootstrapped, setBootstrapped] = useState(!!hasCustomer);

  const refresh = useCallback(async () => {
    // Skip request khi chắc chắn lead chưa có customer (sẽ trả [] mà tốn 1 round-trip).
    if (!hasCustomer && !bootstrapped) {
      setPhones([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await leadSecondaryPhonesApi.list(leadId);
      setPhones(res.data || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi tải SĐT phụ');
    } finally {
      setLoading(false);
    }
  }, [leadId, hasCustomer, bootstrapped]);

  useEffect(() => { refresh(); }, [refresh]);

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(p: CustomerPhoneRecord) {
    setEditing(p);
    setDialogOpen(true);
  }

  async function handleSave(input: { phone: string; label?: string; note?: string }) {
    setSubmittingId(editing ? editing.id : 'new');
    try {
      if (editing) {
        await leadSecondaryPhonesApi.update(leadId, editing.id, {
          phone: input.phone,
          label: input.label?.trim() || undefined,
          note: input.note?.trim() || undefined,
        });
        toast.success('Đã cập nhật SĐT phụ');
      } else {
        await leadSecondaryPhonesApi.add(leadId, {
          phone: input.phone,
          label: input.label?.trim() || undefined,
          note: input.note?.trim() || undefined,
        });
        toast.success('Đã thêm SĐT phụ');
      }
      setBootstrapped(true);
      setDialogOpen(false);
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Lỗi lưu SĐT phụ';
      toast.error(msg);
      // KHÔNG đóng dialog nếu fail - cho user fix và retry
    } finally {
      setSubmittingId(null);
    }
  }

  async function handleDelete(p: CustomerPhoneRecord) {
    setSubmittingId(p.id);
    try {
      await leadSecondaryPhonesApi.remove(leadId, p.id);
      toast.success('Đã xóa SĐT phụ');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi xóa SĐT phụ');
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <Phone className="h-4 w-4 text-sky-600" />
          Số điện thoại khác
          {phones.length > 0 && (
            <span className="text-xs font-normal text-slate-500">({phones.length})</span>
          )}
        </h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={openAdd}
          disabled={submittingId !== null}
          className="h-9"
        >
          <Plus className="h-4 w-4 mr-1" />Thêm số
        </Button>
      </div>

      {!hasCustomer && !bootstrapped && phones.length === 0 && (
        <p className="text-xs text-slate-400 mb-2 italic">
          Hồ sơ khách hàng sẽ được tự động tạo khi thêm SĐT phụ đầu tiên.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-400 inline-flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Đang tải...
        </p>
      ) : phones.length === 0 ? (
        <p className="text-sm text-slate-500">Chưa có số phụ</p>
      ) : (
        <ul className="space-y-2">
          {phones.map((p) => (
            <PhoneRow
              key={p.id}
              phone={p}
              busy={submittingId === p.id}
              onEdit={() => openEdit(p)}
              onRemove={() => handleDelete(p)}
            />
          ))}
        </ul>
      )}

      <PhoneDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        submitting={submittingId === 'new' || (editing != null && submittingId === editing.id)}
        onSave={handleSave}
      />
    </div>
  );
}

// ── Row ────────────────────────────────────────────────────────────────────

function PhoneRow({
  phone, busy, onEdit, onRemove,
}: {
  phone: CustomerPhoneRecord;
  busy: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 p-3 hover:bg-slate-50">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-medium text-slate-800">{phone.phone}</span>
          {phone.label && (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">
              {phone.label}
            </span>
          )}
          {busy && (
            <span className="inline-flex items-center gap-1 text-[10px] text-sky-600">
              <Loader2 className="h-3 w-3 animate-spin" />
              Đang xử lý
            </span>
          )}
        </div>
        {phone.note && (
          <p className="mt-1 truncate text-xs text-slate-500">{phone.note}</p>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon" variant="ghost" className="h-9 w-9"
          onClick={onEdit}
          disabled={busy}
          aria-label="Sửa"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <ConfirmDialog
          trigger={
            <Button
              type="button"
              size="icon" variant="ghost" className="h-9 w-9 text-rose-600"
              disabled={busy}
              aria-label="Xóa"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          }
          title="Xóa số phụ?"
          description={`Số ${phone.phone} sẽ bị xóa khỏi hồ sơ khách hàng. Thao tác này không thể hoàn tác.`}
          confirmLabel="Xóa"
          onConfirm={onRemove}
        />
      </div>
    </li>
  );
}

// ── Dialog (add + edit) ───────────────────────────────────────────────────

function PhoneDialog({
  open, onOpenChange, editing, submitting, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: CustomerPhoneRecord | null;
  submitting: boolean;
  onSave: (input: { phone: string; label?: string; note?: string }) => void;
}) {
  const [phone, setPhone] = useState('');
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');

  function handleOpenChange(v: boolean) {
    if (v) {
      setPhone(editing?.phone ?? '');
      setLabel(editing?.label ?? '');
      setNote(editing?.note ?? '');
    }
    // Không cho đóng khi đang submit (tránh user click outside lúc API đang chạy)
    if (!v && submitting) return;
    onOpenChange(v);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = phone.trim();
    if (!PHONE_RE.test(trimmed)) {
      toast.error('Số điện thoại không hợp lệ (VD: 0901234567)');
      return;
    }
    onSave({
      phone: trimmed,
      label: label.trim() || undefined,
      note: note.trim() || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Sửa số phụ' : 'Thêm số phụ'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="lead-phone">Số điện thoại *</Label>
            <Input
              id="lead-phone" value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0901234567"
              required autoFocus
              disabled={submitting}
            />
          </div>
          <div>
            <Label htmlFor="lead-phone-label">Nhãn</Label>
            <Input
              id="lead-phone-label" value={label} maxLength={50}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="VD: Vợ, Thư ký, Công ty"
              disabled={submitting}
            />
          </div>
          <div>
            <Label htmlFor="lead-phone-note">Ghi chú</Label>
            <Textarea
              id="lead-phone-note" value={note} maxLength={255}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú thêm (tùy chọn)"
              rows={2}
              disabled={submitting}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Hủy
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editing ? 'Cập nhật' : 'Thêm'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
