import { api } from '@/lib/api-client';

/**
 * Tem phiên bản data tham chiếu dùng chung (lookup) lấy từ BE GET /reference-data/versions.
 * Dùng để tự làm mới cache localStorage ngay khi có ai CRUD, không phải chờ TTL.
 *
 * - Gom mọi lần hỏi trong cùng 1 lúc (mở form) vào 1 request (in-flight dedup).
 * - Giữ kết quả tươi 10s để tránh spam endpoint khi nhiều getter chạy liên tiếp.
 * - Lỗi mạng -> trả null; caller bỏ qua check tem, fallback TTL như cũ.
 */

export type ReferenceEntity = 'products' | 'leadSources' | 'leadGroups' | 'users' | 'departments' | 'labels' | 'leadFieldDefinitions';
type ReferenceVersions = Record<ReferenceEntity, string>;

const FRESH_MS = 10_000;
let inflight: Promise<ReferenceVersions | null> | null = null;
let cached: ReferenceVersions | null = null;
let cachedAt = 0;

export async function getReferenceVersions(): Promise<ReferenceVersions | null> {
  if (cached && Date.now() - cachedAt < FRESH_MS) return cached;
  if (inflight) return inflight;
  inflight = api
    .get<{ data: ReferenceVersions }>('/reference-data/versions')
    .then((res) => {
      cached = res.data ?? null;
      cachedAt = Date.now();
      return cached;
    })
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Lấy tem của 1 entity. Trả null nếu endpoint lỗi -> caller fallback (bỏ qua check tem). */
export async function getReferenceVersion(entity: ReferenceEntity): Promise<string | null> {
  const versions = await getReferenceVersions();
  return versions ? versions[entity] ?? null : null;
}
