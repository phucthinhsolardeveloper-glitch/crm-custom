'use client';

import { useState } from 'react';
import { Package, Check, MoreVertical, Phone, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PhoneCell } from '@/components/leads/phone-cell';
import { LabelPill } from '@/components/leads/label-pill';
import { LeadActionMenu } from '@/components/leads/lead-action-menu';
import type { LeadRecord } from '@/types/entities';
import { LeadPoolActionButtons } from '@/components/leads/lead-pool-action-buttons';
import { LeadNotesCell } from '@/components/leads/lead-notes-cell';
import { LeadNotesViewDialog } from '@/components/leads/lead-notes-view-dialog';
import NoteDialog from '@/components/shared/note-dialog';
import { useLongPress } from '@/hooks/use-long-press';
import { useOmiCall } from '@/providers/omicall-provider';
import type { ExcelLead } from '@/components/leads/lead-table-excel';

type UserRole = 'USER' | 'MANAGER' | 'SUPER_ADMIN';

interface LeadMobileCardProps {
  lead: ExcelLead;
  /** Có đang trong selection mode (bulk select)? */
  selectionMode: boolean;
  selected: boolean;
  /** Toggle selection (selection mode bật) - tap card khi mode on. */
  onToggleSelect: () => void;
  /** Long-press kích hoạt selection mode + select card này. */
  onEnterSelectionMode: () => void;
  /** Tap card khi mode OFF - mở quick detail sheet ở parent (KHÔNG mở edit drawer). */
  onOpenDetail: () => void;
  userRole: UserRole;
  /** Danh sách nhân viên cho dialog "Phân" (LeadPoolActionButtons, manager+). */
  users?: { id: string; name: string }[];
}

