/**
 * Substring matched against object keys (case-insensitive). Any key containing
 * one of these tokens has its value replaced with [REDACTED] before insert.
 *
 * Substring (not exact) so `currentPassword`, `mySecret`, `apiSecretKey` all
 * match without enumerating every variant.
 */
export const SENSITIVE_KEY_TOKENS = [
  'password',
  'token',
  'secret',
  'apikey',
  'pin',
  'otp',
  'authorization',
  'cookie',
];

/**
 * Request paths skipped by AuditLogInterceptor.
 * Match is `startsWith` after normalizing leading slash.
 *
 * Why each entry:
 *   - /health        : noisy uptime checks, no business value
 *   - /docs|swagger  : documentation endpoints
 *   - /audit-logs    : avoid recursion (querying audit creates audit row)
 *   - /cron-runs     : same - admin viewing trace shouldn't fill audit_logs
 *   - /webhooks/*    : webhook bodies often carry vendor secrets
 */
export const SKIP_PATH_PREFIXES = [
  '/health',
  '/api/v1/health',
  '/docs',
  '/api-docs',
  '/api/v1/audit-logs',
  '/api/v1/cron-runs',
  '/api/v1/webhooks',
  // Defensive: in case the global prefix has been stripped before req.path is read
  '/audit-logs',
  '/cron-runs',
  '/webhooks',
];

export const SKIP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Truncate any string value larger than this in metadata before insert. */
export const MAX_FIELD_BYTES = 4096;

/** Stop recursing into nested objects past this depth. */
export const MAX_DEPTH = 5;

export const REDACTED = '[REDACTED]';

export const AUDIT_STATUS = {
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;
