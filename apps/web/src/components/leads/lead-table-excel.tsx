'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { LeadPoolActionButtons } from '@/components/leads/lead-pool-action-buttons';
import { LeadActionMenu } from '@/components/leads/lead-action-menu';
import { LeadNotesCell } from '@/components/leads/lead-notes-cell';
import { PhoneCell } from '@/components/leads/phone-cell';
import { LeadNameLink } from '@/components/leads/lead-name-link';
import { LabelPill } from '@/components/leads/label-pill';
import { type ToggleableColumn } from '@/components/leads/lead-table-excel-column-toggle';
import { LeadLabelQuickEditDialog } from '@/components/leads/lead-label-quick-edit-dialog';
import { LeadProductQuickEditDialog } from '@/components/leads/lead-product-quick-edit-dialog';
import { LeadSourceQuickEditDialog } from '@/components/leads/lead-source-quick-edit-dialog';
import { LeadCustomFieldQuickEditDialog } from '@/components/leads/lead-custom-field-quick-edit-dialog';
import { LeadGroupQuickEditDialog } from '@/components/leads/lead-group-quick-edit-dialog';
import { LeadNotesViewDialog } from '@/components/leads/lead-notes-view-dialog';
import { LeadCreateOrderFlow } from '@/components/leads/lead-create-order-flow';
import NoteDialog from '@/components/shared/note-dialog';
import { useLeadColumns } from '@/components/leads/lead-columns-context';
import { useInLeadsShell } from '@/components/leads/leads-layout-shell';
import { ArrowUp, ArrowDown, ArrowUpDown, Undo2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from 'sonner';
import { cn, formatVND, formatDateTime } from '@/lib/utils';
// fontFamily đã sync với global font picker (xem use-global-font-pref.ts);
// bảng kế thừa qua var(--font-sans) trên <html>.
import type { RowStylePrefs } from '@/hooks/use-row-style-prefs';

// v3: thêm field `order` cho drag-reorder cột non-sticky.
// useColumnPrefs tự migrate width+visible từ v2 cũ - user không mất setting đã chỉnh.
// Export để wrapper (LeadColumnsProvider) dùng cùng key - đảm bảo Table + toolbar Setting button share state.
export const LEAD_COLUMNS_STORAGE_KEY = 'crm_lead_columns_v3';

interface OrderLite { id: string; totalAmount: number; payments?: { amount: number; status: string }[] }
interface LeadNoteSummary { id: string; content: string; createdAt: string }

export interface ExcelLead {
  id: string; name: string; phone: string; email?: string | null;
  status: string;
  /** Source object - cần `id` để hỗ trợ inline edit Nguồn. */
  source?: { id?: string; name: string } | null;
  /** Group object - Nhóm con của Nguồn. Read-only ở bảng (không inline edit). */
  group?: { id?: string; name: string } | null;
  product?: { id?: string; name: string } | null;
  assignedUser?: { id?: string; name: string } | null;
  department?: { id?: string; name: string } | null;
  customerId?: string | null;
  orders?: OrderLite[];
  label?: { id: string; name: string; color: string; textColor: string } | null;
  activityCount?: number;
  assignedAt?: string | null;
  lastAssignedAt?: string | null;
  /** JSONB tự do: aiLevel/aiScore (hệ thống) + giá trị trường tùy chỉnh theo key định nghĩa. */
  metadata?: { aiLevel?: string; aiScore?: number } & Record<string, unknown>;
  createdAt: string;
  duplicateCount?: number;
  recentNotes?: LeadNoteSummary[];
}

interface ColDef {
  key: string;
  label: string;
  width: number;
  sortable?: boolean;       // server-side sort qua URL
  hideable?: boolean;       // được phép ẩn/hiện
  align?: 'left' | 'right' | 'center';
  stickyLeft?: boolean;     // freeze trái
  stickyRight?: boolean;    // freeze phải
  /**
   * Locked = cột business-critical (gắn với assign logic + activity counter)
   * KHÔNG cho ẩn, KHÔNG cho reorder, KHÔNG hiện trong setting UI bất kể role.
   * Áp cho "Phân cho" (assignedTo) + "Tương tác" (activity).
   */
  locked?: boolean;
}

const SORTABLE_FIELDS = new Set(['name', 'createdAt', 'updatedAt', 'lastAssignedAt', 'status']);

/** Cumulative left offset cho sticky cột (px). Tính runtime theo prefs (width thực tế). */
function computeStickyOffsets(cols: ColDef[], getWidth: (k: string, fb: number) => number) {
  const offsets: Record<string, number> = {};
  let acc = 0;
  for (const c of cols) {
    if (c.stickyLeft) { offsets[c.key] = acc; acc += getWidth(c.key, c.width); }
  }
  return offsets;
}

/**
 * Build column defs + toggleable subset cho LeadTableExcel.
 * Export để wrapper (LeadPoolTableWithBulkAssign / LeadListWithViewToggle)
 * compute cùng list để feed vào Setting button toolbar mà không lệch khỏi table render.
 *
 * Static function (không phải hook) - callers tự wrap trong useMemo nếu deps stable.
 */
/** Prefix key cột trường tùy chỉnh - tránh đụng key cột built-in. */
export const CUSTOM_FIELD_COLUMN_PREFIX = 'cf_';

export interface BuildLeadColumnsOpts {
  /** Khi true → include cột "Phân cho" + "Tương tác" (manager view). */
  showAssignActionCols?: boolean;
  /** Pool mode - quyết định có cột "Thao tác" sticky-right tách riêng hay không. */
  poolMode?: 'new' | 'floating' | 'department' | 'zoom' | 'all';
  /** Trường tùy chỉnh active (SUPER_ADMIN định nghĩa) - render thành cột hideable sau "Tạo lúc". */
  customFieldDefs?: { key: string; label: string }[];
}

export function buildLeadColumns(opts: BuildLeadColumnsOpts): {
  columns: ColDef[];
  toggleableColumns: ToggleableColumn[];
} {
  const { showAssignActionCols = false, poolMode, customFieldDefs = [] } = opts;
  const hasSeparateActionsCol = !!poolMode && poolMode !== 'all';

  const columns: ColDef[] = [
    // STT = số thứ tự dòng (idx + 1) theo trang hiện tại. locked: không cho ẩn/reorder,
    // không hiện trong Setting popover. stickyLeft: luôn dính trái khi scroll ngang.
    { key: 'stt', label: 'STT', width: 56, align: 'center', stickyLeft: true, locked: true },
    { key: 'name', label: 'Tên khách hàng', width: 200, stickyLeft: true },
    // PhoneCell có min-w-[180px] + 3 icon + LeadDuplicateBadge ~40px -> cần ít nhất 240px.
    { key: 'phone', label: 'SĐT', width: 240, stickyLeft: true },
    { key: 'product', label: 'Sản phẩm', width: 160, hideable: true },
    { key: 'label', label: 'Nhãn', width: 120, hideable: true },
    { key: 'totalAmount', label: 'Thành tiền', width: 130, hideable: true, align: 'right' },
    { key: 'depositPaid', label: 'Tiền đặt cọc', width: 130, hideable: true, align: 'right' },
    { key: 'source', label: 'Nguồn', width: 140, hideable: true },
    { key: 'group', label: 'Nhóm', width: 140, hideable: true },
    { key: 'note', label: 'Note', width: 240, hideable: true },
    { key: 'createdAt', label: 'Tạo lúc', width: 150, sortable: true, hideable: true },
    // Cột trường tùy chỉnh - key prefix cf_ để không đụng key built-in.
    ...customFieldDefs.map((d): ColDef => ({
      key: CUSTOM_FIELD_COLUMN_PREFIX + d.key, label: d.label, width: 140, hideable: true,
    })),
    ...(showAssignActionCols ? [
      // 2026-05-22: bỏ locked, thêm hideable để 2 cột này hiện trong Setting popover -
      // user có thể kéo đổi thứ tự + tuỳ chọn ẩn/hiện theo nhu cầu.
      { key: 'assignedTo', label: 'Phân cho', width: 200, hideable: true } as ColDef,
      { key: 'activity', label: 'Tương tác', width: 90, align: 'center' as const, hideable: true } as ColDef,
    ] : []),
    {
      key: 'edit',
      label: hasSeparateActionsCol ? '' : 'Thao tác',
      width: hasSeparateActionsCol ? 60 : 90,
      align: 'center',
      stickyRight: !hasSeparateActionsCol,
    },
    ...(hasSeparateActionsCol ? [
      { key: 'actions', label: 'Thao tác', width: 200, align: 'right' as const, stickyRight: true } as ColDef,
    ] : []),
  ];

  const toggleableColumns: ToggleableColumn[] = columns
    // Chỉ loại cột có `locked: true`. Hiện không cột nào set locked - giữ filter
    // làm safety net cho tương lai (nếu cần khoá cứng cột không cho user đụng).
    .filter((c) => !c.locked && (c.hideable || c.stickyLeft || c.stickyRight))
    .map((c) => ({ key: c.key, label: c.label || c.key, sticky: !!(c.stickyLeft || c.stickyRight) }));

  return { columns, toggleableColumns };
}

/**
 * Catalog cột USER-view cho màn hình admin "Bố cục bảng theo phòng ban".
 * = subset hideable (không sticky) của buildLeadColumns với showAssignActionCols=false -
 * đúng tập cột mà USER/LEADER có thể ẩn/hiện + reorder. Dùng chung 1 nguồn để
 * designer và bảng không lệch nhau khi thêm/bớt cột sau này.
 */
export const LEAD_TABLE_CONFIGURABLE_COLUMNS: { key: string; label: string }[] =
  buildLeadColumns({ showAssignActionCols: false, poolMode: 'all' })
    .columns.filter((c) => c.hideable && !c.locked)
    .map((c) => ({ key: c.key, label: c.label }));

interface LeadTableExcelProps {
  leads: ExcelLead[];
  /** Khi true: render checkbox cột đầu + emit `onSelectionChange`. Manager view bật. */
  enableSelection?: boolean;
  selectedIds?: Set<string>;
  onToggleOne?: (id: string) => void;
  onToggleAll?: () => void;
  allSelected?: boolean;
  someSelected?: boolean;
  /** Khi true: render cột "Phân cho" + "Tương tác" cho manager+ view. */
  showAssignActionCols?: boolean;
  /** Khi truyền: bật cột "Thao tác" sticky right cho pool table (assign/recall buttons). */
  poolMode?: 'new' | 'floating' | 'department' | 'zoom' | 'all';
  users?: { id: string; name: string }[];
  /** Labels list - phục vụ inline edit nhãn khi click cell label trên /leads (poolMode='all').
   *  `triggersOrder` = nhãn "chốt đơn": gán xong tự mở popup tạo đơn hàng. */
  labels?: { id: string; name: string; color: string; textColor?: string; triggersOrder?: boolean }[];
  /** Callback thu hồi inline (gọi từ cột "Phân cho"). */
  onRecallOne?: (leadId: string) => void;
  /** Permission gate cho action menu (MANAGER+ thấy "Chuyển phòng ban"). */
  userRole?: 'USER' | 'MANAGER' | 'SUPER_ADMIN';
  /** Trường tùy chỉnh active - render thành cột động (giá trị đọc từ lead.metadata). */
  customFieldDefs?: { key: string; label: string }[];
}

export function LeadTableExcel(props: LeadTableExcelProps) {
  const {
    leads, enableSelection = false, selectedIds, onToggleOne, onToggleAll,
    allSelected = false, someSelected = false,
    showAssignActionCols = false, poolMode, users = [], labels = [], onRecallOne,
    userRole = 'USER', customFieldDefs = [],
  } = props;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sortBy = searchParams.get('sortBy') || '';
  const sortDir = (searchParams.get('sortDir') || '') as 'asc' | 'desc' | '';

  // Click-driven dialogs - state ở table level (1 instance/dialog dùng chung cho mọi row).
  // Tên/SĐT cells không còn trigger popup nữa (per user request) - chỉ pencil "Thao tác"
  // sẽ mở drawer 2 tabs (thao tác nhanh + chỉnh sửa) ở phase tiếp theo.
  //   - Nhãn    → labelEditLead   (LeadLabelQuickEditDialog - inline edit nhãn)
  //   - Sản phẩm → productEditLead (LeadProductQuickEditDialog - inline edit sản phẩm + search)
  //   - Note    → noteLeadId      (NoteDialog - thêm ghi chú)
  const [noteLeadId, setNoteLeadId] = useState<string | null>(null);
  const [noteViewLead, setNoteViewLead] = useState<ExcelLead | null>(null);
  const [labelEditLead, setLabelEditLead] = useState<ExcelLead | null>(null);
  const [productEditLead, setProductEditLead] = useState<ExcelLead | null>(null);
  const [sourceEditLead, setSourceEditLead] = useState<ExcelLead | null>(null);
  const [groupEditLead, setGroupEditLead] = useState<ExcelLead | null>(null);
  // Custom field cần biết cả lead lẫn key trường đang sửa (1 lead có nhiều cf).
  const [cfEdit, setCfEdit] = useState<{ lead: ExcelLead; fieldKey: string } | null>(null);

  // Nhãn "chốt đơn" trigger: sau khi PATCH nhãn thành công,
  // nếu nhãn có cờ triggersOrder → mở LeadCreateOrderFlow với data map sẵn.
  // Tách open state (boolean) khỏi data state (lead) - giống pattern lead-action-menu.
  // Lý do: LeadCreateOrderFlow tự gọi onOpenChange(false) khi chuyển sang CreateOrderDialog con.
  // Nếu onOpenChange unmount component → popup biến mất.
  const [orderFlowLead, setOrderFlowLead] = useState<(ExcelLead & { customerId: string }) | null>(null);
  const [orderFlowOpen, setOrderFlowOpen] = useState(false);

  const handleLabelSaved = useCallback(async (lead: ExcelLead | null, labelId: string | null) => {
    setLabelEditLead(null);
    if (!lead || !labelId) return;
    const matchedLabel = labels.find((l) => l.id === labelId);
    if (!matchedLabel?.triggersOrder) return;
    let customerId = lead.customerId;
    if (!customerId) {
      try {
        const res = await api.post<{ data: { customerId?: string | null } }>(`/leads/${lead.id}/convert`);
        customerId = res.data?.customerId ?? null;
        if (!customerId) { toast.error('Không lấy được customerId sau convert'); return; }
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Lỗi chuyển đổi lead');
        return;
      }
    }
    setOrderFlowLead({ ...lead, customerId });
    setOrderFlowOpen(true);
  }, [labels, router]);

  // Khi pool có cột "actions" sticky-right (new/zoom/dept/floating), cột "edit" giữ vai trò
  // pencil icon nhỏ không label. Khi poolMode='all' (/leads page) không có cột "actions" →
  // "edit" trở thành cột "Thao tác" sticky-right để user dễ tìm thao tác nhanh.
  // Column defs + toggleable list build qua helper export (dùng chung với toolbar Setting button).
  const { columns } = useMemo(
    () => buildLeadColumns({ showAssignActionCols, poolMode, customFieldDefs }),
    [showAssignActionCols, poolMode, customFieldDefs],
  );

  // Column visibility/order/width state + typography prefs đến từ context provider ở wrapper.
  // Why context: Setting button render ở toolbar (ngoài table) cần share state với table render.
  const { isVisible, getWidth, setWidth, hydrated, order, typography, getColumnStyle, rowStyles } = useLeadColumns();

  // Apply order chỉ cho non-sticky columns. Sticky luôn ở vị trí gốc (đầu/cuối) để bảo toàn freeze.
  const orderedColumns = useMemo(() => {
    if (order.length === 0) return columns;
    const stickyLeftCols = columns.filter((c) => c.stickyLeft);
    const stickyRightCols = columns.filter((c) => c.stickyRight);
    const middleCols = columns.filter((c) => !c.stickyLeft && !c.stickyRight);
    const middleMap = new Map(middleCols.map((c) => [c.key, c]));
    const orderedMiddle = order
      .map((k) => middleMap.get(k))
      .filter((c): c is ColDef => !!c);
    // Append columns mới chưa có trong order (forward compat).
    const used = new Set(orderedMiddle.map((c) => c.key));
    const tail = middleCols.filter((c) => !used.has(c.key));
    return [...stickyLeftCols, ...orderedMiddle, ...tail, ...stickyRightCols];
  }, [columns, order]);

  // Filter cột theo visibility - cols được dùng cho render + sticky offset calc.
  const visibleCols = useMemo(() => orderedColumns.filter((c) => !c.hideable || isVisible(c.key)), [orderedColumns, isVisible]);
  const stickyOffsets = useMemo(() => computeStickyOffsets(visibleCols, getWidth), [visibleCols, getWidth]);

  // Resize drag - dùng ref để tránh re-render mỗi pixel (commit width vào state ở mouseup).
  const resizeRef = useRef<{ key: string; startX: number; startW: number } | null>(null);
  const onResizeStart = useCallback((key: string, startW: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { key, startX: e.clientX, startW };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = ev.clientX - resizeRef.current.startX;
      const newW = Math.max(60, resizeRef.current.startW + delta);
      setWidth(resizeRef.current.key, newW);
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [setWidth]);

  const onSortClick = useCallback((key: string) => {
    if (!SORTABLE_FIELDS.has(key)) return;
    const params = new URLSearchParams(searchParams.toString());
    if (sortBy !== key) { params.set('sortBy', key); params.set('sortDir', 'asc'); }
    else if (sortDir === 'asc') { params.set('sortDir', 'desc'); }
    else { params.delete('sortBy'); params.delete('sortDir'); }
    params.delete('cursor');
    router.push(`${pathname}?${params.toString()}`);
  }, [searchParams, sortBy, sortDir, router, pathname]);

  // Avoid SSR/CSR width mismatch - render placeholder defaults pre-hydration
  if (!hydrated && typeof window !== 'undefined') { /* falls through - hook returns defaults */ }

  // Khi nằm trong <LeadsLayoutShell> (/leads page): flex-1 min-h-0 chain
  //   → table fill xuống đáy viewport, scroll nội bộ khi nhiều data.
  //   Filter mở/đóng table tự co/duỗi theo space còn lại.
  // Khi standalone (pool/new, dept...): giữ max-h-[calc(100vh-280px)] cũ.
  const inShell = useInLeadsShell();
  // inShell (/leads): bỏ rounded-xl + gap-px (1px) cho cảm giác Excel sát cạnh sidebar.
  // standalone (pool/new, dept...): giữ rounded-xl + space-y-2 cũ để các page khác không vỡ layout.
  const outerCls = inShell ? 'flex flex-1 min-h-0 flex-col gap-px' : 'space-y-2';
  const scrollWrapperCls = inShell
    ? 'flex-1 min-h-0 overflow-auto border-2 border-slate-300 bg-white'
    : 'overflow-auto rounded-xl border-2 border-slate-300 bg-white max-h-[calc(100vh-280px)]';

  if (leads.length === 0) {
    const emptyCls = inShell
      ? 'flex flex-1 min-h-0 items-center justify-center border border-slate-200 bg-white p-8 text-center text-slate-400'
      : 'rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400';
    return <div className={emptyCls}>Không có data</div>;
  }

  return (
    <div className={outerCls}>
      {/* Column toggle (Setting button) đã move ra wrapper toolbar - ở đó cùng hàng label chips.
          Table chỉ còn render scroll wrapper + dialogs. */}
      <div className={scrollWrapperCls}>
        {/* 2026-05-23: typography font-size/weight/color áp dụng inline tại từng <th>/<td>
            tuỳ theo toggle applyToHeader/applyToData, KHÔNG đặt trên <table> nữa.
            Lý do: cần kiểm soát chính xác từng vùng - nếu để cascade từ table, không thể
            "tắt typography ở data cells trong khi vẫn áp dụng cho header" (cascade luôn).
            2026-06-05: fontFamily đã sync global - bảng kế thừa qua var(--font-sans). */}
        <table
          className="border-separate border-spacing-0"
          style={{
            width: 'max-content',
            minWidth: '100%',
          }}
        >
          <thead className="bg-slate-100 sticky top-0 z-30">
            <tr>
              {enableSelection && (
                <th className="sticky left-0 z-40 w-10 px-2 py-2 bg-slate-100 border-b-2 border-r border-slate-300">
                  <input type="checkbox" aria-label="Chọn tất cả" checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                    onChange={onToggleAll}
                    className="h-3.5 w-3.5 rounded border-slate-400 text-sky-600 focus:ring-sky-500" />
                </th>
              )}
              {visibleCols.map((c) => {
                const w = getWidth(c.key, c.width);
                const isSorted = sortBy === c.key;
                const stickyL = c.stickyLeft ? (enableSelection ? stickyOffsets[c.key] + 40 : stickyOffsets[c.key]) : undefined;
                // Per-column style override - 2026-05-23: apply CẢ header và data cells.
                // Header: global typography (nếu applyToHeader) + per-column override (luôn).
                // Data: tương tự applyToData, code ở ExcelRow bên dưới.
                const headerColStyle = getColumnStyle(c.key);
                // bgColor override → thắng bg-slate-100 default. Nếu undefined → giữ slate-100.
                const headerHasBgOverride = !!headerColStyle.bgColor;
                const headerStyle: React.CSSProperties = {
                  width: w,
                  minWidth: w,
                  maxWidth: w,
                  ...(stickyL !== undefined ? { left: stickyL } : {}),
                  // Global typography (chỉ apply khi user bật applyToHeader)
                  ...(typography.applyToHeader ? {
                    fontSize: `${typography.fontSize}px`,
                    fontWeight: typography.fontWeight,
                    color: typography.color,
                  } : {}),
                  // Per-column override LUÔN thắng global
                  ...(headerColStyle.fontSize !== undefined ? { fontSize: `${headerColStyle.fontSize}px` } : {}),
                  ...(headerColStyle.fontWeight !== undefined ? { fontWeight: headerColStyle.fontWeight } : {}),
                  ...(headerColStyle.bgColor ? { backgroundColor: headerColStyle.bgColor } : {}),
                  ...(headerColStyle.textColor ? { color: headerColStyle.textColor } : {}),
                };
                return (
                  <th
                    key={c.key}
                    style={headerStyle}
                    className={cn(
                      'relative px-2 py-2 font-semibold border-b-2 border-r border-slate-300 select-none',
                      // Khi user override bg/text → bỏ class default để inline thắng.
                      // Khi chưa override → giữ slate text + slate-100 bg (default look).
                      !headerColStyle.textColor && 'text-slate-700',
                      !headerHasBgOverride && 'bg-slate-100',
                      c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                      c.stickyLeft && 'sticky z-30',
                      c.stickyRight && 'sticky right-0 z-30 shadow-[-2px_0_4px_rgba(0,0,0,0.04)]',
                      // Hover bg-slate-200 sẽ override inline bgColor user set → chỉ apply hover khi không có override.
                      c.sortable && !headerHasBgOverride && 'cursor-pointer hover:bg-slate-200',
                      c.sortable && headerHasBgOverride && 'cursor-pointer',
                    )}
                    onClick={c.sortable ? () => onSortClick(c.key) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      {c.sortable && (
                        isSorted
                          ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
                          : <ArrowUpDown className="h-3 w-3 text-slate-300" />
                      )}
                    </span>
                    {/* Resize handle - last column không cần */}
                    <span
                      onMouseDown={onResizeStart(c.key, w)}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-sky-400/60 active:bg-sky-500"
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {leads.map((lead, idx) => (
              <ExcelRow
                key={lead.id}
                lead={lead}
                idx={idx}
                cols={visibleCols}
                getWidth={getWidth}
                stickyOffsets={stickyOffsets}
                enableSelection={enableSelection}
                isSelected={selectedIds?.has(lead.id) ?? false}
                onSelectToggle={() => onToggleOne?.(lead.id)}
                poolMode={poolMode}
                users={users}
                onRecallOne={onRecallOne}
                onOpenNote={setNoteLeadId}
                onOpenNoteView={setNoteViewLead}
                onOpenLabelEdit={setLabelEditLead}
                onOpenProductEdit={setProductEditLead}
                onOpenSourceEdit={setSourceEditLead}
                onOpenGroupEdit={setGroupEditLead}
                onOpenCustomFieldEdit={(l, fieldKey) => setCfEdit({ lead: l, fieldKey })}
                rowStyles={rowStyles}
                userRole={userRole}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Table-level dialogs - shared cho mọi row, mở qua cell click callbacks.
          Conditional render để tránh truyền entityId null/empty xuống child component. */}
      {noteLeadId && (
        <NoteDialog
          open
          onOpenChange={(o) => { if (!o) setNoteLeadId(null); }}
          entityType="lead"
          entityId={noteLeadId}
        />
      )}
      {labelEditLead && (
        <LeadLabelQuickEditDialog
          open
          onOpenChange={(o) => { if (!o) setLabelEditLead(null); }}
          leadId={labelEditLead.id}
          leadName={labelEditLead.name}
          currentLabelId={labelEditLead.label?.id ?? null}
          labels={labels}
          onSaved={(labelId) => handleLabelSaved(labelEditLead, labelId)}
        />
      )}
      {orderFlowLead && (
        <LeadCreateOrderFlow
          customerId={orderFlowLead.customerId}
          leadId={orderFlowLead.id}
          leadName={orderFlowLead.name}
          open={orderFlowOpen}
          onOpenChange={setOrderFlowOpen}
          onSuccess={() => { setOrderFlowOpen(false); router.refresh(); }}
          defaultProductId={orderFlowLead.product?.id}
          defaultCustomerName={orderFlowLead.name}
          defaultCustomerPhone={orderFlowLead.phone}
        />
      )}
      {productEditLead && (
        <LeadProductQuickEditDialog
          open
          onOpenChange={(o) => { if (!o) setProductEditLead(null); }}
          leadId={productEditLead.id}
          leadName={productEditLead.name}
          currentProductId={productEditLead.product?.id ?? null}
        />
      )}
      {sourceEditLead && (
        <LeadSourceQuickEditDialog
          open
          onOpenChange={(o) => { if (!o) setSourceEditLead(null); }}
          leadId={sourceEditLead.id}
          leadName={sourceEditLead.name}
          currentSourceId={sourceEditLead.source?.id ?? null}
        />
      )}
      {groupEditLead && (
        <LeadGroupQuickEditDialog
          open
          onOpenChange={(o) => { if (!o) setGroupEditLead(null); }}
          leadId={groupEditLead.id}
          leadName={groupEditLead.name}
          currentGroupId={groupEditLead.group?.id ?? null}
        />
      )}
      {cfEdit && (
        <LeadCustomFieldQuickEditDialog
          open
          onOpenChange={(o) => { if (!o) setCfEdit(null); }}
          leadId={cfEdit.lead.id}
          leadName={cfEdit.lead.name}
          fieldKey={cfEdit.fieldKey}
          fieldLabel={customFieldDefs.find((d) => d.key === cfEdit.fieldKey)?.label ?? cfEdit.fieldKey}
          currentValue={cfEdit.lead.metadata?.[cfEdit.fieldKey] != null ? String(cfEdit.lead.metadata[cfEdit.fieldKey]) : ''}
        />
      )}
      {noteViewLead && (
        <LeadNotesViewDialog
          open
          onOpenChange={(o) => { if (!o) setNoteViewLead(null); }}
          leadId={noteViewLead.id}
          leadName={noteViewLead.name}
        />
      )}
    </div>
  );
}

// ============================================================================
// Row component
// ============================================================================

interface RowProps {
  lead: ExcelLead;
  idx: number;
  cols: ColDef[];
  getWidth: (k: string, fb: number) => number;
  stickyOffsets: Record<string, number>;
  enableSelection: boolean;
  isSelected: boolean;
  onSelectToggle: () => void;
  poolMode?: string;
  users: { id: string; name: string }[];
  onRecallOne?: (leadId: string) => void;
  /** Click [+] note → mở NoteDialog thêm ghi chú */
  onOpenNote: (leadId: string) => void;
  /** Click text/counter note → mở view popup */
  onOpenNoteView: (lead: ExcelLead) => void;
  /** Click Nhãn cell → mở mini dialog đổi nhãn */
  onOpenLabelEdit: (lead: ExcelLead) => void;
  /** Click Sản phẩm cell → mở mini dialog đổi sản phẩm (có search) */
  onOpenProductEdit: (lead: ExcelLead) => void;
  /** Click Nguồn cell → mở mini dialog đổi nguồn (MANAGER+ only ở cell click handler) */
  onOpenSourceEdit: (lead: ExcelLead) => void;
  /** Click Nhóm cell → mở mini dialog đổi nhóm (MANAGER+ only ở cell click handler) */
  onOpenGroupEdit: (lead: ExcelLead) => void;
  /** Click cell custom field → mở mini dialog sửa text. fieldKey = key trong metadata. */
  onOpenCustomFieldEdit: (lead: ExcelLead, fieldKey: string) => void;
  /** Row colors (zebra pair + hover + selected) - inline applied to <tr> + sticky <td>. */
  rowStyles: RowStylePrefs;
  /** Forward to LeadActionMenu for permission gate. */
  userRole: 'USER' | 'MANAGER' | 'SUPER_ADMIN';
}

function computeOrderSummary(orders?: OrderLite[]) {
  if (!orders?.length) return null;
  const latest = orders[0];
  const depositPaid = (latest.payments || []).filter((p) => p.status === 'VERIFIED')
    .reduce((s, p) => s + Number(p.amount), 0);
  return { totalAmount: Number(latest.totalAmount), depositPaid };
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Vừa xong';
  if (mins < 60) return `${mins} phút`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function ExcelRow({
  lead, idx, cols, getWidth, stickyOffsets, enableSelection, isSelected, onSelectToggle,
  poolMode, users, onRecallOne, onOpenNote, onOpenNoteView, onOpenLabelEdit, onOpenProductEdit, onOpenSourceEdit, onOpenGroupEdit,
  onOpenCustomFieldEdit, rowStyles, userRole,
}: RowProps) {
  // 2026-05-23: dùng context để lấy typography + getColumnStyle áp dụng cho data cells.
  // Lý do dùng hook trong row thay vì props: tránh re-prop drilling 2 giá trị qua tất cả rows.
  // Trade-off: mọi row re-render khi typography đổi (chấp nhận vì user thay đổi hiếm).
  const { typography, getColumnStyle } = useLeadColumns();
  const isManagerPlus = userRole === 'MANAGER' || userRole === 'SUPER_ADMIN';
  const summary = computeOrderSummary(lead.orders);
  // isDistributed: lead đã được phân cho 1 user cụ thể.
  // Check theo `assignedUser` (object có id+name) thay vì `assignedAt`/`lastAssignedAt`
  // vì timestamp có thể null nếu chưa migration, còn assignedUser là nguồn sự thật.
  // Note: KHÔNG dùng cho rowBg nữa (per user 2026-05-21: dòng đã chia hiển thị như dòng thường,
  // không tô vàng). Vẫn giữ để cell 'assignedTo' / 'activity' check.
  const isDistributed = lead.status !== 'POOL' && !!lead.assignedUser;
  // Resolve màu row từ user prefs (HEX). Selected > zebra (odd/even).
  // Inline style thay vì Tailwind class để hỗ trợ HEX tự do.
  const rowBgColor = isSelected ? rowStyles.selectedBg
    : idx % 2 === 1 ? rowStyles.oddRowBg
    : rowStyles.evenRowBg;
  // Text color đi cặp với bg để giữ contrast khi user đổi nền tối/sáng.
  const rowTextColor = isSelected ? rowStyles.selectedText
    : idx % 2 === 1 ? rowStyles.oddRowText
    : rowStyles.evenRowText;

  // Map cell key → click handler. Trả undefined nếu cell không clickable.
  // 'source' chỉ clickable cho MANAGER+ vì backend chặn USER sửa sourceId.
  // 'note' KHÔNG có handler ở đây nữa - LeadNotesCell tự xử lý 2 nút riêng
  // (text/counter → view, [+] → add) để hỗ trợ split action.
  function getCellClickHandler(colKey: string): ((e: React.MouseEvent) => void) | undefined {
    if (colKey === 'label') {
      return (e) => { e.stopPropagation(); onOpenLabelEdit(lead); };
    }
    if (colKey === 'product') {
      return (e) => { e.stopPropagation(); onOpenProductEdit(lead); };
    }
    if (colKey === 'source' && isManagerPlus) {
      return (e) => { e.stopPropagation(); onOpenSourceEdit(lead); };
    }
    if (colKey === 'group' && isManagerPlus) {
      return (e) => { e.stopPropagation(); onOpenGroupEdit(lead); };
    }
    // Custom field (cf_<key>) - text edit, mọi role (metadata không field-gate ở backend).
    if (colKey.startsWith(CUSTOM_FIELD_COLUMN_PREFIX)) {
      const fieldKey = colKey.slice(CUSTOM_FIELD_COLUMN_PREFIX.length);
      return (e) => { e.stopPropagation(); onOpenCustomFieldEdit(lead, fieldKey); };
    }
    return undefined;
  }

  // CSS var --row-hover-bg + --row-hover-text dùng cho tr:hover (Tailwind arbitrary value).
  // Apply background + color inline cho <tr> để zebra/text hoạt động khi user pick HEX tự do.
  const trStyle: React.CSSProperties = {
    backgroundColor: rowBgColor,
    color: rowTextColor,
    ['--row-hover-bg' as keyof React.CSSProperties]: rowStyles.hoverBg,
    ['--row-hover-text' as keyof React.CSSProperties]: rowStyles.hoverText,
  } as React.CSSProperties;

  return (
    <tr style={trStyle} className="hover:bg-[var(--row-hover-bg)] hover:text-[var(--row-hover-text)]">
      {enableSelection && (
        <td
          style={{ backgroundColor: rowBgColor, color: rowTextColor }}
          className="sticky left-0 z-20 w-10 px-2 py-1.5 border-b border-r border-slate-200"
          onClick={(e) => e.stopPropagation()}
        >
          <input type="checkbox" checked={isSelected} onChange={onSelectToggle}
            className="h-3.5 w-3.5 rounded border-slate-400 text-sky-600 focus:ring-sky-500" />
        </td>
      )}
      {cols.map((c) => {
        const w = getWidth(c.key, c.width);
        const stickyL = c.stickyLeft ? (enableSelection ? stickyOffsets[c.key] + 40 : stickyOffsets[c.key]) : undefined;
        // isClickable = có handler thực sự (đã apply role gate). 'source' key có trong set
        // nhưng handler trả undefined cho USER → vẫn coi là không clickable, không hiện cursor-pointer.
        const cellClickHandler = getCellClickHandler(c.key);
        const isClickable = !!cellClickHandler;
        // 2026-05-23: Per-column style override NOW áp dụng cho cả data cells.
        // Layer ưu tiên (cao → thấp): per-column override > global typography > row tr cascade > default.
        const dataColStyle = getColumnStyle(c.key);
        const isSticky = c.stickyLeft || c.stickyRight;
        // Sticky cell cần inline rowBgColor để che data khi scroll ngang.
        // Non-sticky → undefined, inherit <tr> (có hover effect qua --row-hover-bg).
        // Per-column bgColor (nếu set) thắng zebra bg trên non-sticky cells.
        const cellBg = isSticky
          ? rowBgColor
          : (dataColStyle.bgColor ?? undefined);
        // Border slate-200 (đậm hơn slate-100 cũ) cho cảm giác Excel grid rõ ràng,
        // overflow:hidden tránh content (vd badge trùng) tràn sang cell kế.
        const cellCls = cn(
          'px-2 py-1.5 border-b border-r border-slate-200 overflow-hidden',
          c.align === 'right' ? 'text-right tabular-nums' : c.align === 'center' ? 'text-center' : 'text-left',
          c.stickyLeft && 'sticky z-10',
          c.stickyRight && 'sticky right-0 z-10 shadow-[-2px_0_4px_rgba(0,0,0,0.04)]',
          isClickable && 'cursor-pointer hover:bg-sky-100/40',
        );
        const style: React.CSSProperties = {
          width: w,
          minWidth: w,
          maxWidth: w,
          ...(stickyL !== undefined ? { left: stickyL } : {}),
          ...(cellBg ? { backgroundColor: cellBg } : {}),
          // Global typography cho data cells (nếu user bật applyToData)
          ...(typography.applyToData ? {
            fontSize: `${typography.fontSize}px`,
            fontWeight: typography.fontWeight,
            color: typography.color,
          } : {}),
          // Per-column override LUÔN thắng global
          ...(dataColStyle.fontSize !== undefined ? { fontSize: `${dataColStyle.fontSize}px` } : {}),
          ...(dataColStyle.fontWeight !== undefined ? { fontWeight: dataColStyle.fontWeight } : {}),
          ...(dataColStyle.textColor ? { color: dataColStyle.textColor } : {}),
        };
        return (
          <td key={c.key} style={style} className={cellCls} onClick={cellClickHandler}>
            <CellContent col={c.key} idx={idx} lead={lead} summary={summary}
              isDistributed={isDistributed} poolMode={poolMode} users={users} onRecallOne={onRecallOne}
              userRole={userRole}
              onOpenNote={onOpenNote} onOpenNoteView={onOpenNoteView} />
          </td>
        );
      })}
    </tr>
  );
}

// ============================================================================
// Cell renderer (switch theo column key)
// ============================================================================

interface CellProps {
  col: string;
  /** Vị trí dòng trong trang hiện tại (0-based) - dùng render cột STT (idx + 1). */
  idx: number;
  lead: ExcelLead;
  summary: ReturnType<typeof computeOrderSummary>;
  isDistributed: boolean;
  poolMode?: string;
  users: { id: string; name: string }[];
  onRecallOne?: (leadId: string) => void;
  userRole: 'USER' | 'MANAGER' | 'SUPER_ADMIN';
  /** Forward để cell 'note' render LeadNotesCell với 2 callback split (view vs add). */
  onOpenNote: (leadId: string) => void;
  onOpenNoteView: (lead: ExcelLead) => void;
}

function CellContent({ col, idx, lead, summary, isDistributed, poolMode, users, onRecallOne, userRole, onOpenNote, onOpenNoteView }: CellProps) {
  switch (col) {
    case 'stt':
      return <span className="text-slate-500 tabular-nums">{idx + 1}</span>;
    case 'name':
      return (
        <div className="flex items-center gap-1.5">
          <LeadNameLink leadId={lead.id} name={lead.name} />
          {lead.metadata?.aiLevel && (
            <span className={cn('text-[9px] font-bold px-1 py-0.5 rounded-full text-white shrink-0',
              lead.metadata.aiLevel === 'HOT' ? 'bg-red-500' :
              lead.metadata.aiLevel === 'WARM' ? 'bg-amber-500' : 'bg-sky-400')}>
              {lead.metadata.aiScore || '?'}
            </span>
          )}
          {lead.orders && lead.orders.length > 0 && (
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 shrink-0">Đã mua</span>
          )}
        </div>
      );
    case 'phone':
      // LeadDuplicateBadge giờ render INSIDE PhoneCell (cạnh carrier badge).
      return <PhoneCell leadId={lead.id} phone={lead.phone} leadName={lead.name} duplicateCount={lead.duplicateCount ?? 0} />;
    case 'product':
      // Placeholder "+ thêm sản phẩm" - clickable hint (handler ở row click)
      return lead.product?.name
        ? <span className="text-slate-600">{lead.product.name}</span>
        : <span className="text-sky-500 italic hover:underline">+ thêm sản phẩm</span>;
    case 'label':
      return lead.label
        ? <LabelPill label={lead.label} size="sm" />
        : <span className="text-sky-500 italic hover:underline">+ thêm nhãn</span>;
    case 'totalAmount':
      return summary ? <>{formatVND(summary.totalAmount)}</> : <span className="text-slate-300">-</span>;
    case 'depositPaid':
      return summary ? <>{formatVND(summary.depositPaid)}</> : <span className="text-slate-300">-</span>;
    case 'source': {
      // MANAGER+ thấy hint click để edit; USER chỉ thấy text plain.
      const canEditSource = userRole === 'MANAGER' || userRole === 'SUPER_ADMIN';
      if (lead.source?.name) {
        return <span className={canEditSource ? 'text-slate-600 hover:underline decoration-dotted' : 'text-slate-600'}>{lead.source.name}</span>;
      }
      return canEditSource
        ? <span className="text-sky-500 italic hover:underline">+ thêm nguồn</span>
        : <span className="text-slate-300">-</span>;
    }
    case 'group': {
      // MANAGER+ thấy hint click để gắn/đổi nhóm; USER chỉ thấy text plain.
      const canEditGroup = userRole === 'MANAGER' || userRole === 'SUPER_ADMIN';
      if (lead.group?.name) {
        return <span className={canEditGroup ? 'text-slate-600 hover:underline decoration-dotted' : 'text-slate-600'}>{lead.group.name}</span>;
      }
      return canEditGroup
        ? <span className="text-sky-500 italic hover:underline">+ thêm nhóm</span>
        : <span className="text-slate-300">-</span>;
    }
    case 'note':
      return (
        <LeadNotesCell
          notes={lead.recentNotes}
          emptyPlaceholder="+ ghi chú"
          onView={() => onOpenNoteView(lead)}
          onAdd={() => onOpenNote(lead.id)}
        />
      );
    case 'createdAt':
      return <span className="text-slate-500 text-xs">{formatDateTime(lead.createdAt)}</span>;
    case 'assignedTo': {
      if (!isDistributed) return <span className="text-slate-300">-</span>;
      // assignedTime: ưu tiên lastAssignedAt (backend select từ trigger), fallback assignedAt
      // để giữ tương thích nếu các nguồn data khác (pool/new endpoint) vẫn dùng tên cũ.
      const assignedTime = lead.lastAssignedAt ?? lead.assignedAt;
      return (
        <div className="flex items-center gap-2 flex-wrap">
          <div>
            <span className="font-medium text-slate-800">{lead.assignedUser?.name}</span>
            {assignedTime && <span className="ml-1 text-xs text-slate-400">({relativeTime(assignedTime)})</span>}
          </div>
          {onRecallOne && (
            <button type="button" onClick={() => onRecallOne(lead.id)}
              className="inline-flex items-center gap-0.5 rounded border border-amber-300 px-1.5 py-0.5 text-[11px] text-amber-700 hover:bg-amber-50">
              <Undo2 className="h-3 w-3" />Thu hồi
            </button>
          )}
        </div>
      );
    }
    case 'activity':
      if (!isDistributed) return <span className="text-slate-300">-</span>;
      return (
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
          (lead.activityCount ?? 0) >= 2 ? 'bg-emerald-100 text-emerald-700' :
          (lead.activityCount ?? 0) === 1 ? 'bg-yellow-100 text-yellow-700' :
          'bg-red-100 text-red-700')}>
          {lead.activityCount ?? 0}
        </span>
      );
    case 'edit':
      return <LeadActionMenu leadId={lead.id} lead={lead as unknown as Parameters<typeof LeadActionMenu>[0]['lead']} userRole={userRole} />;
    case 'actions':
      return poolMode && poolMode !== 'all'
        ? <LeadPoolActionButtons leadId={lead.id} leadName={lead.name} mode={poolMode === 'new' ? 'assign' : 'both'} users={users} />
        : null;
    default: {
      // Cột trường tùy chỉnh (cf_<key>): đọc giá trị text từ lead.metadata.
      if (col.startsWith(CUSTOM_FIELD_COLUMN_PREFIX)) {
        const value = lead.metadata?.[col.slice(CUSTOM_FIELD_COLUMN_PREFIX.length)];
        return value !== undefined && value !== null && value !== ''
          ? <span className="text-slate-600">{String(value)}</span>
          : <span className="text-sky-500 italic hover:underline">+ nhập</span>;
      }
      return null;
    }
  }
}
