'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Phone, StickyNote, Pencil, ShoppingCart, CalendarPlus, ArrowRightLeft, Mic, Clock, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { LeadEditDrawer } from '@/components/leads/lead-edit-drawer';
import { LeadQuickTaskDialog } from '@/components/leads/lead-quick-task-dialog';
import { LeadTransferSubmenu } from '@/components/leads/lead-transfer-submenu';
import { LeadCreateOrderFlow } from '@/components/leads/lead-create-order-flow';
import { LeadNotesViewDialog } from '@/components/leads/lead-notes-view-dialog';
import { CallHistoryDialog } from '@/components/shared/call-history-dialog';
import { LeadActivityTimelineDialog } from '@/components/shared/lead-activity-timeline-dialog';
import NoteDialog from '@/components/shared/note-dialog';
import { LabelPill } from '@/components/leads/label-pill';
import { useOmiCall } from '@/providers/omicall-provider';
import { api } from '@/lib/api-client';
import { formatPhoneDisplay } from '@crm/utils';
import type { ExcelLead } from '@/components/leads/lead-table-excel';
import type { LeadRecord } from '@/types/entities';

interface LeadMobileQuickDetailSheetProps {
  lead: ExcelLead | null;
  onClose: () => void;
}

/**
 * Bottom sheet "Chi tiết nhanh" mở khi tap card lead trên mobile.
 *
 * Thay thế hành vi cũ tap-card-mở-thẳng-LeadEditDrawer (user hay mở nhầm form
 * sửa khi chỉ muốn xem). Sheet gom đủ action của desktop row (LeadActionMenu +
 * PhoneCell icons) thành grid nút to >= 44px + info tóm tắt read-only.
 *
 * Các dialog con (edit drawer, task, order flow, notes, call history, timeline)
 * host tại đây - sheet đóng trước khi dialog con mở để tránh chồng 2 lớp overlay.
 */
