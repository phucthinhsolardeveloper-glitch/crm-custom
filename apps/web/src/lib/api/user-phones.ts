import { api } from '@/lib/api-client';
import type {
  UserPhoneRecord,
  UserPhoneHistoryRecord,
  BulkUserPhoneResponse,
  ApiListResponse,
} from '@/types/entities';

export interface CreateUserPhonePayload {
  phone: string;
  userId: string;
  note?: string;
}

export interface TransferUserPhonePayload {
  newUserId: string;
  note?: string;
}

export interface BulkCreateUserPhonePayload {
  items: CreateUserPhonePayload[];
}

/** API client cho admin/user-phones endpoints. */
export const userPhonesApi = {
  list: (query: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v != null && v !== '') params.set(k, v);
    });
    const qs = params.toString();
    return api.get<ApiListResponse<UserPhoneRecord>>(`/admin/user-phones${qs ? '?' + qs : ''}`);
  },

  listByUser: (userId: string) =>
    api.get<{ data: UserPhoneRecord[] }>(`/admin/user-phones/by-user/${userId}`),

  history: (id: string) =>
    api.get<{ data: UserPhoneHistoryRecord[] }>(`/admin/user-phones/${id}/history`),

  create: (body: CreateUserPhonePayload) =>
    api.post<{ data: UserPhoneRecord }>('/admin/user-phones', body),

  bulkCreate: (body: BulkCreateUserPhonePayload) =>
    api.post<{ data: BulkUserPhoneResponse }>('/admin/user-phones/bulk', body),

  transfer: (id: string, body: TransferUserPhonePayload) =>
    api.patch<{ data: UserPhoneRecord }>(`/admin/user-phones/${id}/transfer`, body),

  remove: (id: string) =>
    api.delete<{ data: { message: string } }>(`/admin/user-phones/${id}`),
};
