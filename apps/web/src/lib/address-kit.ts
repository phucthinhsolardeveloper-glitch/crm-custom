// Dữ liệu hành chính Việt Nam (mô hình 2 cấp: Tỉnh/Thành -> Phường/Xã).
// Gọi qua route proxy nội bộ /api/address/* (API gốc addresskit không trả CORS header
// nên không fetch trực tiếp từ trình duyệt được - xem app/api/address/*).
// Tỉnh/phường rất ít đổi nên cache thêm vào localStorage 1 năm sau lần fetch đầu tiên.
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export interface AddressUnit {
  code: string;
  name: string;
}

interface CacheEntry<T> {
  t: number; // timestamp ghi cache
  v: T;
}

function readCache<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - parsed.t > ONE_YEAR_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed.v;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, v: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ t: Date.now(), v } satisfies CacheEntry<T>));
  } catch {
    // localStorage đầy/bị chặn -> bỏ qua, vẫn chạy bằng network.
  }
}

/** Danh sách tỉnh/thành. Cache 1 năm ở localStorage. */
export async function fetchProvinces(): Promise<AddressUnit[]> {
  const key = 'addresskit:v1:provinces';
  const cached = readCache<AddressUnit[]>(key);
  if (cached) return cached;

  const res = await fetch('/api/address/provinces');
  if (!res.ok) throw new Error('Không tải được danh sách tỉnh/thành');
  const json = await res.json();
  const list: AddressUnit[] = json.provinces ?? [];
  writeCache(key, list);
  return list;
}

/** Danh sách phường/xã theo mã tỉnh. Cache 1 năm theo từng tỉnh. */
export async function fetchWards(provinceCode: string): Promise<AddressUnit[]> {
  const key = `addresskit:v1:wards:${provinceCode}`;
  const cached = readCache<AddressUnit[]>(key);
  if (cached) return cached;

  const res = await fetch(`/api/address/wards?provinceCode=${encodeURIComponent(provinceCode)}`);
  if (!res.ok) throw new Error('Không tải được danh sách phường/xã');
  const json = await res.json();
  const list: AddressUnit[] = json.wards ?? [];
  writeCache(key, list);
  return list;
}

/** Ghép địa chỉ hiển thị: "Số nhà/Đường, Phường/Xã, Tỉnh/Thành". Bỏ phần rỗng. */
export function formatAddress(parts: {
  street?: string | null;
  wardName?: string | null;
  provinceName?: string | null;
}): string {
  return [parts.street, parts.wardName, parts.provinceName]
    .map((s) => (s ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(', ');
}
