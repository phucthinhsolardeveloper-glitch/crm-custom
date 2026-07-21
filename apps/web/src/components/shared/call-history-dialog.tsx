'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogHeader } from '@/components/ui/dialog';
import { api } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { formatPhoneDisplay } from '@crm/utils';
import { Loader2, PhoneIncoming, PhoneOutgoing, PhoneMissed } from 'lucide-react';

interface CallLogItem {
  id: string;
  phoneNumber: string;
  callType: string; // INCOMING / OUTGOING / MISSED
  callTime: string;
  duration?: number;
  content?: string | null;
  analysis?: string | null;
  matchStatus: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phone: string;
}

const CALL_TYPE_LABEL: Record<string, string> = {
  INCOMING: 'Gọi đến',
  OUTGOING: 'Gọi đi',
  MISSED: 'Nhỡ',
};

function CallTypeIcon({ type }: { type: string }) {
  if (type === 'INCOMING') return <PhoneIncoming className="h-3.5 w-3.5 text-emerald-600" />;
  if (type === 'OUTGOING') return <PhoneOutgoing className="h-3.5 w-3.5 text-sky-600" />;
  return <PhoneMissed className="h-3.5 w-3.5 text-red-500" />;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '-';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Dialog lists call history for a specific phone number.
 * Fetches GET /call-logs?phone=X&limit=20 (already filtered by user role on backend).
 */
export function CallHistoryDialog({ open, onOpenChange, phone }: Props) {
  const [logs, setLogs] = useState<CallLogItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .get<{ data: CallLogItem[] }>(`/call-logs?phone=${encodeURIComponent(phone)}&limit=20`)
      .then((res) => setLogs(res.data || []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [open, phone]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lịch sử cuộc gọi - {formatPhoneDisplay(phone)}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-slate-400">Chưa có cuộc gọi nào</div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="border border-slate-200 rounded-lg p-3 bg-white hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <CallTypeIcon type={log.callType} />
                    <span className="text-sm font-medium text-slate-900">
                      {CALL_TYPE_LABEL[log.callType] || log.callType}
                    </span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs text-slate-500">{formatDateTime(log.callTime)}</span>
                  </div>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {formatDuration(log.duration)}
                  </span>
                </div>
                {log.analysis && (
                  <p className="text-xs text-slate-600 mt-1.5 whitespace-pre-line">{log.analysis}</p>
                )}
                {!log.analysis && log.content && (
                  <p className="text-xs text-slate-500 mt-1.5 whitespace-pre-line line-clamp-3">
                    {log.content}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