/** Compact relative-time hiển thị "2 giờ", "12 phút", "1 ngày", "Vừa xong". */
function relativeTime(iso?: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'Vừa xong';
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ`;
  const d = Math.floor(h / 24);
  return `${d} ngày`;
}

/**
 * Card hiển thị 1 lead trên mobile (< 768px). Thay thế row của LeadTableExcel.
 *
 * Tương tác :
 * - Tap (selection mode OFF) → onOpenDetail (mở LeadMobileQuickDetailSheet -
 *   xem info + chọn hành động; tránh mở nhầm form sửa như behavior cũ).
 * - Tap (selection mode ON)  → onToggleSelect (chọn/bỏ chọn).
 * - Long-press 500ms        → onEnterSelectionMode (bật mode + select card này).
 *
 * Hàng nút hành động dưới card (min-height 40px, có border-top ngăn cách):
 * - Gọi (OmiCall) + Ghi chú: mọi lead.
 * - Nhận/Phân (LeadPoolActionButtons): chỉ lead trong kho (POOL/FLOATING chưa chủ).
 *
 * Action zones (button menu, phone-cell icons, notes, action row) có wrapper
 * `onPointerDown stopPropagation` để tránh trigger long-press khi tap button.
 */
export function LeadMobileCard({
  lead,
  selectionMode,
  selected,
  onToggleSelect,
  onEnterSelectionMode,
  onOpenDetail,
  userRole,
  users = [],
}: LeadMobileCardProps) {
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [viewNotesOpen, setViewNotesOpen] = useState(false);
  const { makeCall, isReady } = useOmiCall();

  const longPressBind = useLongPress({
    onLongPress: () => {
      // Trigger haptic feedback trên device hỗ trợ (Android Chrome, Safari iOS 16+).
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(30);
      onEnterSelectionMode();
    },
    onTap: () => {
      if (selectionMode) onToggleSelect();
      else onOpenDetail();
    },
    ms: 500,
  });

  // Lead đã được phân (có assignedUser) → render sale strip + ẩn nút Nhận/Phân.
  const isDistributed = lead.status !== 'POOL' && !!lead.assignedUser;
  // Lead trong pool/floating → render nút Nhận/Phân ở action row.
  const isPoolLead = (lead.status === 'POOL' || lead.status === 'FLOATING') && !lead.assignedUser;

  const hasOrder = (lead.orders?.length ?? 0) > 0;
  const aiLevel = lead.metadata?.aiLevel;
  const aiScore = lead.metadata?.aiScore;

  return (
    <div
      {...longPressBind}
      className={cn(
        'relative rounded-xl border bg-white p-3 shadow-soft transition-colors select-none',
        selected
          ? 'border-sky-500 ring-2 ring-sky-200 bg-gradient-to-br from-sky-50 to-cyan-50'
          : 'border-slate-200 hover:border-sky-300',
      )}
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {/* Row 1: checkbox/name/badges/menu */}
      <div className="flex items-center gap-2 mb-2">
        {selectionMode && (
          <span
            className={cn(
              'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border-2 transition-colors',
              selected
                ? 'border-sky-500 bg-sky-500 text-white'
                : 'border-slate-300 bg-white',
            )}
          >
            {selected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
          </span>
        )}
        <div className="flex-1 min-w-0 font-semibold text-slate-800 truncate">
          {lead.name}
        </div>

        {/* AI level badge - chỉ HOT/WARM render màu, còn lại slate */}
        {aiLevel && (
          <span
            className={cn(
              'flex-shrink-0 rounded text-[10px] font-bold px-1.5 py-0.5',
              aiLevel === 'HOT' ? 'bg-red-50 text-red-700'
                : aiLevel === 'WARM' ? 'bg-amber-50 text-amber-700'
                : 'bg-slate-100 text-slate-600',
            )}
          >
            {aiLevel}{aiScore != null ? ` ${aiScore}` : ''}
          </span>
        )}

        {hasOrder && (
          <span className="flex-shrink-0 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5">
            ĐÃ MUA
          </span>
        )}

        {/* Action menu chỉ render khi không trong selection mode. Wrapper
            onPointerDown stop để long-press card không trigger khi tap pencil. */}
        {!selectionMode && (
          <div onPointerDown={(e) => e.stopPropagation()} className="flex-shrink-0">
            <LeadActionMenu
              leadId={lead.id}
              lead={lead as unknown as Partial<LeadRecord>}
              userRole={userRole}
            />
          </div>
        )}
        {selectionMode && (
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center text-slate-300">
            <MoreVertical className="h-4 w-4" />
          </span>
        )}
      </div>

      {/* Row 2: phone (full PhoneCell với 3 icon + carrier + dup) */}
      <div onPointerDown={(e) => e.stopPropagation()}>
        <PhoneCell
          leadId={lead.id}
          phone={lead.phone}
          leadName={lead.name}
          duplicateCount={lead.duplicateCount}
        />
      </div>

      {/* Row 3: product + source */}
      {(lead.product?.name || lead.source?.name) && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-600">
          <Package className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
          <span className="font-medium text-slate-700 truncate">
            {lead.product?.name || '-'}
          </span>
          {lead.source?.name && (
            <span className="text-slate-400 flex-shrink-0">· {lead.source.name}</span>
          )}
        </div>
      )}

      {/* Row 4: sale assigned strip (chỉ khi distributed) */}
      {isDistributed && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-gradient-to-r from-sky-50 to-cyan-50 px-2.5 py-1.5 text-xs text-sky-700">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-500 ring-2 ring-sky-100" />
          <span>
            Sale: <strong className="font-semibold">{lead.assignedUser?.name}</strong>
          </span>
          {lead.lastAssignedAt && (
            <span className="ml-auto text-[11px] text-slate-500">
              {relativeTime(lead.lastAssignedAt)} trước
            </span>
          )}
        </div>
      )}

      {/* Row 5: notes preview (chỉ render khi có note hoặc cho user thêm note) */}
      {lead.recentNotes !== undefined && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5"
        >
          <LeadNotesCell
            notes={lead.recentNotes}
            emptyPlaceholder="+ Thêm ghi chú"
            onView={() => setViewNotesOpen(true)}
            onAdd={() => setAddNoteOpen(true)}
          />
        </div>
      )}

      {/* Row 6: label pill + time */}
      <div className="mt-2 flex items-center gap-2">
        {lead.label && <LabelPill label={lead.label} size="sm" />}
        {!isDistributed && (
          <span className="ml-auto text-[11px] text-slate-400">
            {relativeTime(lead.createdAt)} trước
          </span>
        )}
      </div>

      {/* Row 7: hàng nút hành động - vùng bấm to, border-top ngăn cách với body
          card để không tap nhầm vào vùng mở detail sheet. Ẩn khi selection mode. */}
      {!selectionMode && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="mt-2.5 flex gap-1.5 border-t border-dashed border-slate-200 pt-2.5"
        >
          <button
            type="button"
            onClick={() => makeCall(lead.phone, lead.name)}
            disabled={!isReady || !lead.phone}
            className="flex h-10 flex-1 items-center justify-center gap-1 rounded-lg border border-sky-200 bg-sky-50 text-xs font-bold text-sky-600 transition-colors active:bg-sky-100 disabled:opacity-40"
          >
            <Phone className="h-3.5 w-3.5" />
            Gọi
          </button>
          <button
            type="button"
            onClick={() => setAddNoteOpen(true)}
            className="flex h-10 flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 transition-colors active:bg-slate-50"
          >
            <StickyNote className="h-3.5 w-3.5" />
            Ghi chú
          </button>
          {/* Nhận/Phân chỉ cho lead còn trong kho - button 40px override size mặc định */}
          {isPoolLead && (
            <div className="flex flex-1 [&>div]:w-full [&>div]:gap-1.5 [&_button]:!h-10 [&_button]:flex-1 [&_button]:!text-xs">
              <LeadPoolActionButtons
                leadId={lead.id}
                leadName={lead.name}
                mode="both"
                users={users}
              />
            </div>
          )}
        </div>
      )}

      {/* Dialogs cho notes - host inline trong card vì LeadNotesCell không tự host.
          Wrapper stopPropagation BẮT BUỘC: dialog portal ra body nhưng React synthetic
          event vẫn bubble theo REACT TREE về card -> mọi tap TRONG dialog (gõ chữ,
          nút X) trigger longPressBind.onTap -> mở detail sheet chồng lên dialog,
          lặp vô hạn (bug 2026-07-07). */}
      <div onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
        <NoteDialog
          open={addNoteOpen}
          onOpenChange={setAddNoteOpen}
          entityType="lead"
          entityId={lead.id}
        />
        <LeadNotesViewDialog
          open={viewNotesOpen}
          onOpenChange={setViewNotesOpen}
          leadId={lead.id}
          leadName={lead.name}
        />
      </div>
    </div>
  );
}
