'use client';

import { useState } from 'react';
import { Inbox } from 'lucide-react';
import { LeadMobileCard } from '@/components/leads/lead-mobile-card';
import { LeadMobileQuickDetailSheet } from '@/components/leads/lead-mobile-quick-detail-sheet';
import type { ExcelLead } from '@/components/leads/lead-table-excel';

type UserRole = 'USER' | 'MANAGER' | 'SUPER_ADMIN';

interface LeadMobileListProps {
  leads: ExcelLead[];
  userRole: UserRole;
  /** Selection state từ parent (useBulkSelection). */
  selectedIds: Set<string>;
  onToggleOne: (id: string) => void;
  count: number;
  /** Selection mode tường minh từ nút "Chọn" (manager strip) - OR với count > 0. */
  selectionArmed: boolean;
  onEnterSelectionMode: () => void;
  /** Danh sách nhân viên cho dialog "Phân" trên card (manager+, rỗng với USER). */
  users?: { id: string; name: string }[];
}

/**
 * Mobile list render flat danh sách `LeadMobileCard`. Thay thế `LeadTableExcel`
 * khi viewport < 768px (xem `useIsMobile` + branching ở `LeadsTable`).
 *
 * Selection-mode = `selectionArmed || count > 0`:
 * - Nút "Chọn" ở manager strip bật mode tường minh (selectionArmed).
 * - Long-press card cũng vào mode (behavior cũ giữ nguyên).
 * - Tap card khi mode OFF → mở LeadMobileQuickDetailSheet (chi tiết nhanh, KHÔNG
 *   phải form sửa - tránh mở nhầm edit drawer).
 * - Tap card khi mode ON → toggle chọn.
 *
 * Empty state: card xám "Chưa có lead" + icon (KISS, không skeleton riêng vì
 * RSC + polling đã handle loading state ở page-level).
 */
export function LeadMobileList({
  leads, userRole, selectedIds, onToggleOne, count, selectionArmed, onEnterSelectionMode, users = [],
}: LeadMobileListProps) {
  const [detailLead, setDetailLead] = useState<ExcelLead | null>(null);
  const selectionMode = selectionArmed || count > 0;

  if (leads.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center">
        <Inbox className="h-10 w-10 text-slate-300 mb-3" />
        <p className="text-sm font-medium text-slate-500">Chưa có lead nào</p>
        <p className="text-xs text-slate-400 mt-1">Thử đổi bộ lọc hoặc tạo lead mới</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2.5 pb-4">
        {leads.map((lead) => (
          <LeadMobileCard
            key={lead.id}
            lead={lead}
            selectionMode={selectionMode}
            selected={selectedIds.has(lead.id)}
            onToggleSelect={() => onToggleOne(lead.id)}
            onEnterSelectionMode={() => {
              onEnterSelectionMode();
              onToggleOne(lead.id);
            }}
            onOpenDetail={() => setDetailLead(lead)}
            userRole={userRole}
            users={users}
          />
        ))}
      </div>

      {/* Quick detail sheet host 1 lần - mở/đóng theo detailLead state. Sheet tự
          host edit drawer + task/order/notes dialogs bên trong. */}
      <LeadMobileQuickDetailSheet lead={detailLead} onClose={() => setDetailLead(null)} />
    </>
  );
}
