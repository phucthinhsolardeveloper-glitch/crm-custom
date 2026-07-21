'use client';

import { LeadLabelQuickFilters } from '@/components/leads/lead-label-quick-filters';
import { LeadTableExcelColumnToggle, type ToggleableColumn } from '@/components/leads/lead-table-excel-column-toggle';
import { CreateLeadDialog } from '@/components/leads/create-lead-dialog';
import { LeadExportButton } from '@/components/leads/lead-export-button';
import { useLeadColumns } from '@/components/leads/lead-columns-context';
import { useIsMobile } from '@/hooks/use-is-mobile';

interface LeadsToolbarRowProps {
  /** Toggleable columns build sẵn ở wrapper (cùng args với LeadTableExcel để khớp render). */
  toggleableColumns: ToggleableColumn[];
  /** Hiển thị nút "+ Tạo lead" (chỉ manager+). Default false (USER không thấy). */
  showCreateButton?: boolean;
  /** Hiển thị nút "Xuất CSV" (chỉ manager+). Default false (USER không thấy). */
  showExportButton?: boolean;
  /** Refs cho Create dialog - truyền từ page.tsx (server-fetched). */
  createDialogSources?: { id: string; name: string }[];
  createDialogProducts?: { id: string; name: string }[];
  /** Slot action bổ sung theo ngữ cảnh trang (vd nút AI Chia số trên trang kho). */
  extraActions?: React.ReactNode;
}

/**
 * Toolbar 1 hàng phía trên bảng leads:
 *   [ Label chips (flex-[7]) ............... | [⚙ Setting] [+ Tạo lead] (flex-[3]) ]
 *
 * Thay đổi vs bản cũ:
 * - BỎ nút "Làm mới" - bảng đã tự refresh 30s qua router.refresh() trong LeadsTable.
 * - THÊM nút "+ Tạo lead" cho manager+ (chuyển từ header dòng cũ đã bỏ).
 *
 * Label chips là filter nhanh 1-click (auto-apply), được consume từ
 * `LeadFilterPendingContext` để apply LUÔN pending date cùng (xem wireframe v4 mục 5).
 */
export function LeadsToolbarRow({
  toggleableColumns,
  showCreateButton = false,
  showExportButton = false,
  createDialogSources = [],
  createDialogProducts = [],
  extraActions,
}: LeadsToolbarRowProps) {
  const { isVisible, toggleVisible, resetAll, order, setOrder } = useLeadColumns();
  const isMobile = useIsMobile();

  // Mobile: label chips full-width, ẩn Setting (column toggle vô nghĩa khi card view)
  // + ẩn nút Tạo lead (parent render FAB ở góc phải dưới).
  // py-0.5 = 2px padding top+bottom (label chips có khí thở trong row).
  // mb-0.5 + ml-0.5 = cách sidebar 2px + cách table dưới 2px.
  if (isMobile) {
    return (
      <div className="py-0.5 mb-0.5 ml-0.5">
        <LeadLabelQuickFilters />
      </div>
    );
  }

  // Desktop: py-0.5 (2px padding trong row) + mb-0.5 (2px gap label-table)
  // + ml-0.5 sm:ml-1 (2-4px cách sidebar). Trước đây mb-3 (12px) - user yêu cầu
  // thu nhỏ xuống sát table hơn (2026-05-23).
  return (
    <div className="py-0.5 mb-0.5 ml-0.5 sm:ml-1 flex flex-wrap items-start gap-3">
      <div className="flex-[7] min-w-[200px]">
        <LeadLabelQuickFilters />
      </div>
      <div className="flex-[3] min-w-[200px] flex items-center justify-end gap-2">
        <LeadTableExcelColumnToggle
          columns={toggleableColumns}
          isVisible={isVisible}
          onToggle={toggleVisible}
          onReset={resetAll}
          order={order}
          onReorder={setOrder}
        />
        {extraActions}
        {showExportButton && <LeadExportButton />}
        {showCreateButton && (
          <CreateLeadDialog sources={createDialogSources} products={createDialogProducts} />
        )}
      </div>
    </div>
  );
}
