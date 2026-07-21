'use client';

import { X } from 'lucide-react';
import type { LarkSyncLogItem } from './lark-sync-history-tab';

interface Props {
  log: LarkSyncLogItem;
  onClose: () => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Popup xem JSON day du: du lieu gui len Lark + phan hoi Lark tra ve. */
export function LarkSyncLogJsonDialog({ log, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800">Chi tiết lần đồng bộ</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              TT-{log.paymentId} · {log.channelName} · {formatTime(log.syncedAt)}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase mb-1.5">
              → Dữ liệu GỬI lên Lark (request)
            </p>
            <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-x-auto text-xs leading-relaxed text-slate-700 font-mono">
              {JSON.stringify(log.requestPayload ?? {}, null, 2)}
            </pre>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase mb-1.5">
              ← Phản hồi Lark trả về (response)
            </p>
            <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-x-auto text-xs leading-relaxed text-slate-700 font-mono">
              {JSON.stringify(log.larkResponse ?? {}, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
