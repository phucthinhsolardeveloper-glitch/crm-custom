'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Phone, Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useAuth } from '@/providers/auth-provider';
import { customerPhonesApi } from '@/lib/api/customer-phones';
import type { CustomerPhoneRecord } from '@/types/entities';

interface Props {
  customerId: string;
  phones: CustomerPhoneRecord[];
}

// Relaxed rule: 8-14 digits, optional leading '+' (VN mobile / service / international)
const VN_PHONE_RE = /^\+?\d{8,14}$/;

/**
 * Section "Số điện thoại khác" trên trang chi tiết customer.
 * - GET hiển thị cho mọi role.
 * - Thêm/sửa/xóa chỉ MANAGER+ (UI hide; backend là source-of-truth qua @Roles).
 */
export function CustomerPhonesSection({ customerId, phones }: Props) {
  const { user } = useAuth();
  const isManagerPlus = user?.role === 'MANAGER' || user?.role === 'SUPER_ADMIN';

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerPhoneRecord | null>(null);

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(phone: CustomerPhoneRecord) {
    setEditing(phone);
    setDialogOpen(true);
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
        {isManagerPlus && (
          <Button size="sm" variant="outline" onClick={openAdd} className="h-9">
            <Plus className="h-4 w-4 mr-1" />Thêm số
          </Button>
        )}
      </div>

      {phones.length === 0 ? (
        <p className="text-sm text-slate-500">Chưa có số phụ</p>
      ) : (
        <ul className="space-y-2">
          {phones.map((p) => (
            <PhoneRow
              key={p.id}
              phone={p}
              canEdit={isManagerPlus}
              customerId={customerId}
              onEdit={() => openEdit(p)}
            />
          ))}
        </ul>
      )}

      <PhoneDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        customerId={customerId}
        editing={editing}
      />
    </div>
  );
}

// ── Row ────────────────────────────────────────────────────────────────────

function PhoneRow({
  phone, canEdit, customerId, onEdit,
}: {
  phone: CustomerPhoneRecord;
  canEdit: boolean;
  customerId: string;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await customerPhonesApi.remove(customerId, phone.id);
      toast.success('Đã xóa số phụ');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi khi xóa');
    } finally {
      setDeleting(false);
    }
  }

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
        </div>
        {phone.note && (
          <p className="mt-1 truncate text-xs text-slate-500">{phone.note}</p>
        )}
      </div>
      {canEdit && (
        <div className="flex items-center gap-1">
          <Button
            size="icon" variant="ghost" className="h-9 w-9"
            onClick={onEdit} aria-label="Sửa"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <ConfirmDialog
            trigger={
              <Button size="icon" variant="ghost" className="h-9 w-9 text-rose-600" aria-label="Xóa">
                <Trash2 className="h-4 w-4" />
              </Button>
            }
            title="Xóa số phụ?"
            description={`Số ${phone.phone} sẽ bị xóa khỏi danh sách.`}
            confirmLabel="Xóa"
            onConfirm={handleDelete}
            isLoading={deleting}
          />
        </div>
      )}
    </li>
  );
}

// ── Dialog (add + edit) ───────────────────────────────────────────────────

function PhoneDialog({
  open, onOpenChange, customerId, editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerId: string;
  editing: CustomerPhoneRecord | null;
}) {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset form khi dialog mở/đổi target
  function handleOpenChange(v: boolean) {
    if (v) {
      setPhone(editing?.phone ?? '');
      setLabel(editing?.label ?? '');
      setNote(editing?.note ?? '');
    }
    onOpenChange(v);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = phone.trim();
    if (!VN_PHONE_RE.test(trimmed)) {
      toast.error('Số điện thoại không hợp lệ (VD: 0901234567)');
      return;
    }

    setSubmitting(true);
    try {
      if (editing) {
        await customerPhonesApi.update(customerId, editing.id, {
          phone: trimmed,
          label: label.trim() || undefined,
          note: note.trim() || undefined,
        });
        toast.success('Đã cập nhật số phụ');
      } else {
        await customerPhonesApi.add(customerId, {
          phone: trimmed,
          label: label.trim() || undefined,
          note: note.trim() || undefined,
        });
        toast.success('Đã thêm số phụ');
      }
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Có lỗi xảy ra');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Sửa số phụ' : 'Thêm số phụ'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="phone">Số điện thoại *</Label>
            <Input
              id="phone" value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0901234567"
              required autoFocus
            />
          </div>
          <div>
            <Label htmlFor="label">Nhãn</Label>
            <Input
              id="label" value={label} maxLength={50}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="VD: Vợ, Thư ký, Công ty"
            />
          </div>
          <div>
            <Label htmlFor="note">Ghi chú</Label>
            <Textarea
              id="note" value={note} maxLength={255}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú thêm (tùy chọn)"
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Đang lưu...' : (editing ? 'Cập nhật' : 'Thêm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
