// Shared DTO types for user_phones module (super_admin assigns phone numbers to sales).
import type { BigIntString } from './index';

export interface UserPhoneDto {
  id: BigIntString;
  phone: string;
  userId: BigIntString;
  user?: {
    id: BigIntString;
    name: string;
    email: string;
    departmentName: string | null;
  } | null;
  assignedAt: string;
  assignedBy: BigIntString;
  assigner?: { id: BigIntString; name: string } | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserPhoneHistoryDto {
  id: BigIntString;
  phone: string;
  userId: BigIntString;
  user?: { id: BigIntString; name: string } | null;
  assignedAt: string;
  releasedAt: string;
  reason: 'TRANSFERRED' | 'DELETED' | 'REASSIGNED';
  changedBy: BigIntString;
  changer?: { id: BigIntString; name: string } | null;
  note: string | null;
  createdAt: string;
}

export interface BulkUserPhoneItemResult {
  phone: string;
  userId: BigIntString;
  status: 'CREATED' | 'SKIPPED' | 'FAILED';
  reason?: string;
  id?: BigIntString;
}

export interface BulkUserPhoneResult {
  created: BulkUserPhoneItemResult[];
  skipped: BulkUserPhoneItemResult[];
  failed: BulkUserPhoneItemResult[];
}
