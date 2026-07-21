import { api } from '@/lib/api-client';

export interface SipConfigRecord {
  id: string;
  sipRealm: string;
  sipUser: string;
  sipPassword: string;
  isActive: boolean;
  updatedAt: string;
}

export interface SipCredentials {
  sipRealm: string;
  sipUser: string;
  sipPassword: string;
}

export interface UpsertSipConfigPayload {
  sipRealm: string;
  sipUser: string;
  sipPassword: string;
}

export const sipConfigApi = {
  get: (userId: string) =>
    api.get<{ data: SipConfigRecord | null }>(`/users/${userId}/sip-config`),

  upsert: (userId: string, body: UpsertSipConfigPayload) =>
    api.put<{ data: SipConfigRecord }>(`/users/${userId}/sip-config`, body),

  remove: (userId: string) =>
    api.delete<{ message: string }>(`/users/${userId}/sip-config`),

  getMyCredentials: () =>
    api.get<{ data: SipCredentials | null }>('/users/me/sip-credentials'),
};