export function LeadMobileQuickDetailSheet({ lead, onClose }: LeadMobileQuickDetailSheetProps) {
  const router = useRouter();
  const { makeCall, isReady } = useOmiCall();

  // View trong sheet: action grid chính hoặc submenu chuyển lead.
  const [view, setView] = useState<'main' | 'transfer'>('main');
  const [editOpen, setEditOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [notesViewOpen, setNotesViewOpen] = useState(false);
  const [callsOpen, setCallsOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);
  const [orderCustomerId, setOrderCustomerId] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);

  // Giữ lead cuối để dialog con còn data sau khi sheet đóng (lead=null).
  const [lastLead, setLastLead] = useState<ExcelLead | null>(null);
  if (lead && lead !== lastLead) {
    setLastLead(lead);
    setView('main');
  }
  const l = lead ?? lastLead;
  if (!l) return null;

  function closeSheet() {
    setView('main');
    onClose();
  }

  /** Convert lead -> customer (nếu chưa) rồi mở flow tạo đơn. Mirror logic LeadActionMenu. */
  async function handleCreateOrder() {
    if (!l) return;
    closeSheet();
    if (l.customerId) {
      setOrderCustomerId(l.customerId);
      setFlowOpen(true);
      return;
    }
    setConverting(true);
    try {
      const res = await api.post<{ data: { customerId?: string | null } }>(`/leads/${l.id}/convert`);
      const cid = res.data?.customerId;
      if (!cid) throw new Error('Không lấy được customerId sau convert');
      setOrderCustomerId(cid);
      setFlowOpen(true);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi chuyển đổi lead');
    } finally {
      setConverting(false);
    }
  }

  const actions = [
    {
      key: 'call', label: 'Gọi', icon: <Phone className="h-5 w-5" />, hl: true, disabled: !isReady || !l.phone,
      onClick: () => { closeSheet(); makeCall(l.phone, l.name); },
    },
    {
      key: 'note', label: 'Ghi chú', icon: <StickyNote className="h-5 w-5" />,
      onClick: () => { closeSheet(); setNoteOpen(true); },
    },
    {
      key: 'edit', label: 'Sửa', icon: <Pencil className="h-5 w-5" />,
      onClick: () => { closeSheet(); setEditOpen(true); },
    },
    {
      key: 'order', label: 'Tạo đơn', icon: converting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShoppingCart className="h-5 w-5" />,
      disabled: converting, onClick: handleCreateOrder,
    },
    {
      key: 'task', label: 'Đặt lịch', icon: <CalendarPlus className="h-5 w-5" />,
      onClick: () => { closeSheet(); setTaskOpen(true); },
    },
    {
      key: 'transfer', label: 'Chuyển', icon: <ArrowRightLeft className="h-5 w-5" />,
      onClick: () => setView('transfer'),
    },
    {
      key: 'calls', label: 'LS gọi', icon: <Mic className="h-5 w-5" />, disabled: !l.phone,
      onClick: () => { closeSheet(); setCallsOpen(true); },
    },
    {
      key: 'timeline', label: 'Tương tác', icon: <Clock className="h-5 w-5" />,
      onClick: () => { closeSheet(); setTimelineOpen(true); },
    },
  ];

  return (
    <>
      <Sheet open={!!lead} onOpenChange={(o) => !o && closeSheet()}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <SheetHeader className="mb-3 pr-8">
            <SheetTitle className="flex items-center gap-2 text-base">
              <span className="truncate">{l.name}</span>
              {l.label && <LabelPill label={l.label} size="sm" />}
            </SheetTitle>
          </SheetHeader>

          {view === 'main' ? (
            <>
              {/* Grid 4 cột action - min-height 60px vượt chuẩn touch 44px */}
              <div className="grid grid-cols-4 gap-2">
                {actions.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    onClick={a.onClick}
                    disabled={a.disabled}
                    className={
                      'flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl border text-[11px] font-bold transition-colors disabled:opacity-40 ' +
                      (a.hl
                        ? 'border-sky-200 bg-sky-50 text-sky-600'
                        : 'border-slate-200 bg-white text-slate-600 active:bg-sky-50')
                    }
                  >
                    {a.icon}
                    {a.label}
                  </button>
                ))}
              </div>

              {/* Info tóm tắt read-only */}
              <div className="mt-4 divide-y divide-slate-100 text-sm">
                <InfoRow k="SĐT" v={l.phone ? formatPhoneDisplay(l.phone) : '-'} />
                <InfoRow k="Sản phẩm" v={l.product?.name || '-'} />
                <InfoRow k="Nguồn" v={[l.source?.name, l.group?.name].filter(Boolean).join(' / ') || '-'} />
                <InfoRow k="Người phụ trách" v={l.assignedUser?.name || 'Chưa phân (trong kho)'} />
                <InfoRow k="Phòng ban" v={l.department?.name || '-'} />
              </div>

              {(l.recentNotes?.length ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() => { closeSheet(); setNotesViewOpen(true); }}
                  className="mt-3 w-full rounded-lg border-l-4 border-sky-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-500"
                >
                  💬 {l.recentNotes?.[0]?.content}
                  <span className="ml-1 font-semibold text-sky-600">Xem tất cả</span>
                </button>
              )}
            </>
          ) : (
            <LeadTransferSubmenu
              leadId={l.id}
              leadName={l.name}
              currentDeptId={l.department?.id ?? null}
              currentStatus={l.status}
              onBack={() => setView('main')}
              onSuccess={closeSheet}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Dialog con - host ngoài Sheet để mở được sau khi sheet đóng */}
      <LeadEditDrawer open={editOpen} onOpenChange={setEditOpen} leadId={l.id} leadRow={l as unknown as Partial<LeadRecord>} />
      <LeadQuickTaskDialog open={taskOpen} onOpenChange={setTaskOpen} leadId={l.id} leadName={l.name} />
      <NoteDialog open={noteOpen} onOpenChange={setNoteOpen} entityType="lead" entityId={l.id} />
      <LeadNotesViewDialog open={notesViewOpen} onOpenChange={setNotesViewOpen} leadId={l.id} leadName={l.name} />
      {l.phone && <CallHistoryDialog open={callsOpen} onOpenChange={setCallsOpen} phone={l.phone} />}
      <LeadActivityTimelineDialog open={timelineOpen} onOpenChange={setTimelineOpen} leadId={l.id} />
      {orderCustomerId && (
        <LeadCreateOrderFlow
          customerId={orderCustomerId}
          leadId={l.id}
          leadName={l.name}
          open={flowOpen}
          onOpenChange={setFlowOpen}
          onSuccess={() => { setFlowOpen(false); router.refresh(); }}
          defaultProductId={l.product?.id}
          defaultCustomerName={l.name}
          defaultCustomerPhone={l.phone ?? undefined}
        />
      )}
    </>
  );
}

function InfoRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="flex-shrink-0 text-slate-500">{k}</span>
      <span className="text-right font-semibold text-slate-800">{v}</span>
    </div>
  );
}
