'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ProductCombobox } from '@/components/ui/product-combobox';
import { useFormAction } from '@/hooks/use-form-action';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName: string;
  currentProductId?: string | null;
}

/**
 * Mini dialog đổi sản phẩm nhanh khi user click cell "Sản phẩm" trong leads table.
 * - Lead có 1 sản phẩm (Lead.productId nullable).
 * - PATCH /leads/:id với { productId | null } (null = bỏ sản phẩm).
 * - Dùng ProductCombobox (có search bỏ dấu tiếng Việt + cache 24h client-side).
 * - Pattern y hệt LeadLabelQuickEditDialog - duplicate UI để tránh abstract sớm.
 */
export function LeadProductQuickEditDialog({
  open, onOpenChange, leadId, leadName, currentProductId,
}: Props) {
  const [selected, setSelected] = useState<string>(currentProductId ?? '');
  const action = useFormAction({ successMessage: 'Đã đổi sản phẩm' });

  // Reset selected khi dialog mở lại với lead khác.
  useEffect(() => {
    if (open) setSelected(currentProductId ?? '');
  }, [open, currentProductId]);

  async function handleSave() {
    const productId = selected || null;
    const result = await action.execute('patch', `/leads/${leadId}`, { productId });
    if (result) onOpenChange(false);
  }

  function handleClear() {
    setSelected('');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Đổi sản phẩm cho lead</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-slate-500 truncate">
            Lead: <span className="font-medium text-slate-700">{leadName}</span>
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <ProductCombobox value={selected} onChange={setSelected} placeholder="Chọn sản phẩm..." />
            </div>
            {selected && (
              <Button type="button" variant="outline" size="sm" onClick={handleClear} title="Bỏ sản phẩm">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button disabled={action.isLoading} onClick={handleSave}>
            {action.isLoading ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
