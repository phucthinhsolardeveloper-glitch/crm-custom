'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

/**
 * Loại khung thời gian filter cho lead.
 * - createdAt: ngày tạo lead (default)
 * - assignedAt: ngày phân lead gần nhất (lastAssignedAt)
 *
 * Mutual exclusive: chỉ 1 trong 2 active tại 1 thời điểm. Toggle = clear param còn lại.
 */
export type LeadTimeFilterMode = 'createdAt' | 'assignedAt';

/**
 * Pending date filter state shared giữa filter bar và label chips.
 *
 * Tại sao cần context: label chip click apply LUÔN (router.push) với date pending hiện tại.
 * Nếu chỉ giữ state trong filter bar -> chip không biết user đã thay đổi date.
 *
 * Filter bar set pending khi user đổi date / preset / toggle. Chip đọc rồi apply cùng label.
 * Sau khi apply (bằng nút "Lọc" hoặc click chip), pending state được clear (sync về URL).
 */
export interface PendingDateFilter {
  mode: LeadTimeFilterMode;
  from: string; // local UTC+7 datetime string (yyyy-MM-ddTHH:mm) hoặc '' nếu chưa set
  to: string;
}

interface PendingContextValue {
  pending: PendingDateFilter | null;
  setPending: (p: PendingDateFilter | null) => void;
  clearPending: () => void;
  /**
   * Counter bump mỗi khi 1 bulk-action (assign/template/recall/delete) đổi data lead.
   * Label chips include số này trong deps -> refetch `/leads/label-counts` NGAY,
   * thay vì chờ user đổi URL filter. Bảng và chips là 2 component tách rời nên cần
   * tín hiệu chung qua context này (provider đã bọc cả 2).
   */
  labelCountsVersion: number;
  /** Rung "chuông" để label chips refetch counts ngay lập tức. */
  refreshLabelCounts: () => void;
}

const PendingContext = createContext<PendingContextValue | null>(null);

export function LeadFilterPendingProvider({ children }: { children: ReactNode }) {
  const [pending, setPendingState] = useState<PendingDateFilter | null>(null);
  const [labelCountsVersion, setLabelCountsVersion] = useState(0);

  const setPending = useCallback((p: PendingDateFilter | null) => {
    setPendingState(p);
  }, []);

  const clearPending = useCallback(() => {
    setPendingState(null);
  }, []);

  const refreshLabelCounts = useCallback(() => {
    setLabelCountsVersion((v) => v + 1);
  }, []);

  return (
    <PendingContext.Provider
      value={{ pending, setPending, clearPending, labelCountsVersion, refreshLabelCounts }}
    >
      {children}
    </PendingContext.Provider>
  );
}

/**
 * Consume pending state. Trả về `null` pending nếu không trong provider
 * (graceful degradation - vd component lẻ được render ngoài context).
 */
export function useLeadFilterPending(): PendingContextValue {
  const ctx = useContext(PendingContext);
  if (!ctx) {
    // No-op fallback để không crash khi component dùng ngoài provider
    return {
      pending: null,
      setPending: () => {},
      clearPending: () => {},
      labelCountsVersion: 0,
      refreshLabelCounts: () => {},
    };
  }
  return ctx;
}
