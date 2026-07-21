'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { GroupCombobox } from '@/components/ui/group-combobox';
import { useFormAction } from '@/hooks/use-form-action';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName: string;
  currentGroupId?: string | null;
}

/**
 * Mini dialog đổi nhóm (lead group) cho lead.
 * - Backend: PATCH /leads/:id body { groupId } - MANAGER+ only (UI gate ở caller)
 * - Chọn nhóm -> backend tự sync sourceId = nguồn cha của nhóm (1 thao tác set cả nguồn + nhóm)
 * - Audit log auto qua AuditLogInterceptor (action LEAD_UPDATE)
 * - GroupCombobox có search + hiện tên nguồn cha, KHÔNG cần chọn nguồn trước.
 * - Nút "Bỏ nhóm" để clear groupId (set null).
 */
export function LeadGroupQuickEditDialog({
  open, onOpenChange, leadId, leadName, currentGroupId,
}: Props) {
  const [selected, setSelected] = useState<string>(currentGroupId ?? '');
  const action = useFormAction({ successMessage: 'Đã đổi nhóm' });

  // Reset selected khi mở dialog
  useEffect(() => {
    if (open) setSelected(currentGroupId ?? '');
  }, [open, currentGroupId]);

  async function handleSave() {
    // selected='' → null (bỏ nhóm). PATCH body chỉ chứa groupId field.
    const groupId = selected || null;
    const result = await action.execute('patch', `/leads/${leadId}`, { groupId });
    if (result) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Đổi nhóm lead</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-slate-500 truncate">
            Lead: <span className="font-medium text-slate-700">{leadName}</span>
          </p>
          <GroupCombobox value={selected} onChange={setSelected} placeholder="Chọn nhóm" />
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">Chọn nhóm sẽ tự gán luôn nguồn cha tương ứng.</p>
            {selected && (
              <button
                type="button"
                onClick={() => setSelected('')}
                className="text-xs text-slate-500 hover:text-red-600 hover:underline shrink-0 ml-2"
              >
                Bỏ nhóm
              </button>
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
