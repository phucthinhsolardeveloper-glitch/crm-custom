'use client';

import { useState } from 'react';
import { Users2 } from 'lucide-react';
import { LeadDuplicateDialog } from '@/components/leads/lead-duplicate-dialog';

interface Props {
  /** Số lần SĐT này xuất hiện trong DB. Chỉ render badge khi >= 2. */
  count: number;
  phone: string;
  /** ID lead hiện tại - highlight dòng này trong bảng để dễ so sánh. */
  currentLeadId: string;
}

/**
 * Hiển thị icon "2 người" cạnh lead khi SĐT của lead trùng với ≥ 1 lead khác.
 * Click icon → dialog hiển thị các lead trùng + lịch sử phân phối.
 */
export function LeadDuplicateBadge({ count, phone, currentLeadId }: Props) {
  const [open, setOpen] = useState(false);

  if (count < 2) return null;

  function handleOpen(e: React.MouseEvent) {
    // Chặn bubble lên row để click badge không trigger row-toggle ở bảng leads
    e.stopPropagation();
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        title={`Trùng SĐT - đã xuất hiện ${count} lần`}
        className="inline-flex items-center justify-center rounded-full bg-amber-100 p-0.5 text-amber-700 hover:bg-amber-200 transition-colors"
      >
        <Users2 className="h-3.5 w-3.5" />
        <span className="ml-0.5 text-[10px] font-bold leading-none pr-1">{count}</span>
      </button>

      <LeadDuplicateDialog open={open} onOpenChange={setOpen} phone={phone} currentLeadId={currentLeadId} />
    </>
  );
}
