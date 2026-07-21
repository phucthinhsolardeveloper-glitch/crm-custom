'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Plus, ChevronDown, ChevronUp, Clock, MessageSquare } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { getUserBadgeColor } from '@/lib/utils/user-color';
import { cn, formatDateTime } from '@/lib/utils';

/**
 * View popup cho note column. Hiển thị toàn bộ note của lead với:
 *  - Badge tên user (màu tươi deterministic theo userId)
 *  - Timestamp relative
 *  - Content truncate 1 dòng + "xem thêm" expand (scroll trong note, không vượt khung)
 *  - Inline add note ở footer (không cần mở dialog khác)
 *
 * Audit log: BE auto qua AuditLogInterceptor (action ACTIVITY_CREATE).
 */

interface ActivityNote {
  id: string;
  type: string;
  content: string;
  createdAt: string;
  user?: { id: string; name: string } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName?: string;
}

const TRUNCATE_CHAR_THRESHOLD = 80; // length > 80 → hiện "xem thêm"

export function LeadNotesViewDialog({ open, onOpenChange, leadId, leadName }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState<ActivityNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Track first-load để tránh flash "Chưa có" khi đang loading
  const firstLoadRef = useRef(true);

  // Fetch khi mở
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    firstLoadRef.current = true;
    api.get<{ data: ActivityNote[] }>(`/leads/${leadId}/activities`)
      .then((res) => {
        // Filter chỉ NOTE - timeline có thể chứa STATUS_CHANGE, ASSIGN etc.
        const onlyNotes = (res.data || []).filter((a) => a.type === 'NOTE');
        setNotes(onlyNotes);
      })
      .catch(() => toast.error('Không tải được ghi chú'))
      .finally(() => {
        setLoading(false);
        firstLoadRef.current = false;
      });
  }, [open, leadId]);

  // Reset khi đóng
  useEffect(() => {
    if (!open) {
      setExpandedIds(new Set());
      setDraft('');
    }
  }, [open]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmitNote() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const res = await api.post<{ data: ActivityNote }>(`/leads/${leadId}/activities`, {
        type: 'NOTE',
        content: trimmed,
      });
      // Optimistic prepend - không cần refetch toàn bộ list
      if (res.data) {
        setNotes((prev) => [res.data, ...prev]);
      }
      setDraft('');
      toast.success('Đã thêm ghi chú');
      // refresh để cell counter update (parent table re-fetch)
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi thêm ghi chú';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Ctrl/Cmd + Enter → submit
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmitNote();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-3 border-b border-slate-100">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4 text-sky-600" />
            Ghi chú
            {leadName && <span className="text-sm font-normal text-slate-500 truncate">- {leadName}</span>}
          </DialogTitle>
        </DialogHeader>

        {/* Body: scrollable list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2 min-h-0">
          {loading && (
            <div className="py-6 text-center text-slate-400 text-sm">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
              Đang tải...
            </div>
          )}

          {!loading && notes.length === 0 && (
            <div className="py-6 text-center text-slate-400 text-sm">
              Chưa có ghi chú nào. Thêm ghi chú đầu tiên bên dưới.
            </div>
          )}

          {!loading && notes.map((note) => {
            const expanded = expandedIds.has(note.id);
            const canExpand = note.content.length > TRUNCATE_CHAR_THRESHOLD;
            const userColor = getUserBadgeColor(note.user?.id);
            return (
              <div key={note.id} className="rounded-md border border-slate-100 bg-slate-50/40 p-2">
                {/* Top row: user badge + timestamp */}
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{ backgroundColor: userColor.bg, color: userColor.text }}
                  >
                    {note.user?.name ?? 'Không rõ'}
                  </span>
                  <span className="text-[10px] text-slate-400 inline-flex items-center gap-1 shrink-0">
                    <Clock className="h-3 w-3" />
                    {formatDateTime(note.createdAt)}
                  </span>
                </div>

                {/* Content + expand */}
                <div
                  className={cn(
                    'text-sm text-slate-700 whitespace-pre-wrap break-words',
                    !expanded && canExpand && 'line-clamp-1',
                    expanded && 'max-h-32 overflow-auto',
                  )}
                >
                  {note.content}
                </div>

                {canExpand && (
                  <button
                    type="button"
                    onClick={() => toggleExpand(note.id)}
                    className="mt-1 inline-flex items-center gap-0.5 text-[11px] text-sky-600 hover:text-sky-700"
                  >
                    {expanded ? (
                      <>
                        <ChevronUp className="h-3 w-3" />
                        Thu gọn
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3" />
                        Xem thêm
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer: inline add */}
        <div className="border-t border-slate-100 px-5 py-3 space-y-2 shrink-0">
          <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1">
            <Plus className="h-3 w-3" />
            Thêm ghi chú mới
          </label>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nội dung ghi chú... (Ctrl+Enter để gửi)"
            rows={2}
            className="resize-none"
            disabled={submitting}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleSubmitNote}
              disabled={!draft.trim() || submitting}
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Gửi
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
