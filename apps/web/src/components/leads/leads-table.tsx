'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LabelCombobox } from '@/components/ui/label-combobox';
import { LeadTableExcel, type ExcelLead, buildLeadColumns, LEAD_COLUMNS_STORAGE_KEY } from '@/components/leads/lead-table-excel';
import { LeadColumnsProvider, type LockedColumnLayout } from '@/components/leads/lead-columns-context';
import { LeadsToolbarRow } from '@/components/leads/leads-toolbar-row';
import { LeadMobileList } from '@/components/leads/lead-mobile-list';
import { LeadMobileBulkBar } from '@/components/leads/lead-mobile-bulk-bar';
import { LeadMobileKhoTabs } from '@/components/leads/lead-mobile-kho-tabs';
import { LeadMobileManagerStrip } from '@/components/leads/lead-mobile-manager-strip';
import { KhoDistributeButton } from '@/components/leads/kho-distribute-button';
import { CreateLeadDialog } from '@/components/leads/create-lead-dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useBulkSelection } from '@/hooks/use-bulk-selection';
import { useLeadsPolling } from '@/hooks/use-leads-polling';
import { useLeadFilterPending } from '@/components/leads/lead-filter-pending-context';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { api } from '@/lib/api-client';
import { Users, Undo2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { LeadRecord, LabelEntity, NamedEntity, ApiListResponse } from '@/types/entities';

type UserRole = 'USER' | 'MANAGER' | 'SUPER_ADMIN';

interface LeadLite extends ExcelLead { status: string }

interface LeadsTableProps {
  leads: LeadRecord[];
  /** Pagination meta từ RSC initial render. Polling sẽ cập nhật meta theo response mới. */
  initialMeta?: ApiListResponse<LeadRecord>['meta'];
  userRole: UserRole;
  users: NamedEntity[];
  labels: LabelEntity[];
  /** Sources + products để truyền xuống CreateLeadDialog (render trong toolbar manager+). */
  sources?: NamedEntity[];
  products?: NamedEntity[];
  /** Bố cục cột khóa theo phòng ban (USER/LEADER). null = tự do như cũ. */
  lockedLayout?: LockedColumnLayout | null;
  /** Trường tùy chỉnh active (RSC fetch) - cột động trong bảng desktop. */
  customFieldDefs?: { key: string; label: string }[];
  /** Trang kho pool/zoom: bật nút "AI Chia số" trên toolbar (undefined = ẩn).
   *  Cột thao tác per-row giữ nguyên như /leads (nút cây bút) - không đổi. */
  distributeMode?: 'new' | 'zoom';
  /** Danh sách phòng ban - trang kho cần cho dialog AI Chia số. */
  departments?: NamedEntity[];
}

/**
 * Bảng leads dùng chung cho TRANG `/leads` (mọi role).
 *
 * Thay thế cặp wrapper cũ `LeadPoolTableWithBulkAssign` + `LeadListWithViewToggle`
 * (đã xóa) - gate logic theo `userRole` nội bộ thay vì tách 2 component theo role.
 *
 * Hành vi theo role:
 * - USER: chỉ table read/inline-edit. Không bulk toolbar, không cột "Phân cho"/"Tương tác".
 * - MANAGER/SUPER_ADMIN: bulk-assign + template apply + bulk-recall. Cột "Phân cho" + "Tương tác".
 * - SUPER_ADMIN: thêm bulk-delete bar (xóa nhiều lead cùng lúc).
 *
 * Polling: client-only `api.get('/leads')` mỗi 30s qua hook `useLeadsPolling`.
 * Reference data (sources/products/users/departments/teams/labels) chỉ fetch lần đầu
 * qua RSC `page.tsx` hoặc khi user đổi URL filter (navigation re-render RSC).
 * Mục đích: giảm 8 -> 2 request mỗi 30s. Xem `use-leads-polling.ts`.
 *
 */
export function LeadsTable({ leads: initialLeads, initialMeta, userRole, users, labels, sources = [], products = [], lockedLayout = null, customFieldDefs = [], distributeMode, departments = [] }: LeadsTableProps) {
  const isManager = userRole === 'MANAGER' || userRole === 'SUPER_ADMIN';
  const isSuperAdmin = userRole === 'SUPER_ADMIN';
  const isMobile = useIsMobile();

  // Mobile: selection mode tường minh qua nút "Chọn" (manager strip). OR với
  // sel.count > 0 (long-press vẫn vào mode như cũ).
  const [selectionArmed, setSelectionArmed] = useState(false);

  // Polling client-only: chỉ fetch `/leads`, KHÔNG re-render toàn RSC.
  // Hook tự dừng khi tab background + resume + abort fetch cũ.
  const { leads: polledLeads, meta: polledMeta, refresh: refreshLeads } = useLeadsPolling(initialLeads, initialMeta);
  // Rung "chuông" để label chips (LeadLabelQuickFilters) refetch counts ngay sau bulk-action.
  const { refreshLabelCounts } = useLeadFilterPending();
  // Cast sang LeadLite cho LeadTableExcel (subset shape của LeadRecord).
  const leads = polledLeads as unknown as LeadLite[];
  const sel = useBulkSelection(leads);

  // Bulk-action dialogs/state (chỉ dùng khi isManager)
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkUserId, setBulkUserId] = useState('');
  const [bulkLabelId, setBulkLabelId] = useState('');
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string; members: { user: { name: string } }[] }[]>([]);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateLabelId, setTemplateLabelId] = useState('');
  const [templateApplying, setTemplateApplying] = useState(false);
  const [recalling, setRecalling] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Load assignment templates (chỉ manager+ cần)
  useEffect(() => {
    if (!isManager) return;
    api.get<{ data: typeof templates }>('/assignment-templates')
      .then((res) => setTemplates(res.data || []))
      .catch(() => {});
  }, [isManager]);

  // 2026-05-23: Backend đã hỗ trợ auto-recall - cho phép assign mọi status TRỪ CONVERTED/LOST.
  // selectedAssignable: lead có thể assign/reassign (gồm cả lead đã có chủ - sẽ auto-recall trong tx).
  // selectedDistributed: lead đã có chủ - dùng để hiện warning trong dialog + nút Recall.
  const NON_ASSIGNABLE_STATUSES = new Set(['CONVERTED', 'LOST']);
  const selectedAssignable = sel.selectedIds.filter((id) => {
    const status = leads.find((l) => l.id === id)?.status;
    return !!status && !NON_ASSIGNABLE_STATUSES.has(status);
  });
  const selectedDistributed = sel.selectedIds.filter((id) => {
    const l = leads.find((le) => le.id === id);
    return l && !!l.assignedUser;
  });
  /** Số lead trong selection đã có chủ - sẽ bị reassign (cần warning user). */
  const reassignCount = selectedAssignable.filter((id) => {
    const l = leads.find((le) => le.id === id);
    return l && !!l.assignedUser;
  }).length;

  async function handleBulkAssign() {
    if (!bulkUserId || selectedAssignable.length === 0) return;
    setBulkAssigning(true);
    try {
      const res = await api.post<{
        data: {
          assigned: number; skipped: number;
          reassigned?: number; newAssigned?: number; sameOwnerSkipped?: number;
        };
      }>('/leads/bulk-assign', {
        leadIds: selectedAssignable,
        userId: bulkUserId,
        ...(bulkLabelId ? { labelId: bulkLabelId } : {}),
      });
      const { assigned, skipped, reassigned = 0 } = res.data;
      // Toast breakdown: phân biệt rõ assign mới vs reassign vs skip
      const parts: string[] = [`${assigned} lead đã phân`];
      if (reassigned > 0) parts.push(`${reassigned} reassigned`);
      if (skipped > 0) parts.push(`${skipped} bỏ qua`);
      toast.success(`Đã hoàn tất: ${parts.join(' · ')}`);
      refreshLeads();
      refreshLabelCounts();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Lỗi phân phối hàng loạt');
    }
    setBulkAssigning(false);
    setBulkDialogOpen(false);
    sel.clear();
    setBulkUserId('');
    setBulkLabelId('');
  }

  async function handleTemplateApply() {
    if (!selectedTemplateId || selectedAssignable.length === 0) return;
    setTemplateApplying(true);
    try {
      const res = await api.post<{
        data: { assigned: number; skipped?: number; reassigned?: number; newAssigned?: number };
      }>(`/assignment-templates/${selectedTemplateId}/apply`, {
        leadIds: selectedAssignable,
        ...(templateLabelId ? { labelId: templateLabelId } : {}),
      });
      const { assigned, skipped = 0, reassigned = 0 } = res.data ?? { assigned: 0 };
      const parts: string[] = [`${assigned} lead đã phân`];
      if (reassigned > 0) parts.push(`${reassigned} reassigned`);
      if (skipped > 0) parts.push(`${skipped} bỏ qua`);
      toast.success(`Áp dụng template thành công: ${parts.join(' · ')}`);
      refreshLeads();
      refreshLabelCounts();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Lỗi phân phối theo template');
    }
    setTemplateApplying(false);
    setTemplateDialogOpen(false);
    sel.clear();
    setSelectedTemplateId('');
    setTemplateLabelId('');
  }

  async function handleBulkRecall() {
    if (selectedDistributed.length === 0) return;
    setRecalling(true);
    try {
      const res = await api.post<{ data: { recalled: number } }>(
        '/leads/bulk-recall', { leadIds: selectedDistributed });
      toast.success(`Đã thu hồi ${res.data?.recalled ?? 0} leads`);
      refreshLeads();
      refreshLabelCounts();
      sel.clear();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Lỗi thu hồi hàng loạt');
    }
    setRecalling(false);
  }

  // Bulk delete cho mobile (super admin). Desktop dùng BulkDeleteBar floating
  // pill - không cần handler riêng vì component đó tự gọi API.
  async function handleBulkDelete() {
    if (sel.count === 0) return;
    setBulkDeleting(true);
    try {
      const res = await api.post<{ data: { deleted: number; skipped: number } }>(
        '/leads/bulk-delete', { ids: sel.selectedIds });
      const { deleted, skipped } = res.data;
      toast.success(`Đã xóa ${deleted} lead${skipped > 0 ? ` (bỏ qua ${skipped})` : ''}`);
      refreshLeads();
      refreshLabelCounts();
      sel.clear();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Lỗi xóa hàng loạt');
    }
    setBulkDeleting(false);
  }

  // Cột "Phân cho" + "Tương tác" chỉ render cho manager+
  const showAssignActionCols = isManager;

  // Toggleable columns build cùng args với LeadTableExcel để Setting popover khớp render
  const { toggleableColumns } = useMemo(
    () => buildLeadColumns({ showAssignActionCols, poolMode: 'all', customFieldDefs }),
    [showAssignActionCols, customFieldDefs],
  );

  // Bật selection cho manager (bulk-assign) hoặc SA (bulk-delete)
  const enableSelection = isManager || isSuperAdmin;

  return (
    <LeadColumnsProvider storageKey={LEAD_COLUMNS_STORAGE_KEY} lockedLayout={lockedLayout}>
      {/* Mobile bulk bar - fixed bottom, gradient sky→cyan. Render khi selection
          mode có lead được chọn (count > 0). Thay thế inline toolbar desktop. */}
      {isMobile && isManager && (
        <LeadMobileBulkBar
          count={sel.count}
          poolCount={selectedAssignable.length}
          distributedCount={selectedDistributed.length}
          hasTemplates={templates.length > 0}
          recalling={recalling}
          onClear={() => { sel.clear(); setSelectionArmed(false); }}
          onAssignClick={() => setBulkDialogOpen(true)}
          onTemplateClick={() => setTemplateDialogOpen(true)}
          onRecallClick={handleBulkRecall}
          deleteSlot={isManager ? (
            <ConfirmDialog
              trigger={
                <button
                  type="button"
                  className="flex h-11 flex-1 flex-col items-center justify-center rounded-xl bg-red-500/90 text-[11px] font-bold text-white transition-colors active:bg-red-600"
                  aria-label={`Xóa ${sel.count} lead`}
                >
                  <Trash2 className="h-4 w-4" />
                  Xóa
                </button>
              }
              title={`Xóa ${sel.count} lead?`}
              description="Thao tác soft-delete. Có thể restore từ DB nếu cần."
              confirmLabel="Xóa"
              onConfirm={handleBulkDelete}
              isLoading={bulkDeleting}
            />
          ) : undefined}
        />
      )}

      {/* Desktop inline bulk toolbar - giữ nguyên, chỉ render khi !isMobile.
          Dùng `count > 0` thay vì `someSelected` để toolbar vẫn hiện
          khi user click "chọn tất cả" (someSelected = indeterminate, sẽ false ở all). */}
      {!isMobile && sel.count > 0 && isManager && (
        <div className="mb-3 flex items-center gap-3 rounded-lg bg-sky-50 border border-sky-200 px-4 py-2.5">
          <span className="text-sm font-medium text-sky-700">
            Đã chọn {sel.count} lead
            {reassignCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                {reassignCount} đã có chủ
              </span>
            )}
          </span>
          {/* 2026-05-23: hiện nút Phân/Template miễn có lead assignable (gồm cả đã có chủ).
              Backend auto-recall trong tx, dialog cảnh báo trước. */}
          {selectedAssignable.length > 0 && (
            <Button size="sm" onClick={() => setBulkDialogOpen(true)}>
              <Users className="h-4 w-4 mr-1" />Phân phối
            </Button>
          )}
          {selectedDistributed.length > 0 && (
            <Button size="sm" onClick={handleBulkRecall} disabled={recalling}
              title="Thu hồi lead về Kho Mới (POOL, không phân ai)"
              className="bg-amber-500 hover:bg-amber-600 text-white font-medium shadow-md">
              <Undo2 className="h-4 w-4 mr-1" />
              {recalling ? 'Đang thu hồi...' : `Thu hồi ${selectedDistributed.length}`}
            </Button>
          )}
          {/* Nút Xóa gom chung thanh bulk - manager+ (BE guard MANAGER, SUPER_ADMIN) */}
          <ConfirmDialog
            trigger={
              <Button size="sm" variant="destructive" disabled={bulkDeleting}>
                <Trash2 className="h-4 w-4 mr-1" />Xóa
              </Button>
            }
            title={`Xóa ${sel.count} lead?`}
            description="Thao tác soft-delete. Có thể restore từ DB nếu cần."
            confirmLabel="Xóa"
            onConfirm={handleBulkDelete}
            isLoading={bulkDeleting}
          />
          <Button size="sm" variant="ghost" onClick={sel.clear}>Bỏ chọn</Button>
        </div>
      )}

      {/* Unified toolbar: label chips (70%) + Setting + Tạo lead (mọi role) (30%).
          Bỏ nút Refresh - auto router.refresh() 30s phía trên.
          USER cũng được tạo lead (BE cho phép) - không gate FE. */}
      <LeadsToolbarRow
        toggleableColumns={toggleableColumns}
        showCreateButton={true}
        showExportButton={isManager}
        createDialogSources={sources}
        createDialogProducts={products}
        extraActions={
          // Nút AI Chia số chỉ trên trang Kho Mới / Kho Zoom (distribute là
          // thao tác scope-kho, BE tự lấy tối đa 100 lead - không theo selection).
          !isMobile && isManager && distributeMode ? (
            <KhoDistributeButton
              poolMode={distributeMode}
              leadCount={polledMeta?.total ?? leads.length}
              departments={departments}
              onDistributed={() => { refreshLeads(); refreshLabelCounts(); }}
            />
          ) : undefined
        }
      />

      {/* Mobile: tab kho (filter nhanh 1 chạm) + dải nút AI Chia số/Chọn.
          Đặt dưới toolbar label chips, trên list card. */}
      {isMobile && (
        <>
          <LeadMobileKhoTabs userRole={userRole} />
          {/* Nút "Chia số" chỉ cho manager+ - bulk action (Phân/Mẫu/Thu hồi/Xóa)
              là quyền manager, USER không có thao tác hàng loạt nên ẩn hẳn. */}
          {isManager && (
            <LeadMobileManagerStrip
              selectionMode={selectionArmed || sel.count > 0}
              onToggleSelectionMode={() => {
                if (selectionArmed || sel.count > 0) {
                  setSelectionArmed(false);
                  sel.clear();
                } else {
                  setSelectionArmed(true);
                }
              }}
            />
          )}
        </>
      )}

      {/* Branch render: mobile → card list; desktop → Excel-style table */}
      {isMobile ? (
        <LeadMobileList
          leads={leads}
          userRole={userRole}
          selectedIds={sel.selected}
          onToggleOne={sel.toggleOne}
          count={sel.count}
          selectionArmed={selectionArmed}
          onEnterSelectionMode={() => setSelectionArmed(true)}
          users={users}
        />
      ) : (
        <LeadTableExcel
          leads={leads}
          enableSelection={enableSelection}
          selectedIds={sel.selected}
          onToggleOne={sel.toggleOne}
          onToggleAll={sel.toggleAll}
          allSelected={sel.allSelected}
          someSelected={sel.someSelected}
          showAssignActionCols={showAssignActionCols}
          poolMode="all"
          users={users}
          labels={labels}
          userRole={userRole}
          customFieldDefs={customFieldDefs}
        />
      )}

      {/* Mobile FAB Tạo lead - floating góc phải dưới (mọi role). Override
          Button defaults bằng arbitrary CSS selector. Ẩn khi selection mode để
          không chồng lên bulk bar fixed bottom. */}
      {isMobile && !selectionArmed && sel.count === 0 && (
        <div
          className="fixed bottom-20 right-4 z-40 [&>button]:!h-10 [&>button]:!w-10 [&>button]:!rounded-full [&>button]:!p-0 [&>button]:!shadow-2xl [&>button]:!bg-gradient-to-br [&>button]:!from-sky-500 [&>button]:!to-cyan-500 [&>button>svg]:!h-5 [&>button>svg]:!w-5 [&>button>svg]:!mr-0 [&>button>span]:!hidden"
          title="Tạo lead mới"
        >
          <CreateLeadDialog sources={sources} products={products} />
        </div>
      )}

      {/* Bulk assign dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Phân {selectedAssignable.length} leads cho nhân viên</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Select value={bulkUserId} onValueChange={setBulkUserId}>
              <SelectTrigger><SelectValue placeholder="Chọn nhân viên" /></SelectTrigger>
              <SelectContent>
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Gắn nhãn cho cả đợt (tùy chọn)</p>
              <LabelCombobox
                value={bulkLabelId}
                onChange={setBulkLabelId}
                labels={labels}
                placeholder="Không gắn nhãn"
              />
            </div>
            {reassignCount > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <p className="font-semibold mb-0.5">Lưu ý reassign:</p>
                <p>
                  Có <span className="font-mono font-semibold">{reassignCount}</span>/{selectedAssignable.length} lead
                  đang có chủ - sẽ được tự động chuyển sang nhân viên mới (auto-recall trong cùng transaction).
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleBulkAssign} disabled={!bulkUserId || bulkAssigning}>
              {bulkAssigning ? 'Đang phân...' : `Phân ${selectedAssignable.length} leads`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template apply dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Phân phối {selectedAssignable.length} leads theo Template</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
              <SelectTrigger><SelectValue placeholder="Chọn template" /></SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name} ({t.members?.length || 0} người)</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTemplateId && (
              <p className="text-xs text-slate-500">
                Round-robin: {selectedAssignable.length} leads chia đều cho{' '}
                {templates.find((t) => t.id === selectedTemplateId)?.members?.map((m) => m.user.name).join(', ')}
              </p>
            )}
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Gắn nhãn cho cả đợt (tùy chọn)</p>
              <LabelCombobox
                value={templateLabelId}
                onChange={setTemplateLabelId}
                labels={labels}
                placeholder="Không gắn nhãn"
              />
            </div>
            {reassignCount > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <p className="font-semibold mb-0.5">Lưu ý reassign:</p>
                <p>
                  Có <span className="font-mono font-semibold">{reassignCount}</span>/{selectedAssignable.length} lead
                  đang có chủ - sẽ được tự động chuyển sang nhân viên trong template.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleTemplateApply} disabled={!selectedTemplateId || templateApplying}>
              {templateApplying ? 'Đang phân phối...' : `Phân phối ${selectedAssignable.length} leads`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LeadColumnsProvider>
  );
}
