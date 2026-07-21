'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api-client';

interface Department { id: string; name: string }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 'zoom' (kho Zoom toàn cục) hoặc 'new' (Kho Mới - cần dept match). */
  poolMode: 'new' | 'zoom';
  /** Số lead sẽ chia (chỉ dùng cho hiển thị + dependency). */
  leadCount: number;
  departments: Department[];
  onDistributed: () => void;
}

/**
 * Dialog "AI Chia số / Chia toàn bộ" - chọn department đích, gọi distribution API.
 * - poolMode='zoom' -> POST /distribution/distribute-zoom/:deptId (lấy thêm ZOOM leads).
 * - poolMode='new' -> POST /distribution/distribute/:deptId (chỉ POOL).
 */
export function LeadPoolDistributeDialog({
  open, onOpenChange, poolMode, leadCount, departments, onDistributed,
}: Props) {
  const [deptId, setDeptId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleOpenChange(v: boolean) {
    if (v) setDeptId('');
    onOpenChange(v);
  }

  async function handleSubmit() {
    if (!deptId) return;
    setSubmitting(true);
    try {
      const url = poolMode === 'zoom'
        ? `/distribution/distribute-zoom/${deptId}`
        : `/distribution/distribute/${deptId}`;
      const res = await api.post<{ data: { distributed: number; total: number } }>(url, {});
      const { distributed, total } = res.data || { distributed: 0, total: 0 };
      if (distributed === 0) {
        toast.warning('Không có lead nào được chia (kiểm tra cấu hình AI của phòng ban)');
      } else if (distributed < total) {
        toast.success(`Đã chia ${distributed}/${total} leads (còn ${total - distributed} chờ lần sau)`);
      } else {
        toast.success(`Đã chia ${distributed} leads thành công`);
      }
      onOpenChange(false);
      onDistributed();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi phân phối AI');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI chia leads cho phòng ban</DialogTitle>
          <DialogDescription>
            Hệ thống sẽ chấm điểm nhân viên trong phòng ban đã chọn và round-robin chia
            tối đa 100 leads/lần. {leadCount > 0 && `Hiện có ${leadCount} lead khả dụng.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Select value={deptId} onValueChange={setDeptId}>
            <SelectTrigger><SelectValue placeholder="Chọn phòng ban đích" /></SelectTrigger>
            <SelectContent>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {poolMode === 'zoom' && (
            <p className="text-xs text-slate-500">
              Lưu ý: leads ZOOM (nguồn skipPool) sẽ được phân về phòng ban đã chọn và chuyển
              status sang ASSIGNED.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button onClick={handleSubmit} disabled={!deptId || submitting}>
            {submitting ? 'Đang chia...' : 'Chia ngay'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
