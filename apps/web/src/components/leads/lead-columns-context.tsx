'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColumnPrefs } from '@/hooks/use-column-prefs';
import { useTypographyPrefs, type LeadTypographyPrefs } from '@/hooks/use-typography-prefs';
import { useColumnStyles } from '@/hooks/use-column-styles';
import { useRowStylePrefs } from '@/hooks/use-row-style-prefs';

/**
 * Context để share column visibility/order/width + typography prefs + per-column style overrides
 * giữa LeadTableExcel và toolbar (Setting button) - cùng đọc/ghi localStorage qua 3 hook tách rời:
 * - useColumnPrefs:     visibility/order/width (key `crm_lead_columns_v3`)
 * - useTypographyPrefs: font size/weight/color/family GLOBAL default (key `crm_lead_typography_v1`)
 * - useColumnStyles:    PER-COLUMN override (font/bg/text color) (key `crm_lead_column_styles_v1`)
 *
 * Why context (không phải lift state hay 3 hook instances):
 * - Hook có React state riêng → 2 instances cùng key sẽ out-of-sync,
 *   chỉ instance đang toggle cập nhật, instance còn lại không re-render.
 * - Context cho phép cả Setting button (ngoài table) và table render dùng chung
 *   1 state tree mà không phải drilling props sâu.
 *
 * Layered overrides: cell render lấy global typography làm default, sau đó merge với
 * column-specific override. Cell có override → apply; không có → fallback global.
 */

type ColumnsState = ReturnType<typeof useColumnPrefs>;
type TypographyState = ReturnType<typeof useTypographyPrefs>;
type ColumnStylesState = ReturnType<typeof useColumnStyles>;
type RowStylesState = ReturnType<typeof useRowStylePrefs>;

/** Bố cục cột do admin cấu hình theo phòng ban - khóa visibility + order. */
export interface LockedColumnLayout {
  visible: Record<string, boolean>;
  order: string[];
}

export type LeadColumnsState = ColumnsState & TypographyState & ColumnStylesState & RowStylesState & {
  /** Helper alias để code call site dễ đọc: `typography` thay vì spread. */
  typography: LeadTypographyPrefs;
  /** true = bố cục cột (ẩn/hiện + thứ tự) bị khóa theo config phòng ban. Width/typography vẫn tự do. */
  layoutLocked: boolean;
};

const LeadColumnsContext = createContext<LeadColumnsState | null>(null);

interface LeadColumnsProviderProps {
  children: ReactNode;
  storageKey: string;
  /** Storage key riêng cho typography. Default key của leads để giữ backward-compat. */
  typographyKey?: string;
  /** Storage key riêng cho per-column styles. Default key của leads. */
  columnStylesKey?: string;
  /** Storage key riêng cho row colors. Default key của leads. */
  rowStylesKey?: string;
  /** Default visibility state cho columns - dùng để ẩn cột mặc định (vd per-installment columns). */
  columnDefaults?: Record<string, { visible?: boolean; width?: number }>;
  /**
   * Bố cục cột cố định theo phòng ban (admin cấu hình). Khi truyền:
   * - isVisible/order đọc từ config này thay vì localStorage (visibility + order khóa)
   * - toggleVisible/setVisible/setOrder thành no-op (gear menu ẩn section tương ứng)
   * - width + typography + column/row styles VẪN là pref cá nhân (hybrid lock)
   * localStorage không bị ghi đè trong lúc khóa - xóa config là pref cũ hiện lại.
   */
  lockedLayout?: LockedColumnLayout | null;
}

export function LeadColumnsProvider({
  children, storageKey, typographyKey, columnStylesKey, rowStylesKey, columnDefaults, lockedLayout,
}: LeadColumnsProviderProps) {
  const columns = useColumnPrefs({ storageKey, defaults: columnDefaults });
  const typo = useTypographyPrefs(typographyKey);
  const colStyles = useColumnStyles(columnStylesKey);
  const rowStyles = useRowStylePrefs(rowStylesKey);
  const value = useMemo<LeadColumnsState>(() => {
    const layoutLocked = !!lockedLayout;
    const noop = () => {};
    return {
      ...columns,
      ...(layoutLocked && lockedLayout
        ? {
            // Key không có trong config = hiện (fallback true) - cột mới thêm sau
            // khi admin lưu config vẫn hiển thị thay vì biến mất im lặng.
            isVisible: (key: string) => lockedLayout.visible[key] ?? true,
            order: lockedLayout.order,
            toggleVisible: noop,
            setVisible: noop,
            setOrder: noop,
          }
        : {}),
      ...typo,
      ...colStyles,
      ...rowStyles,
      layoutLocked,
    };
  }, [columns, typo, colStyles, rowStyles, lockedLayout]);
  return <LeadColumnsContext.Provider value={value}>{children}</LeadColumnsContext.Provider>;
}

/** Throw nếu dùng ngoài provider - bắt bug sớm thay vì silent fail. */
export function useLeadColumns(): LeadColumnsState {
  const ctx = useContext(LeadColumnsContext);
  if (!ctx) throw new Error('useLeadColumns must be used inside <LeadColumnsProvider>');
  return ctx;
}
