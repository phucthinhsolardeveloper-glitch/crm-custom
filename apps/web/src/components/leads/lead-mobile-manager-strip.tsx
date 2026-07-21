'use client';

import { Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LeadMobileManagerStripProps {
  /** Selection mode đang bật (nút Chia số armed hoặc đã chọn >= 1 card). */
  selectionMode: boolean;
  onToggleSelectionMode: () => void;
}

/**
 * Nút "Chia số" cho mobile leads (manager+), nằm ngay dưới tab kho.
 *
 * Bấm vào -> bật selection mode để tick chọn lead, sau đó thao tác chia
 * (Phân / Mẫu / Thu hồi / Xóa) nằm ở bulk bar đáy màn hình. Bấm lại ("Xong")
 * -> thoát mode + bỏ chọn. Long-press card vẫn vào mode như cũ.
 *
 * 2026-07-07: bỏ nút "AI Chia số" (LeadPoolDistributeDialog) theo yêu cầu user -
 * mobile chỉ giữ luồng chia thủ công qua selection.
 */
export function LeadMobileManagerStrip({
  selectionMode, onToggleSelectionMode,
}: LeadMobileManagerStripProps) {
  return (
    <div className="flex flex-shrink-0 items-center px-0.5 pb-1.5">
      <button
        type="button"
        onClick={onToggleSelectionMode}
        className={cn(
          'flex h-9 w-full items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition-colors',
          selectionMode
            ? 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-md'
            : 'border border-sky-300 bg-sky-50 text-sky-600',
        )}
      >
        {selectionMode ? <X className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
        {selectionMode ? 'Xong' : 'Chia số'}
      </button>
    </div>
  );
}
