import { Suspense } from 'react';
import { serverFetch, getCurrentUser } from '@/lib/auth';
import type { LeadRecord, NamedEntity, LabelEntity, ApiListResponse } from '@/types/entities';
import { LeadListAdvancedFilterBar } from '@/components/leads/lead-list-advanced-filter-bar';
import { PaginationControls } from '@/components/shared/pagination-controls';
import { LeadsTable } from '@/components/leads/leads-table';
import { LeadsLayoutShell } from '@/components/leads/leads-layout-shell';
import { LeadsBootstrapHydrator } from '@/components/leads/leads-bootstrap-hydrator';
import { LeadFilterPendingProvider } from '@/components/leads/lead-filter-pending-context';

type UserRole = 'USER' | 'MANAGER' | 'SUPER_ADMIN';

/** Lead list page - single source of truth.
 *  Filter combo (status array + assignment + teamId + ...) bao trùm mọi case cũ
 *  (Kho Mới = ?status=POOL&assignment=unassigned, Zoom = ?status=ZOOM, etc.).
 *  Manager+ thấy bulk-assign toolbar; USER thấy table/kanban đơn giản. */
export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const params = await searchParams;
  // Filter đa chọn -> 1 key có nhiều giá trị (?groupId=a&groupId=b) -> Next trả string[].
  // KHÔNG dùng new URLSearchParams(params) trực tiếp: array bị join thành CSV "a,b" -> backend
  // BigInt("a,b") throw -> cả Promise.all reject -> data + reference data đều rỗng (filter trắng).
  const qp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((v) => qp.append(key, v));
    else if (value !== undefined) qp.append(key, value);
  }
  qp.delete('cursor');
  const query = qp.toString();

  const currentUser = await getCurrentUser();
  const userRole = (currentUser?.role || 'USER') as UserRole;
  // LeadsTable tự derive isManager/isSuperAdmin từ userRole prop - không lặp logic ở page.tsx.

  // Bố cục bảng khóa theo phòng ban: chỉ áp cho USER/LEADER (manager+ luôn tự do).
  // Fetch fail hoặc không có config -> null -> bố cục tự do như cũ (graceful fallback).
  let lockedLayout: { visible: Record<string, boolean>; order: string[] } | null = null;
  if (userRole !== 'MANAGER' && userRole !== 'SUPER_ADMIN') {
    lockedLayout = await serverFetch<{ data: { visible: Record<string, boolean>; order: string[] } | null }>(
      '/department-view-configs/my',
    ).then(r => r.data).catch(() => null);
  }

  let data: LeadRecord[] = [];
  let meta: ApiListResponse<LeadRecord>['meta'] = {};
  let sources: NamedEntity[] = [];
  let groups: NamedEntity[] = [];
  let products: NamedEntity[] = [];
  let users: NamedEntity[] = [];
  let departments: NamedEntity[] = [];
  let teams: NamedEntity[] = [];
  let labels: LabelEntity[] = [];
  let customFieldDefs: { key: string; label: string }[] = [];

  try {
    // USER role không có quyền GET /users -> skip để tránh 403 lãng phí.
    // (BE chặn ở guard; bulk-assign dropdown chỉ render cho manager+ nên USER không cần list này.)
    const usersFetch = userRole === 'USER'
      ? Promise.resolve({ data: [] as NamedEntity[] })
      : serverFetch<{ data: NamedEntity[] }>('/users/lookup').catch(() => ({ data: [] as NamedEntity[] }));

    const [leadsRes, srcRes, grpRes, prodRes, usrRes, deptRes, teamRes, lblRes, fieldDefRes] = await Promise.all([
      serverFetch<ApiListResponse<LeadRecord>>(`/leads?${query}`),
      serverFetch<{ data: NamedEntity[] }>('/lead-sources').catch(() => ({ data: [] })),
      serverFetch<{ data: NamedEntity[] }>('/lead-groups').catch(() => ({ data: [] })),
      serverFetch<{ data: NamedEntity[] }>('/products/lookup').catch(() => ({ data: [] })),
      usersFetch,
      serverFetch<{ data: NamedEntity[] }>('/departments').catch(() => ({ data: [] })),
      serverFetch<{ data: NamedEntity[] }>('/teams').catch(() => ({ data: [] })),
      serverFetch<{ data: LabelEntity[] }>('/labels').catch(() => ({ data: [] })),
      serverFetch<{ data: { key: string; label: string }[] }>('/lead-field-definitions').catch(() => ({ data: [] })),
    ]);
    data = leadsRes.data;
    meta = leadsRes.meta;
    sources = (srcRes.data || []).map((s: NamedEntity) => ({ id: String(s.id), name: s.name }));
    groups = (grpRes.data || []).map((g: NamedEntity) => ({ id: String(g.id), name: g.name }));
    products = (prodRes.data || []).map((p: NamedEntity) => ({ id: String(p.id), name: p.name }));
    users = (usrRes.data || []).map((u: NamedEntity) => ({ id: String(u.id), name: u.name }));
    departments = (deptRes.data || []).map((d: NamedEntity) => ({ id: String(d.id), name: d.name }));
    teams = (teamRes.data || []).map((t: NamedEntity) => ({ id: String(t.id), name: t.name }));
    labels = (lblRes.data || []).map((l: LabelEntity) => ({ id: String(l.id), name: l.name, color: l.color, textColor: l.textColor || '#ffffff', triggersOrder: l.triggersOrder ?? false }));
    customFieldDefs = (fieldDefRes.data || []).map(d => ({ key: d.key, label: d.label }));
  } catch { /* empty */ }

  return (
    <LeadsLayoutShell>
      {/* Hydrate localStorage cache với reference data từ server để các dialog/drawer
          trên page này (LeadEditDrawer → LeadQuickActionsPanel, ...) không phải refetch. */}
      <LeadsBootstrapHydrator
        users={users}
        departments={departments}
        labels={labels}
        sources={sources}
        products={products}
      />

      {/* Pending date filter context: filter bar update pending date, label chips
          consume khi click để apply LUÔN cùng label (xem wireframe v4 mục 5). */}
      <LeadFilterPendingProvider>
        {/* Header dòng cũ (Leads + Tạo lead + CSV) đã bỏ hẳn theo wireframe v4.
            Nút Tạo lead xuống toolbar (cạnh Setting). CSV bỏ hẳn. */}
        <Suspense>
          <LeadListAdvancedFilterBar
            sources={sources} groups={groups} products={products} users={users}
            departments={departments} labels={labels}
            teams={teams} userRole={userRole}
            hideStatus={userRole !== 'USER'}
          />
        </Suspense>

        {/* Unified table cho mọi role - gate logic bulk-action + cột "Phân cho"/"Tương tác"
            + nút "+ Tạo lead" (trong toolbar, chỉ manager+) theo userRole nội bộ.
            Xem leads-table.tsx + wireframe.md để biết chi tiết. */}
        <LeadsTable
          leads={data}
          initialMeta={meta}
          userRole={userRole}
          users={users}
          labels={labels}
          sources={sources}
          products={products}
          lockedLayout={lockedLayout}
          customFieldDefs={customFieldDefs}
        />

        <PaginationControls total={meta?.total} page={meta?.page} limit={meta?.limit} totalPages={meta?.totalPages} />
      </LeadFilterPendingProvider>
    </LeadsLayoutShell>
  );
}
