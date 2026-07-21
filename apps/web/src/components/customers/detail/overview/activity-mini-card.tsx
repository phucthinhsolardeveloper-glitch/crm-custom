'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Activity, Loader2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';

interface ActivityItem {
  id: string;
  type: string;
  content: string | null;
  createdAt: string;
  user: { id: string; name: string } | null;
}

const TYPE_LABEL: Record<string, string> = {
  NOTE: '📝 Note',
  CALL: '📞 Gọi',
  STATUS_CHANGE: '🔄 Đổi trạng thái',
  ASSIGNMENT: '👤 Phân công',
  LABEL_CHANGE: '🏷️ Đổi nhãn',
  SYSTEM: '⚙️ Hệ thống',
};

export function ActivityMiniCard({ customerId }: { customerId: string }) {
  const [items, setItems] = useState<ActivityItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ data: ActivityItem[] }>(`/customers/${customerId}/activities?limit=4`)
      .then((r) => !cancelled && setItems(r.data.slice(0, 4)))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm h-full transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between mb-2">
        <h5 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          <Activity className="h-4 w-4 text-cyan-600" /> Hoạt động gần đây
        </h5>
        <Link
          href={`/customers/${customerId}?tab=activity`}
          className="text-xs font-semibold text-sky-600 hover:underline"
        >
          Xem timeline
        </Link>
      </div>
      {items === null && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      {items && items.length === 0 && (
        <p className="text-xs text-slate-500">Chưa có hoạt động</p>
      )}
      {items && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="text-xs">
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-slate-400 mt-0.5 shrink-0 w-24">
                  {formatDateTime(item.createdAt)}
                </span>
                <span className="text-slate-700 truncate flex-1" title={item.content ?? ''}>
                  <span className="font-semibold">{TYPE_LABEL[item.type] ?? item.type}</span>
                  {item.content && <span className="text-slate-500"> · {item.content}</span>}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
