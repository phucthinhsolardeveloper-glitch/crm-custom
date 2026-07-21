'use client';

import { useState, useEffect } from 'react';
import { Star, Loader2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { toast } from 'sonner';

interface Note {
  id: string;
  content: string | null;
  createdAt: string;
  isPinned?: boolean;
  user: { id: string; name: string } | null;
}

export function TabNotes({ customerId }: { customerId: string }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const r = await api.get<{ data: Note[] }>(
      `/customers/${customerId}/activities?type=NOTE&limit=100`,
    );
    setNotes(r.data);
  }

  useEffect(() => {
    load().catch(() => setNotes([]));
  }, [customerId]);

  async function togglePin(note: Note) {
    setBusyId(note.id);
    try {
      if (note.isPinned) {
        await api.delete(`/customers/${customerId}/notes/${note.id}/pin`);
      } else {
        await api.post(`/customers/${customerId}/notes/${note.id}/pin`);
      }
      toast.success(note.isPinned ? 'Đã bỏ ghim' : 'Đã ghim');
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Lỗi cập nhật';
      toast.error(message);
    } finally {
      setBusyId(null);
    }
  }

  if (notes === null) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      </div>
    );
  }
  if (notes.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
        <div className="text-4xl mb-2">📝</div>
        <div className="text-sm font-semibold text-slate-700">Chưa có note</div>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {notes.map((note) => (
        <li
          key={note.id}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex items-start gap-3"
        >
          <button
            type="button"
            onClick={() => togglePin(note)}
            disabled={busyId === note.id}
            className="shrink-0 disabled:opacity-50"
            aria-label={note.isPinned ? 'Bỏ ghim note' : 'Ghim note'}
          >
            <Star
              className={`h-5 w-5 transition-colors ${
                note.isPinned
                  ? 'fill-amber-400 text-amber-400'
                  : 'text-slate-300 hover:text-amber-400'
              }`}
            />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-800 whitespace-pre-wrap">{note.content ?? '(trống)'}</p>
            <div className="mt-1.5 text-[11px] text-slate-500">
              {note.user?.name ?? 'Hệ thống'} · {formatDateTime(note.createdAt)}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
