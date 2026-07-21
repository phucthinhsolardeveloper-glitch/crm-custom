/**
 * Cache `/products` response trong localStorage 24h.
 * Products thường <500 entries (vài KB - vài chục KB) - vẫn dưới quota 5MB.
 * Clear khi logout (auth-provider.tsx) để user kế tiếp trên thiết bị shared không thấy stale data.
 *
 * Pattern y hệt source-cache.ts (cùng TTL 24h, cùng VERSION shape) - tách file để
 * 1 trong 2 cache invalidate không kéo theo cái còn lại.
 */

const KEY = 'products-cache';
const TTL_MS = 24 * 60 * 60 * 1000;
// VERSION 2: thêm price/vatRate. VERSION 3: thêm serverVersion (tem phiên bản từ BE).
// VERSION 4: thêm isCombo. VERSION 5: thêm comboItems (con của combo).
// Cache shape cũ (version < 5) bị reject -> tự fetch lại từ API.
const VERSION = 5;

export interface ProductCached {
  id: string;
  name: string;
  price: number;
  vatRate: number;
  /** SP gom nhiều SP con - khi tạo đơn xổ danh sách con cho user tích chọn. */
  isCombo?: boolean;
  /** Danh sách SP con của combo (đã phẳng hoá từ comboItems.child). Rỗng nếu không phải combo. */
  comboItems?: { id: string; name: string; price: number }[];
}

interface CacheShape {
  version: number;
  ts: number;
  // Tem phiên bản BE tại thời điểm ghi cache. So với GET /products/cache-version để biết stale.
  serverVersion: string;
  data: ProductCached[];
}

export interface ProductCacheEntry {
  data: ProductCached[];
  serverVersion: string;
}

export function readProductCache(): ProductCacheEntry | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheShape;
    if (parsed.version !== VERSION) return null;
    if (Date.now() - parsed.ts > TTL_MS) return null;
    return { data: parsed.data, serverVersion: parsed.serverVersion };
  } catch {
    return null;
  }
}

export function writeProductCache(data: ProductCached[], serverVersion: string): void {
  try {
    const payload: CacheShape = { version: VERSION, ts: Date.now(), serverVersion, data };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // quota exceeded / disabled - ignore (next mount sẽ fetch lại từ API)
  }
}

export function clearProductCache(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
