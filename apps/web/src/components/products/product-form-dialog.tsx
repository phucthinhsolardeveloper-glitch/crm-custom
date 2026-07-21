'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FormField } from '@/components/shared/form-field';
import { productSchema, parseZodErrors } from '@/lib/zod-form-validation-schemas';
import { api } from '@/lib/api-client';
import { formatVND } from '@/lib/utils';
import { X, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { ProductRecord } from '@/types/entities';

interface LookupProduct { id: string; name: string; price?: number }

interface ProductFormDialogProps {
  open: boolean;
  editingProduct: ProductRecord | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const EMPTY = { name: '', price: '', description: '', vatRate: '0' };

/** Dialog tạo/sửa sản phẩm. Có tuỳ chọn "Đây là combo" -> chọn các SP con. */
export function ProductFormDialog({ open, editingProduct, onOpenChange, onSaved }: ProductFormDialogProps) {
  const [form, setForm] = useState(EMPTY);
  const [isCombo, setIsCombo] = useState(false);
  const [childIds, setChildIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // Danh sách SP thường (không phải combo, đang bán) để chọn làm SP con.
  const [candidates, setCandidates] = useState<LookupProduct[]>([]);
  const [childSearch, setChildSearch] = useState(''); // ô tìm SP con trong combo

  // Nạp lại form mỗi khi mở dialog hoặc đổi SP đang sửa.
  useEffect(() => {
    if (!open) return;
    if (editingProduct) {
      setForm({
        name: editingProduct.name || '',
        price: String(editingProduct.price ?? ''),
        description: editingProduct.description || '',
        vatRate: String(editingProduct.vatRate ?? 0),
      });
      setIsCombo(!!editingProduct.isCombo);
      setChildIds(editingProduct.comboItems?.map((ci) => ci.child.id) ?? []);
    } else {
      setForm(EMPTY);
      setIsCombo(false);
      setChildIds([]);
    }
    setErrors({});
    setChildSearch('');
  }, [open, editingProduct]);

  // Tải danh sách SP con ứng viên khi bật combo (1 lần).
  useEffect(() => {
    if (!open || !isCombo || candidates.length) return;
    api
      .get<{ data: LookupProduct[] }>('/products?type=normal&limit=500&includeInactive=false')
      .then((r) => setCandidates(r.data ?? []))
      .catch(() => { /* để trống danh sách */ });
  }, [open, isCombo, candidates.length]);

  function set(key: keyof typeof EMPTY, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function addChild(id: string) {
    if (!childIds.includes(id)) setChildIds((prev) => [...prev, id]);
    if (errors.combo) setErrors((prev) => ({ ...prev, combo: '' }));
    setChildSearch('');
  }
  function removeChild(id: string) {
    setChildIds((prev) => prev.filter((x) => x !== id));
  }

  async function submit() {
    const parsed = productSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(parseZodErrors(parsed.error));
      return;
    }
    if (isCombo && childIds.length === 0) {
      setErrors({ combo: 'Combo phải có ít nhất 1 sản phẩm con' });
      return;
    }
    const body: Record<string, unknown> = {
      name: form.name,
      price: Number(form.price),
      vatRate: Number(form.vatRate) || 0,
      isCombo,
    };
    if (form.description) body.description = form.description;
    if (isCombo) body.childProductIds = childIds;

    setSaving(true);
    try {
      if (editingProduct) await api.patch(`/products/${editingProduct.id}`, body);
      else await api.post('/products', body);
      toast.success('Đã lưu sản phẩm');
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi lưu sản phẩm');
    }
    setSaving(false);
  }

  const q = childSearch.trim().toLowerCase();
  const available = candidates.filter(
    (c) =>
      !childIds.includes(c.id) &&
      c.id !== editingProduct?.id &&
      (q === '' || c.name.toLowerCase().includes(q)),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingProduct ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <FormField label="Tên sản phẩm" required error={errors.name}>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="VD: Khóa học ABC" />
          </FormField>
          <FormField label={isCombo ? 'Giá combo (VNĐ)' : 'Giá (VNĐ)'} required error={errors.price}>
            <Input type="number" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="1000000" />
          </FormField>
          <FormField label="Thuế VAT (%)">
            <Input type="number" value={form.vatRate} onChange={(e) => set('vatRate', e.target.value)} placeholder="0" />
          </FormField>

          {/* Tuỳ chọn combo */}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-dashed border-sky-300 bg-sky-50/60 p-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-sky-500"
              checked={isCombo}
              onChange={(e) => setIsCombo(e.target.checked)}
            />
            <span>
              <span className="block text-sm font-semibold text-slate-800">Đây là combo</span>
              <span className="block text-xs text-slate-500">Combo gom nhiều sản phẩm con. Khi tạo đơn, nhân viên nhập giá riêng cho combo.</span>
            </span>
          </label>

          {isCombo && (
            <FormField label="Sản phẩm con trong combo" required error={errors.combo}>
              {/* Ô tìm kiếm SP con */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={childSearch}
                  onChange={(e) => setChildSearch(e.target.value)}
                  placeholder="Tìm sản phẩm để thêm..."
                  className="pl-9"
                />
              </div>
              {/* Danh sách kết quả - bấm để thêm vào combo */}
              {(childSearch.trim() !== '' || available.length > 0) && (
                <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-slate-200">
                  {available.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-slate-400">Không tìm thấy sản phẩm phù hợp</div>
                  ) : available.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => addChild(c.id)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-sky-50"
                    >
                      <span className="text-slate-700">{c.name}</span>
                      {c.price ? <span className="text-xs text-slate-400">{formatVND(Number(c.price))}</span> : null}
                    </button>
                  ))}
                </div>
              )}
              {/* Chips các SP con đã chọn */}
              {childIds.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {childIds.map((id) => {
                    const c = candidates.find((x) => x.id === id);
                    return (
                      <span key={id} className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-white px-2.5 py-1 text-xs font-semibold text-sky-700">
                        {c?.name ?? `SP #${id}`}
                        <button type="button" onClick={() => removeChild(id)} className="text-red-400 hover:text-red-600">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </FormField>
          )}

          <FormField label="Mô tả">
            <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Mô tả sản phẩm..." />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
