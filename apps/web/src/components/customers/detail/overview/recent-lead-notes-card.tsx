'use client';

import { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';

interface LeadNote {
  id: string;
  content: string | null;
  createdAt: string;
  entityId: string;
  user: { id: string; name: string };
}

// 3 note gần nhất từ các lead đã liên kết với customer này.
// Thay thế PinnedNotesCard - lead notes luôn có data (customer convert từ lead), không cần manual pin.
export function RecentLeadNotesCard({ customerId }: { customerId: string }) {
  const [notes, setNotes] = useState<LeadNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ data: LeadNote[] }>(`/customers/${customerId}/recent-lead-notes`)
      .then((r) => !cancelled && setNotes(r.data))
      .catch(() => !cancelled && setError('Không tải được ghi chú từ lead'));
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (notes === null && !error) {
    return (
      <Card>
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      </Card>
    );
  }
  if (error) {
    return (
      <Card>
        <p className="text-xs text-slate-500">{error}</p>
      </Card>
    );
  }
  if (!notes || notes.length === 0) {
    return (
      <Card>
        <EmptyState />
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-slate-900 flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
            <FileText className="w-4 h-4" />
          </span>
          Ghi chú từ Lead
          <span className="text-xs font-semibold text-slate-400">
            ({notes.length} gần nhất)
          </span>
        </h3>
      </div>
      <ul className="space-y-2">
        {notes.map((n) => (
          <NoteRow key={n.id} note={n} />
        ))}
      </ul>
    </Card>
  );
}

function NoteRow({ note }: { note: LeadNote }) {
  return (
    <li className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
      <p className="text-sm text-slate-700 whitespace-pre-wrap line-clamp-3">
        {note.content?.trim() || '(trống)'}
      </p>
      <div className="text-xs text-slate-500 mt-1.5">
        {note.user.name} · {formatDateTime(note.createdAt)}
      </div>
    </li>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <FileText className="h-4 w-4 text-slate-300" />
      Chưa có ghi chú nào từ lead
    </div>
  );
}
