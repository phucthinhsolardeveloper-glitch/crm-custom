'use client';

/**
 * Khu feedback (gop y) cho 1 cuoc goi - render trong panel mo rong.
 * - LEADER+ thay form gui feedback (LEADER chi cuoc team - backend tu chan).
 * - USER chi doc feedback ve cuoc cua minh.
 * - Tac gia sua/xoa feedback cua minh; MANAGER+ xoa duoc moi feedback.
 */
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Loader2, Trash2, Pencil, Check, X, MessagesSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import { formatDateTime, cn } from '@/lib/utils';
import { nameInitials, avatarGradient } from './call-log-helpers';
import type { CallFeedbackRecord } from '@/types/entities';

const CAN_FEEDBACK_ROLES = ['LEADER', 'MANAGER', 'SUPER_ADMIN'];

const textareaCls =
  'w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none resize-none';

export function CallLogFeedback({ callLogId }: { callLogId: string }) {
  const { user } = useAuth();
  const canFeedback = !!user && CAN_FEEDBACK_ROLES.includes(user.role);
  const isManager = user?.role === 'MANAGER' || user?.role === 'SUPER_ADMIN';

  const [items, setItems] = useState<CallFeedbackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: CallFeedbackRecord[] }>(`/call-feedbacks?callLogId=${callLogId}`);
      setItems(res.data);
    } catch {
      // 403 (ngoai pham vi) hoac loi -> coi nhu khong co feedback
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [callLogId]);

  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const res = await api.post<{ data: CallFeedbackRecord }>('/call-feedbacks', { callLogId, content: content.trim() });
      setItems((prev) => [res.data, ...prev]);
      setContent('');
      toast.success('Đã gửi feedback');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi gửi feedback');
    } finally {
      setSubmitting(false);
    }
  }

  async function saveEdit(id: string) {
    if (!editContent.trim()) return;
    try {
      const res = await api.patch<{ data: CallFeedbackRecord }>(`/call-feedbacks/${id}`, { content: editContent.trim() });
      setItems((prev) => prev.map((f) => (f.id === id ? res.data : f)));
      setEditingId(null);
      toast.success('Đã cập nhật feedback');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi cập nhật');
    }
  }

  async function remove(id: string) {
    try {
      await api.delete(`/call-feedbacks/${id}`);
      setItems((prev) => prev.filter((f) => f.id !== id));
      toast.success('Đã xoá feedback');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi xoá feedback');
    }
  }

  return (
    <div className="rounded-lg bg-white border border-indigo-200 p-3">
      <div className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-3 flex items-center gap-2">
        <MessagesSquare className="h-3.5 w-3.5" />
        Feedback {items.length > 0 && <span className="rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5 text-[10px] font-bold">{items.length}</span>}
      </div>

      {/* Form gui feedback - chi LEADER+ */}
      {canFeedback && (
        <div className="mb-3">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Gửi góp ý cho cuộc gọi này..."
            rows={2}
            className={textareaCls}
          />
          <div className="flex justify-end mt-1.5">
            <Button size="sm" onClick={submit} disabled={submitting || !content.trim()} className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:opacity-90">
              {submitting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
              Gửi feedback
            </Button>
          </div>
        </div>
      )}

      {/* Danh sach feedback */}
      {loading ? (
        <div className="text-slate-400 text-sm flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải...</div>
      ) : items.length === 0 ? (
        <p className="text-slate-400 italic text-sm">Chưa có feedback nào</p>
      ) : (
        <div className="space-y-2">
          {items.map((f) => {
            const isAuthor = user?.id === f.author.id;
            const editing = editingId === f.id;
            return (
              <div key={f.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <div className={cn('h-6 w-6 rounded-full bg-gradient-to-br grid place-items-center text-white text-[10px] font-bold', avatarGradient(f.author.id))}>
                    {nameInitials(f.author.name)}
                  </div>
                  <span className="text-xs font-semibold text-slate-700">{f.author.name}</span>
                  <span className="text-[11px] text-slate-400">{formatDateTime(f.createdAt)}</span>
                  <div className="ml-auto flex items-center gap-1">
                    {isAuthor && !editing && (
                      <button onClick={() => { setEditingId(f.id); setEditContent(f.content); }} className="text-slate-400 hover:text-sky-600 p-1" aria-label="Sửa">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {(isAuthor || isManager) && !editing && (
                      <button onClick={() => remove(f.id)} className="text-slate-400 hover:text-rose-600 p-1" aria-label="Xoá">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {editing ? (
                  <div>
                    <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={2} className={textareaCls} />
                    <div className="flex justify-end gap-1 mt-1.5">
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="text-slate-400 h-7"><X className="h-3.5 w-3.5 mr-1" />Huỷ</Button>
                      <Button size="sm" onClick={() => saveEdit(f.id)} disabled={!editContent.trim()} className="h-7"><Check className="h-3.5 w-3.5 mr-1" />Lưu</Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-700 whitespace-pre-wrap pl-8">{f.content}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
