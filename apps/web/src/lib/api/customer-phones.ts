import { api } from '@/lib/api-client';
import type { CustomerPhoneRecord } from '@/types/entities';

export interface AddCustomerPhonePayload {
  phone: string;
  label?: string;
  note?: string;
}

export type UpdateCustomerPhonePayload = Partial<AddCustomerPhonePayload>;

/** API client cho CRUD số điện thoại phụ của customer. */
export const customerPhonesApi = {
  list: (customerId: string) =>
    api.get<{ data: CustomerPhoneRecord[] }>(`/customers/${customerId}/phones`),

  add: (customerId: string, body: AddCustomerPhonePayload) =>
    api.post<{ data: CustomerPhoneRecord }>(`/customers/${customerId}/phones`, body),

  update: (customerId: string, phoneId: string, body: UpdateCustomerPhonePayload) =>
    api.patch<{ data: CustomerPhoneRecord }>(`/customers/${customerId}/phones/${phoneId}`, body),

  remove: (customerId: string, phoneId: string) =>
    api.delete<void>(`/customers/${customerId}/phones/${phoneId}`),
};
