import { api } from '../api-client';
import type { ApiResponse, AuditLogResponse, CronRunResponse } from '@crm/types';

interface PaginatedList<T> {
  data: T[];
  meta: { nextCursor?: string };
}

export interface AuditLogQuery {
  userId?: string;
  departmentId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  method?: string;
  statusCode?: string;
  ipAddress?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export interface CronRunQuery {
  jobName?: string;
  status?: 'RUNNING' | 'SUCCESS' | 'FAILED';
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

function buildQuery(params: Record<string, unknown>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export const traceApi = {
  listAuditLogs: (q: AuditLogQuery = {}) =>
    api.get<PaginatedList<AuditLogResponse>>(`/audit-logs${buildQuery({ ...q })}`),

  getAuditLog: (id: string) =>
    api.get<ApiResponse<AuditLogResponse>>(`/audit-logs/${id}`),

  listAuditLogActions: () =>
    api.get<ApiResponse<string[]>>('/audit-logs/actions'),

  listCronRuns: (q: CronRunQuery = {}) =>
    api.get<PaginatedList<CronRunResponse>>(`/cron-runs${buildQuery({ ...q })}`),

  getCronRun: (id: string) =>
    api.get<ApiResponse<CronRunResponse>>(`/cron-runs/${id}`),

  listCronJobs: () =>
    api.get<ApiResponse<string[]>>('/cron-runs/jobs'),
};
