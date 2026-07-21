'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import type { CustomerTier } from '@/types/entities';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createCustomerTier, updateCustomerTier, type CustomerTierInput } from '@/lib/api/customer-tiers';
import { TierBadge } from '@/components/customers/tier-badge';

const ICON_OPTIONS = ['Award', 'Trophy', 'Medal', 'Gem', 'Crown', 'Star'];

interface Props {
  tier?: CustomerTier | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (tier: CustomerTier, recalcTriggered: boolean) => void;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

export function TierFormDialog({ tier, open, onOpenChange, onSuccess }: Props) {
  const isEdit = !!tier;
  const [form, setForm] = useState<CustomerTierInput>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (tier) {
      setForm({
        name: tier.name,
        slug: tier.slug,
        minSpending: tier.minSpending,
        color: tier.color,
        emoji: tier.emoji,
        iconKey: tier.iconKey,
        sortOrder: tier.sortOrder,
        benefits: tier.benefits,
        isActive: tier.isActive,
      });
    } else {
      setForm({
        name: '',
        slug: '',
        minSpending: 0,
        color: '#0ea5e9',
        emoji: null,
        iconKey: 'Award',
        sortOrder: 999,
        benefits: '',
        isActive: true,
      });
    }
  }, [tier, open]);

  const handleNameChange = (name: string) => {
    setForm((f) => ({
      ...f,
      name,
      // Auto-gen slug chỉ khi create (lock sau khi save để tránh break ref)
      slug: isEdit ? f.slug : slugify(name),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.slug || !form.color) {
      toast.error('Vui lòng điền đầy đủ các trường bắt buộc');
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit && tier) {
        const res = await updateCustomerTier(tier.id, form);
        toast.success(`Cập nhật tier "${form.name}"`);
        onSuccess(res.data, res.recalcTriggered);
        if (res.recalcTriggered) {
          toast.info('Đang tính lại hạng cho toàn bộ KH (chạy nền)');
        }
      } else {
        const created = await createCustomerTier(form);
        toast.success(`Đã tạo tier "${form.name}"`);
        onSuccess(created, false);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi khi lưu');
    } finally {
      setSubmitting(false);
    }
  };

  const previewTier = {
    name: form.name || 'Tên hạng',
    color: form.color || '#0ea5e9',
    emoji: form.emoji ?? null,
    iconKey: form.iconKey ?? null,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Sửa tier' : 'Thêm tier mới'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Live preview */}
          <div className="flex justify-center py-3 bg-slate-50 rounded-lg">
            <TierBadge tier={previewTier} size="md" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tên hạng *">
              <input
                required
                value={form.name ?? ''}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-200"
                maxLength={50}
              />
            </Field>
            <Field label="Slug *">
              <input
                required
                value={form.slug ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                disabled={isEdit}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono disabled:bg-slate-100"
                pattern="[a-z0-9-]{2,30}"
              />
            </Field>
          </div>

          <Field label="Ngưỡng chi tiêu (VND) *">
            <input
              required
              type="number"
              min={0}
              step={1000}
              value={form.minSpending ?? 0}
              onChange={(e) => setForm((f) => ({ ...f, minSpending: Number(e.target.value) }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Màu *">
              <div className="flex gap-2">
                <input
                  type="color"
                  value={form.color ?? '#0ea5e9'}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="h-10 w-12 border border-slate-300 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={form.color ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                  pattern="^#[0-9a-fA-F]{6}$"
                />
              </div>
            </Field>
            <Field label="Emoji (ưu tiên hơn icon)">
              <input
                type="text"
                value={form.emoji ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value || null }))}
                placeholder="VD: 💎 🥇 🏆"
                maxLength={8}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </Field>
          </div>

          <Field label="Icon (dùng khi emoji trống)">
            <select
              value={form.iconKey ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, iconKey: e.target.value || null }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            >
              <option value="">- Không có -</option>
              {ICON_OPTIONS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </Field>

          <Field label="Quyền lợi (optional)">
            <textarea
              value={form.benefits ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, benefits: e.target.value }))}
              maxLength={500}
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none"
            />
          </Field>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={form.isActive ?? true}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            <label htmlFor="isActive" className="text-sm text-slate-700">Hoạt động</label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-sky-500 hover:bg-sky-600 rounded-lg disabled:opacity-50"
            >
              {submitting ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Tạo mới'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
