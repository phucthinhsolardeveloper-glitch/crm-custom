'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useFormAction } from '@/hooks/use-form-action';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName: string;
  fieldKey: string;
  fieldLabel: string;
  currentValue?: string | null;
}

/**
 * Mini dialog sửa 1 custom field (text) của lead.
 * - Backend: PATCH /leads/:id body { metadata: { [key]: value } } - merge JSONB, validate qua validateCustomMetadata.
 * - Value rỗng ('') → gửi null để xóa key khỏi metadata (leads.service merge: null xóa key).
 */
export function LeadCustomFieldQuickEditDialog({
  open, onOpenChange, leadId, leadName, fieldKey, fieldLabel, currentValue,
}: Props) {
  const [value, setValue] = useState<string>(currentValue ?? '');
  const action = useFormAction({ successMessage: `Đã cập nhật ${fieldLabel}` });

  // Reset về giá trị hiện tại mỗi khi mở dialog.
  useEffect(() => {
    if (open) setValue(currentValue ?? '');
  }, [open, currentValue, fieldKey]);

  async function handleSave() {
    const trimmed = value.trim();
    const result = await action.execute('patch', `/leads/${leadId}`, {
      metadata: { [fieldKey]: trimmed === '' ? null : trimmed },
    });
    if (result) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sửa {fieldLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-slate-500 truncate">
            Lead: <span className="font-medium text-slate-700">{leadName}</span>
          </p>
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
            placeholder={`Nhập ${fieldLabel}`}
          />
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
