'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { LabelCombobox } from '@/components/ui/label-combobox';
import { useFormAction } from '@/hooks/use-form-action';

interface LabelOption {
  id: string;
  name: string;
  color: string;
  textColor?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName: string;
  currentLabelId?: string | null;
  labels: LabelOption[];
  /** Callback sau khi PATCH nhãn thành công - parent nhận labelId mới để xử lý side-effect. */
  onSaved?: (labelId: string | null) => void;
}

/**
 * Mini dialog đổi nhãn nhanh khi user click cell "Nhãn" trong leads table.
 * - Mỗi lead chỉ 1 nhãn (Lead schema constraint).
 * - PATCH /leads/:id/label với { labelId | null } (null = bỏ nhãn).
 * - Dùng LabelCombobox (search bỏ dấu tiếng Việt + lazy display) thay Select cũ.
 * - Success → reload page để refresh table (toast + page refresh do useFormAction handle).
 */
export function LeadLabelQuickEditDialog({
  open, onOpenChange, leadId, leadName, currentLabelId, labels, onSaved,
}: Props) {
  const [selected, setSelected] = useState<string>(currentLabelId ?? '');
  const action = useFormAction({ successMessage: 'Đã đổi nhãn' });

  // Reset selected khi dialog mở lại với lead khác.
  useEffect(() => {
    if (open) setSelected(currentLabelId ?? '');
  }, [open, currentLabelId]);

  async function handleSave() {
    const labelId = selected || null;
    const result = await action.execute('patch', `/leads/${leadId}/label`, { labelId });
    if (result) {
      onSaved?.(labelId);
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Đổi nhãn cho lead</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-slate-500 truncate">Lead: <span className="font-medium text-slate-700">{leadName}</span></p>
          <LabelCombobox value={selected} onChange={setSelected} labels={labels} placeholder="Chọn nhãn..." />
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
