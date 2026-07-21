// Shared types, DTOs, and interfaces for CRM V4

export type BigIntString = string;

export interface ApiResponse<T> {
  data: T;
  meta?: {
    nextCursor?: string;
  };
}

export interface ApiErrorResponse {
  statusCode: number;
  message: string;
  error: string;
}

// ── Trace (audit_logs + cron_runs) ───────────────────────────────────────────

export interface AuditLogResponse {
  id: BigIntString;
  userId: BigIntString | null;
  user: {
    id: BigIntString;
    name: string;
    email: string;
    departmentName: string | null;
  } | null;
  action: string;
  entityType: string | null;
  entityId: BigIntString | null;
  ipAddress: string | null;
  userAgent: string | null;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  metadata: unknown;
  createdAt: string;
}

export interface CronRunResponse {
  id: BigIntString;
  jobName: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  affected: number;
  errorMsg: string | null;
  metadata: unknown;
  durationMs: number | null;
}

// ── Leads ────────────────────────────────────────────────────────────────────

/** Summary của một note (activity type=NOTE) gắn trên lead - dùng cho cột Note ở bảng /leads. */
export interface LeadNoteSummary {
  id: BigIntString;
  content: string;
  createdAt: string;
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export interface TaskReminderDto {
  remindAt: string; // ISO8601
  label?: string;
}

export interface TaskReminder {
  id: BigIntString;
  taskId: BigIntString;
  remindAt: string;
  label: string | null;
  remindedAt: string | null;
  createdAt: string;
}

// ── User Phone Assignment ────────────────────────────────────────────────────

export type {
  UserPhoneDto,
  UserPhoneHistoryDto,
  BulkUserPhoneItemResult,
  BulkUserPhoneResult,
} from './user-phone.types';

// ── Dashboard Reports ────────────────────────────────────────────────────────

export type {
  EmployeeScoreRaw,
  EmployeeCallReportRow,
  TopLabel,
  SalesBreakdownRow,
  EmployeeSalesBreakdownResponse,
  DrillDownCustomerLabel,
  DrillDownCustomerItem,
  DrillDownCustomersResponse,
  TopNItem,
  TopNResponse,
  DailyByGroupResponse,
  DailyByGroupSeries,
  SankeyLevel,
  SankeyNode,
  SankeyLink,
  SankeyRevenueResponse,
} from './dashboard.types';
