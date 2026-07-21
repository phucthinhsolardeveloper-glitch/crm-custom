import { Suspense } from 'react';
import { serverFetch } from '@/lib/auth';
import type { LeadRecord, NamedEntity, LabelEntity, ApiListResponse } from '@/types/entities';
import { LeadListAdvancedFilterBar } from '@/components/leads/lead-list-advanced-filter-bar';
import { PaginationControls } from '@/components/shared/pagination-controls';
import { LeadsTable } from '@/components/leads/leads-table';
import { LeadsLayoutShell } from '@/components/leads/leads-layout-shell';
import { LeadsBootstrapHydrator } from '@/components/leads/leads-bootstrap-hydrator';
import { LeadFilterPendingProvider } from '@/components/leads/lead-filter-pending-context';
import { KhoBaseParamsProvider } from '@/components/leads/kho-base-params-context';
import { KHO_CONFIGS, mergeKhoParams, type KhoKey } from '@/components/leads/kho-config';

type UserRole = 'MANAGER' | 'SUPER_ADMIN';

interface KhoLeadsPageProps {
  kho: KhoKey;
  userRole: UserRole;
  searchParams: Record<string, string | string[]>;
}

/**
 * Nội dung dùng chung cho 4 trang kho lead (/leads/pool, /leads/zoom,
 * /leads/floating, /leads/dept) - MANAGER/SUPER_ADMIN only (route page guard).
 *
 * Điều kiện scope kho FIX CỨNG TRONG CODE (kho-config.ts baseParams), KHÔNG
 * nằm trên URL - URL sạch (/leads/pool). RSC merge baseParams khi fetch;
 * client components (polling/label-counts/export) nhận baseParams qua
 * KhoBaseParamsProvider và tự merge. User có gõ ?status=X trên URL cũng bị
 * mergeKhoParams ghi đè - không thoát được scope kho.
 *
 * Khác /leads/page.tsx: không fetch lockedLayout (manager không bị khóa bố cục),
 * filter bar dùng storageKey riêng per kho + ẩn filter status/assignment.
 */
export async function KhoLeadsPage({ kho, userRole, searchParams }: KhoLeadsPageProps) {
  const config = KHO_CONFIGS[kho];

  // Build query từ URL (filter phụ: nguồn/sản phẩm/nhãn/ngày...) + ép baseParams kho.
  const rawQp = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) value.forEach((v) => rawQp.append(key, v));
    else if (value !== undefined) rawQp.append(key, value);
  }
  rawQp.delete('cursor');
  const query = mergeKhoParams(rawQp, config.baseParams).toString();

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
    const [leadsRes, srcRes, grpRes, prodRes, usrRes, deptRes, teamRes, lblRes, fieldDefRes] = await Promise.all([
      serverFetch<ApiListResponse<LeadRecord>>(`/leads?${query}`),
      serverFetch<{ data: NamedEntity[] }>('/lead-sources').catch(() => ({ data: [] })),
      serverFetch<{ data: NamedEntity[] }>('/lead-groups').catch(() => ({ data: [] })),
      serverFetch<{ data: NamedEntity[] }>('/products/lookup').catch(() => ({ data: [] })),
      serverFetch<{ data: NamedEntity[] }>('/users/lookup').catch(() => ({ data: [] })),
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
      <LeadsBootstrapHydrator
        users={users}
        departments={departments}
        labels={labels}
        sources={sources}
        products={products}
      />

      <KhoBaseParamsProvider baseParams={config.baseParams}>
        <LeadFilterPendingProvider>
          {/* Tiêu đề kho - phân biệt nhanh đang đứng ở kho nào. */}
          <h1 className="ml-1 text-base font-bold text-slate-800">{config.title}</h1>

          <Suspense>
            <LeadListAdvancedFilterBar
              sources={sources} groups={groups} products={products} users={users}
              departments={departments} labels={labels}
              teams={teams} userRole={userRole}
              hideStatus={true}
              hideAssignment={false}
              storageKey={config.storageKey}
            />
          </Suspense>

          <LeadsTable
            leads={data}
            initialMeta={meta}
            userRole={userRole}
            users={users}
            labels={labels}
            sources={sources}
            products={products}
            customFieldDefs={customFieldDefs}
            distributeMode={config.distributeMode}
            departments={departments}
          />

          <PaginationControls total={meta?.total} page={meta?.page} limit={meta?.limit} totalPages={meta?.totalPages} />
        </LeadFilterPendingProvider>
      </KhoBaseParamsProvider>
    </LeadsLayoutShell>
  );
}
