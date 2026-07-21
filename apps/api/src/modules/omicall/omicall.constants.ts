/**
 * OmiCall integration constants.
 *
 * Queue name namespaced under `omicall-` so dashboards group by feature.
 * Job names are stable strings so processors can switch on them.
 */
export const OMICALL_SYNC_QUEUE = 'omicall-sync';

export const OMICALL_JOB_SYNC_LEAD_OWNER = 'sync-lead-owner';

/**
 * Retry policy when OmiCall API errors out.
 * Exponential: 1s, 5s, 25s, 125s, 625s (~10 min). Total budget ~13 min.
 */
export const OMICALL_RETRY_ATTEMPTS = 5;
export const OMICALL_RETRY_BACKOFF_MS = 1000;
