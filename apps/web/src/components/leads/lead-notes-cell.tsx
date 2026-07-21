'use client';

import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LeadNoteSummary {
  id: string;
  content: string;
  createdAt: string;
}

interface LeadNotesCellProps {
  notes?: LeadNoteSummary[] | null;
  /**
   * Text hiển thị khi lead không có note. Default '-' (slate-300 dim).
   * Truyền '+ ghi chú' để hint click -> mở add dialog.
   */
  emptyPlaceholder?: string;
  /** Click vào text/counter → mở view popup (list all + add inline). */
  onView: () => void;
  /** Click nút [+] xanh → mở add note dialog (NoteDialog). */
  onAdd: () => void;
}

/**
 * Cell hiển thị note đầu tiên (truncate 1 dòng) + counter +N + nút [+] thêm note.
 *
 * Layout:
 *   ┌─────────────────────────────────────────┐
 *   │  Note text truncate...     +N  [+]      │
 *   └─────────────────────────────────────────┘
 *
 * - Click text/counter → onView (mở view popup chi tiết, có ai note, expand v.v.)
 * - Click [+] (sky-blue) → onAdd (mở NoteDialog thêm note)
 * - Empty state: chỉ hiện "+ ghi chú" placeholder, click = onAdd
 */
export function LeadNotesCell({ notes, emptyPlaceholder, onView, onAdd }: LeadNotesCellProps) {
  // Empty state: full placeholder click = onAdd
  if (!notes || notes.length === 0) {
    if (emptyPlaceholder) {
      return (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAdd(); }}
          className="text-sky-500 italic hover:underline text-sm w-full text-left"
        >
          {emptyPlaceholder}
        </button>
      );
    }
    return <span className="text-slate-300 text-sm">-</span>;
  }

  const first = notes[0];
  const extra = notes.length - 1;

  return (
    <div className="flex items-center gap-1.5 max-w-full">
      {/* Text + counter: click → view */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onView(); }}
        className={cn(
          'flex-1 min-w-0 text-left hover:bg-slate-100 rounded px-1 -mx-1 py-0.5 cursor-pointer',
          'inline-flex items-center gap-1.5',
        )}
        title="Xem chi tiết ghi chú"
      >
        <span className="truncate text-sm text-slate-700 flex-1 min-w-0">{first.content}</span>
        {extra > 0 && (
          <span className="shrink-0 rounded-full bg-slate-200 text-slate-700 text-[10px] font-semibold px-1.5 py-0.5">
            +{extra}
          </span>
        )}
      </button>

      {/* [+] add button: cùng hàng với counter, màu xanh biển */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onAdd(); }}
        className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-50 text-sky-600 ring-1 ring-sky-200 hover:bg-sky-100 hover:ring-sky-300 transition-colors"
        title="Thêm ghi chú"
        aria-label="Thêm ghi chú"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}
