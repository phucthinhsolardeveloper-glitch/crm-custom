'use client';

import { X, Users, Shuffle, Undo2 } from 'lucide-react';

interface LeadMobileBulkBarProps {
  count: number;
  /**
   * Số lead trong selection có thể assign/reassign (mọi status TRỪ CONVERTED/LOST).
   * 2026-05-23: gồm cả lead đã có chủ - backend tự auto-recall trong transaction.
   */
  poolCount: number;
  /** Số lead trong selection đã có assignedUser (recallable). */
  distributedCount: number;
  /** Có template phân phối khả dụng không (manager+). */
  hasTemplates: boolean;
  /** Đang recall (disable nút). */
  recalling: boolean;

  onClear: () => void;
  onAssignClick: () => void;
  onTemplateClick: () => void;
  onRecallClick: () => void;
  /** Slot để parent compose ConfirmDialog cho xóa (manager+). */
  deleteSlot?: React.ReactNode;
}

/**
 * Bulk action bar mobile - fixed BOTTOM(trước đây sticky
 * top). Đặt dưới đáy để bấm được bằng ngón cái 1 tay; safe-area-inset-bottom
 * cho iPhone tai thỏ. Hiện khi selection mode có >= 1 lead được chọn.
 *
 * Layout 2 hàng:
 *   [Đã chọn N ................ ✕ Bỏ chọn]
 *   [Phân] [Mẫu] [Thu hồi] [deleteSlot]
 * Nút cao 44px (chuẩn touch target WCAG). Chỉ render nút khi điều kiện thỏa
 * (poolCount > 0 cho Phân/Mẫu, distributedCount > 0 cho Thu hồi).
 */
export function LeadMobileBulkBar({
  count, poolCount, distributedCount, hasTemplates, recalling,
  onClear, onAssignClick, onTemplateClick, onRecallClick, deleteSlot,
}: LeadMobileBulkBarProps) {
  if (count === 0) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex flex-col gap-2 rounded-t-2xl bg-gradient-to-r from-sky-500 to-cyan-500 px-3 pt-2.5 text-white shadow-[0_-8px_30px_-6px_rgba(14,165,233,0.5)] animate-in slide-in-from-bottom-4 duration-200 pb-[calc(0.625rem+env(safe-area-inset-bottom))]"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">
          Đã chọn <span className="text-base font-extrabold">{count}</span> lead
        </span>
        <button
          type="button"
          onClick={onClear}
          className="flex h-8 items-center gap-1 rounded-lg bg-white/20 px-3 text-xs font-bold transition-colors hover:bg-white/30"
        >
          <X className="h-3.5 w-3.5" />
          Bỏ chọn
        </button>
      </div>

      <div className="flex gap-1.5">
        {poolCount > 0 && (
          <button
            type="button"
            onClick={onAssignClick}
            className="flex h-11 flex-1 flex-col items-center justify-center rounded-xl bg-white/15 text-[11px] font-bold transition-colors active:bg-white/30"
            title={`Phân ${poolCount} lead cho 1 nhân viên`}
          >
            <Users className="h-4 w-4" />
            Phân
          </button>
        )}

        {poolCount > 0 && hasTemplates && (
          <button
            type="button"
            onClick={onTemplateClick}
            className="flex h-11 flex-1 flex-col items-center justify-center rounded-xl bg-white/15 text-[11px] font-bold transition-colors active:bg-white/30"
            title="Phân theo template round-robin"
          >
            <Shuffle className="h-4 w-4" />
            Mẫu
          </button>
        )}

        {distributedCount > 0 && (
          <button
            type="button"
            onClick={onRecallClick}
            disabled={recalling}
            className="flex h-11 flex-1 flex-col items-center justify-center rounded-xl bg-amber-500 text-[11px] font-bold transition-colors active:bg-amber-600 disabled:opacity-60"
            title={`Thu hồi ${distributedCount} lead về Kho Mới`}
          >
            <Undo2 className="h-4 w-4" />
            {recalling ? '...' : 'Thu hồi'}
          </button>
        )}

        {deleteSlot}
      </div>
    </div>
  );
}
