/**
 * Lark Base sync constants.
 *
 * Queue name namespaced under `lark-` so dashboards group by feature.
 * Job names are stable strings so processors can switch on them.
 */
export const LARK_SYNC_QUEUE = 'lark-sync';

export const LARK_JOB_SYNC_PAYMENT = 'sync-payment';

/** Job day 1 dong hoan tien (dien tay) sang Lark. */
export const LARK_JOB_SYNC_REFUND = 'sync-refund';

/** Job danh dau record Lark cua payment da bi xoa (giu dong, doi status). */
export const LARK_JOB_MARK_DELETED = 'mark-payment-deleted';

/**
 * Nhan status day len Lark khi payment bi xoa. Phai la 1 option CO SAN cua cot
 * SingleSelect tren Lark, neu khong update se that bai. Doi gia tri o day neu
 * Lark dung ten option khac.
 */
export const LARK_DELETED_STATUS_LABEL = 'Đã xoá';

/**
 * Retry policy when Lark API errors out.
 * Exponential: 1s, 5s, 25s, 125s, 625s (~10 min). Total budget ~13 min.
 */
export const LARK_RETRY_ATTEMPTS = 5;
export const LARK_RETRY_BACKOFF_MS = 1000;

/** Lark Open Platform endpoints (larksuite = international tenant). */
export const LARK_AUTH_URL =
  'https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal';
export const LARK_API_BASE = 'https://open.larksuite.com/open-apis';

/** Redis cache key for tenant_access_token (shared across all bases of tenant). */
export const LARK_TOKEN_CACHE_KEY = 'lark:tenant_access_token';

/** Cache key prefix for LarkSyncMapping lookups by mapping id. */
export const LARK_MAPPING_CACHE_PREFIX = 'lark:mapping:';
export const LARK_MAPPING_CACHE_TTL = 300; // seconds

/**
 * Lark API error codes signaling an expired/invalid tenant token.
 * On these codes the client drops the cached token and throws for retry.
 */
export const LARK_TOKEN_EXPIRED_CODES = [99991663, 99991661, 99991668];
