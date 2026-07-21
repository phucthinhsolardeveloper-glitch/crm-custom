/**
 * Cấu hình 4 trang kho lead dedicated cho MANAGER/SUPER_ADMIN.
 *
 * Scope kho FIX CỨNG TRONG CODE, KHÔNG nằm trên URL - URL sạch (/leads/pool).
 * baseParams được inject vào mọi request API qua:
 * - RSC fetch: kho-page-content.tsx merge trực tiếp.
 * - Client components (polling 30s, label counts, export CSV): đọc qua
 *   KhoBaseParamsProvider (kho-base-params-context.tsx) rồi merge khi build query.
 *
 * Mapping baseParams -> backend (applyDynamicFilters, leads.service.ts):
 * - pool:     status IN (POOL, ASSIGNED, IN_PROGRESS, CONVERTED, LOST)
 *             -> mọi lead TRỪ ZOOM và FLOATING 
 * - zoom:     status=ZOOM     -> zoom-only view
 * - floating: status=FLOATING -> kho thả nổi
 *
 * Kho Phòng Ban đã bỏ (2026-07-08): lọc phòng làm ngay trên Kho Mới / trang
 * Tất cả qua filter departmentId - không cần trang riêng.
 */

export type KhoKey = 'pool' | 'zoom' | 'floating';

export interface KhoConfig {
  /** Tiêu đề hiển thị trên trang kho. */
  title: string;
  /** Kho có nút "AI Chia số" (distribute endpoint chỉ có cho pool/zoom). */
  distributeMode?: 'new' | 'zoom';
  /** Điều kiện scope kho - fix cứng trong code, inject vào mọi request API.
   *  Mảng = param multi-value (?status=A&status=B - BE nhận IN list). */
  baseParams: Record<string, string | string[]>;
  /** localStorage key riêng cho filter bar - tránh lẫn với crm_lead_filters của /leads. */
  storageKey: string;
}

export const KHO_CONFIGS: Record<KhoKey, KhoConfig> = {
  pool: {
    title: 'Kho Mới',
    distributeMode: 'new',
    baseParams: { status: ['POOL', 'ASSIGNED', 'IN_PROGRESS', 'CONVERTED', 'LOST'] },
    storageKey: 'crm_lead_filters_kho_pool',
  },
  zoom: {
    title: 'Kho Zoom',
    distributeMode: 'zoom',
    baseParams: { status: 'ZOOM' },
    storageKey: 'crm_lead_filters_kho_zoom',
  },
  floating: {
    title: 'Kho Thả Nổi',
    baseParams: { status: 'FLOATING' },
    storageKey: 'crm_lead_filters_kho_floating',
  },
};

/**
 * Merge điều kiện kho vào query params hiện tại: xóa status user-supplied
 * (URL không được ghi đè scope kho) rồi ép baseParams. Giữ lại assignment
 * (đã phân/chưa phân) vì đây là filter phụ hợp lệ, không đụng scope kho.
 * Không có baseParams (trang /leads unified) -> trả nguyên bản.
 */
export function mergeKhoParams(
  current: URLSearchParams,
  baseParams: Record<string, string | string[]>,
): URLSearchParams {
  const qp = new URLSearchParams(current);
  if (Object.keys(baseParams).length > 0) {
    qp.delete('status');
    for (const [k, v] of Object.entries(baseParams)) {
      if (Array.isArray(v)) v.forEach((item) => qp.append(k, item));
      else qp.set(k, v);
    }
  }
  return qp;
}
