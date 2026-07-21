/**
 * Cache `/lead-sources` response trong localStorage 24h.
 * Sources thường <100 entries (vài KB) - dưới quota 5MB nhiều lần.
 * Clear khi logout (auth-provider.tsx) để user kế tiếp trên thiết bị shared không thấy stale data.
 *
 * try/catch tất cả localStorage access - incognito strict mode (Firefox) có thể throw.
 */

const KEY = 'lead-sources-cache';
const TTL_MS = 24 * 60 * 60 * 1000;
// Bump khi cau truc/ID nguon thay doi (lead_sources tach thanh sources + groups,
// ID nguon doi nen cache cu giu ID sai -> loc lead ra 0 ket qua). Tang so nay
// de moi client tu loai cache cu o lan tai trang ke tiep.
// VERSION 3: them serverVersion (tem phien ban tu BE) -> shape cu < 3 bi reject, tu fetch lai.
const VERSION = 3;

export interface LeadSourceCached {
  id: string;
  name: string;
}

interface CacheShape {
  version: number;
  ts: number;
  // Tem phiên bản BE tại lúc ghi cache. So với GET /reference-data/versions để biết stale.
  serverVersion: string;
  data: LeadSourceCached[];
}

export interface SourceCacheEntry {
  data: LeadSourceCached[];
  serverVersion: string;
}

export function readSourceCache(): SourceCacheEntry | null {
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

export function writeSourceCache(data: LeadSourceCached[], serverVersion: string): void {
  try {
    const payload: CacheShape = { version: VERSION, ts: Date.now(), serverVersion, data };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // quota exceeded / disabled - ignore (next mount sẽ fetch lại từ API)
  }
}

export function clearSourceCache(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
