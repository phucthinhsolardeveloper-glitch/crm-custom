'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ArrowRight, Trash2, RefreshCcw } from 'lucide-react';
import { userPhonesApi } from '@/lib/api/user-phones';
import type { UserPhoneHistoryRecord } from '@/types/entities';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phoneId: string;
  phoneNumber: string;
}

const REASON_LABELS: Record<UserPhoneHistoryRecord['reason'], { label: string; icon: typeof ArrowRight }> = {
  TRANSFERRED: { label: 'Chuyển nhân viên', icon: ArrowRight },
  DELETED: { label: 'Xóa SĐT phân', icon: Trash2 },
  REASSIGNED: { label: 'Phân lại', icon: RefreshCcw },
};

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function UserPhoneHistoryDialog({ open, onOpenChange, phoneId, phoneNumber }: Props) {
  const [history, setHistory] = useState<UserPhoneHistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    userPhonesApi.history(phoneId)
      .then((res) => setHistory(res.data))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [open, phoneId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Lịch sử SĐT {phoneNumber}</DialogTitle>
          <DialogDescription>Các lần chuyển/xóa SĐT này.</DialogDescription>
        </DialogHeader>
        <div className="max-h-96 space-y-2 overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-sm text-slate-500">Đang tải...</div>
          ) : history.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">Chưa có thay đổi nào</div>
          ) : (
            history.map((h) => {
              const meta = REASON_LABELS[h.reason] ?? REASON_LABELS.TRANSFERRED;
              const Icon = meta.icon;
              return (
                <div key={h.id} className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <Icon className="h-4 w-4 mt-0.5 shrink-0 text-sky-500" />
                  <div className="flex-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{meta.label}</span>
                      <span className="text-xs text-slate-400">{fmtDateTime(h.releasedAt)}</span>
                    </div>
                    <div className="mt-0.5 text-slate-600">
                      Từ <span className="font-medium">{h.user?.name ?? `User #${h.userId}`}</span>
                      {' - bởi '}
                      <span className="font-medium">{h.changer?.name ?? `User #${h.changedBy}`}</span>
                    </div>
                    {h.note && <div className="mt-1 text-xs italic text-slate-500">"{h.note}"</div>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
