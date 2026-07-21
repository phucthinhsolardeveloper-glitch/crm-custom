'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useFormAction } from '@/hooks/use-form-action';
import type { SettingsItem } from '@/types/entities';

interface LeadGroupBulkMoveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Id các nhóm đang được chọn để dời. */
  groupIds: string[];
  /** Danh sách tất cả Nguồn để chọn nguồn đích. */
  sources: SettingsItem[];
  /** Nguồn đang xem (loại khỏi danh sách đích). */
  currentSourceId: string;
  /** Gọi sau khi dời thành công (vd: xóa cache + bỏ chọn). */
  onSuccess: () => void;
}

/**
 * Hộp thoại đổi nguồn cha cho nhiều nhóm cùng lúc. Gọi POST /lead-groups/bulk-move.
 * Backend đồng bộ source_id của mọi lead thuộc các nhóm -> dữ liệu nhất quán.
 */
export function LeadGroupBulkMoveDialog({
  open, onOpenChange, groupIds, sources, currentSourceId, onSuccess,
}: LeadGroupBulkMoveDialogProps) {
  // Nguồn đích = mọi nguồn trừ nguồn đang xem.
  const targetOptions = useMemo(
    () => sources.filter((s) => s.id !== currentSourceId),
    [sources, currentSourceId],
  );
  const [targetSourceId, setTargetSourceId] = useState<string>(targetOptions[0]?.id ?? '');

  const { execute, isLoading } = useFormAction({
    successMessage: 'Đã chuyển nhóm sang nguồn mới',
    onSuccess,
  });

  async function handleConfirm() {
    if (!targetSourceId) return;
    const result = await execute('post', '/lead-groups/bulk-move', { groupIds, targetSourceId });
    if (result) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đổi nguồn nhóm hàng loạt</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-slate-500">
            Chuyển <span className="font-semibold text-slate-700">{groupIds.length} nhóm</span> sang nguồn mới.
          </p>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Nguồn đích</label>
            {targetOptions.length === 0 ? (
              <p className="text-sm text-slate-400">Chưa có nguồn nào khác để chuyển tới.</p>
            ) : (
              <select
                value={targetSourceId}
                onChange={(e) => setTargetSourceId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
              >
                {targetOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Mọi lead đang thuộc các nhóm này sẽ được chuyển nguồn (source) sang nguồn mới để giữ dữ liệu nhất quán.</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button onClick={handleConfirm} disabled={isLoading || !targetSourceId}>
            {isLoading ? 'Đang chuyển...' : 'Xác nhận chuyển'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
