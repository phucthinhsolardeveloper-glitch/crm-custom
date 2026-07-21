'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Context cấp điều kiện scope kho (fix cứng trong code, KHÔNG nằm trên URL)
 * cho các client component tự build query từ useSearchParams():
 * - useLeadsPolling (poll 30s)
 * - LeadLabelQuickFilters (đếm nhãn)
 * - LeadExportButton (xuất CSV)
 *
 * Trang /leads unified không bọc provider -> default {} -> hành vi cũ nguyên vẹn.
 */
const KhoBaseParamsCtx = createContext<Record<string, string | string[]>>({});

/** Điều kiện kho hiện tại ({} nếu không đứng trong trang kho). */
export function useKhoBaseParams(): Record<string, string | string[]> {
  return useContext(KhoBaseParamsCtx);
}

export function KhoBaseParamsProvider({
  baseParams,
  children,
}: {
  baseParams: Record<string, string | string[]>;
  children: ReactNode;
}) {
  return <KhoBaseParamsCtx.Provider value={baseParams}>{children}</KhoBaseParamsCtx.Provider>;
}
