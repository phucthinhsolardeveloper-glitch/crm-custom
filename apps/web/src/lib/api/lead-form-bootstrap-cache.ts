import { api } from '@/lib/api-client';
import { getCached, invalidateCached, setCached } from '@/lib/storage/local-storage-cache';
import { getReferenceVersion, getReferenceVersions } from '@/lib/api/reference-versions';
import type { NamedEntity, LabelEntity } from '@/types/entities';

/** Nhóm nguồn kèm sourceId để lọc theo Nguồn cha trong LeadForm. */
export type LeadGroupOption = NamedEntity & { sourceId: string };

/**
 * Cache cho reference data dùng chung trong lead screens:
 * - sources + products (LeadForm)
 * - users + departments + labels (LeadQuickActionsPanel)
 *
 * - Persist localStorage, TTL 4h (data đổi rất hiếm - hourly safe margin)
 * - Cross-tab share + tồn tại qua page refresh
 * - Promise dedup: nhiều caller song song chỉ trigger 1 request
 * - Pre-hydration: server component đã fetch xong rồi pass data sang
 *   <LeadsBootstrapHydrator> client component, hydrator gọi
 *   `setLeadsBootstrap` để write vào cache → giảm round-trip API client-side.
 *
 * Khi user CRUD trong Settings -> gọi invalidateLeadFormBootstrap()
 * để force-refresh data ngay.
 */

// _v2: doi key sau khi lead_sources tach thanh sources + groups (ID nguon thay doi).
// Doi ten key lam cache cu khong bao gio doc lai duoc -> client tu fetch data moi.
const SOURCES_KEY = 'crm_cache_lead_sources_v2';
const GROUPS_KEY = 'crm_cache_lead_groups_v2';
const PRODUCTS_KEY = 'crm_cache_products_v1';
const USERS_KEY = 'crm_cache_users_v1';
const DEPARTMENTS_KEY = 'crm_cache_departments_v1';
const LABELS_KEY = 'crm_cache_labels_v1';
const LEAD_FIELD_DEFS_KEY = 'crm_cache_lead_field_definitions_v1';
// 4h = balance giữa request reduction và freshness. User Settings page có nút "Làm mới cache"
// để force-invalidate ngay khi cần. Auto-invalidate cũng chạy sau mỗi CRUD source/product.
const TTL_4H = 4 * 60 * 60 * 1000;

function normalize(list: { id: string | number; name: string }[]): NamedEntity[] {
  return list.map((x) => ({ id: String(x.id), name: x.name }));
}

export async function getLeadSources(): Promise<NamedEntity[]> {
  const version = await getReferenceVersion('leadSources');
  return getCached(
    SOURCES_KEY,
    async () => {
      const res = await api.get<{ data: NamedEntity[] }>('/lead-sources');
      return normalize(res.data || []);
    },
    TTL_4H,
    version ?? undefined,
  );
}

export async function getLeadGroups(): Promise<LeadGroupOption[]> {
  const version = await getReferenceVersion('leadGroups');
  return getCached(
    GROUPS_KEY,
    async () => {
      const res = await api.get<{ data: { id: string | number; name: string; sourceId: string | number }[] }>('/lead-groups');
      return (res.data || []).map((g) => ({ id: String(g.id), name: g.name, sourceId: String(g.sourceId) }));
    },
    TTL_4H,
    version ?? undefined,
  );
}

export async function getProducts(): Promise<NamedEntity[]> {
  const version = await getReferenceVersion('products');
  return getCached(
    PRODUCTS_KEY,
    async () => {
      const res = await api.get<{ data: NamedEntity[] }>('/products');
      return normalize(res.data || []);
    },
    TTL_4H,
    version ?? undefined,
  );
}

/** Định nghĩa trường tùy chỉnh lead (active only) - render form fields + cột bảng động. */
export type LeadFieldDefinitionOption = {
  id: string;
  key: string;
  label: string;
  type: string;
  sortOrder: number;
};

export async function getLeadFieldDefinitionsCached(): Promise<LeadFieldDefinitionOption[]> {
  const version = await getReferenceVersion('leadFieldDefinitions');
  return getCached(
    LEAD_FIELD_DEFS_KEY,
    async () => {
      const res = await api.get<{ data: (LeadFieldDefinitionOption & { id: string | number })[] }>(
        '/lead-field-definitions',
      );
      return (res.data || []).map((d) => ({
        id: String(d.id), key: d.key, label: d.label, type: d.type, sortOrder: d.sortOrder,
      }));
    },
    TTL_4H,
    version ?? undefined,
  );
}

export async function getUsersCached(): Promise<NamedEntity[]> {
  const version = await getReferenceVersion('users');
  return getCached(
    USERS_KEY,
    async () => {
      const res = await api.get<{ data: NamedEntity[] }>('/users');
      return normalize(res.data || []);
    },
    TTL_4H,
    version ?? undefined,
  );
}

export async function getDepartmentsCached(): Promise<NamedEntity[]> {
  const version = await getReferenceVersion('departments');
  return getCached(
    DEPARTMENTS_KEY,
    async () => {
      const res = await api.get<{ data: NamedEntity[] }>('/departments');
      return normalize(res.data || []);
    },
    TTL_4H,
    version ?? undefined,
  );
}

export async function getLabelsCached(): Promise<LabelEntity[]> {
  const version = await getReferenceVersion('labels');
  return getCached(
    LABELS_KEY,
    async () => {
      const res = await api.get<{ data: LabelEntity[] }>('/labels');
      return res.data || [];
    },
    TTL_4H,
    version ?? undefined,
  );
}

/**
 * Hydrate cache từ server-rendered data (gọi từ client hydrator component
 * khi page load). Bỏ qua key nào chưa có data trong props.
 *
 * Gắn kèm tem phiên bản hiện tại để data hydrate được coi là "tươi" đúng tem ->
 * lần getCached kế tiếp khớp tem (không phải refetch thừa). Nếu lấy tem lỗi,
 * stamp undefined -> vẫn dùng được theo TTL như cũ.
 */
export async function setLeadsBootstrap(data: {
  users?: NamedEntity[];
  departments?: NamedEntity[];
  labels?: LabelEntity[];
  sources?: NamedEntity[];
  groups?: LeadGroupOption[];
  products?: NamedEntity[];
}) {
  const v = await getReferenceVersions();
  if (data.users) setCached(USERS_KEY, data.users, TTL_4H, v?.users);
  if (data.departments) setCached(DEPARTMENTS_KEY, data.departments, TTL_4H, v?.departments);
  if (data.labels) setCached(LABELS_KEY, data.labels, TTL_4H, v?.labels);
  if (data.sources) setCached(SOURCES_KEY, data.sources, TTL_4H, v?.leadSources);
  if (data.groups) setCached(GROUPS_KEY, data.groups, TTL_4H, v?.leadGroups);
  if (data.products) setCached(PRODUCTS_KEY, data.products, TTL_4H, v?.products);
}

/** Reset cache - gọi sau khi user CRUD source/group/product trong Settings. */
export function invalidateLeadFormBootstrap() {
  invalidateCached(SOURCES_KEY);
  invalidateCached(GROUPS_KEY);
  invalidateCached(PRODUCTS_KEY);
  invalidateCached(USERS_KEY);
  invalidateCached(DEPARTMENTS_KEY);
  invalidateCached(LABELS_KEY);
}
