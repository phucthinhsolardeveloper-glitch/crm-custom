import { api } from '@/lib/api-client';
import type { CustomerPhoneRecord } from '@/types/entities';

export interface AddLeadPhonePayload {
  phone: string;
  label?: string;
  note?: string;
}

export type UpdateLeadPhonePayload = Partial<AddLeadPhonePayload>;

/**
 * API client cho CRUD SĐT phụ trên hồ sơ lead.
 * Khác customer-phones API: endpoint mới chấp nhận MỌI role có access tới lead,
 * và tự động tạo customer shadow khi cần thiết (mọi response thống nhất shape).
 */
export const leadSecondaryPhonesApi = {
  list: (leadId: string) =>
    api.get<{ data: CustomerPhoneRecord[] }>(`/leads/${leadId}/phones`),

  add: (leadId: string, body: AddLeadPhonePayload) =>
    api.post<{ data: CustomerPhoneRecord }>(`/leads/${leadId}/phones`, body),

  update: (leadId: string, phoneId: string, body: UpdateLeadPhonePayload) =>
    api.patch<{ data: CustomerPhoneRecord }>(`/leads/${leadId}/phones/${phoneId}`, body),

  remove: (leadId: string, phoneId: string) =>
    api.delete<void>(`/leads/${leadId}/phones/${phoneId}`),
};
