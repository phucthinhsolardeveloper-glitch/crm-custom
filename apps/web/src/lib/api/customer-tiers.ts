import { api } from '@/lib/api-client';
import type { CustomerTier } from '@/types/entities';

export interface CustomerTierInput {
  name?: string;
  slug?: string;
  minSpending?: number | string;
  color?: string;
  emoji?: string | null;
  iconKey?: string | null;
  sortOrder?: number;
  benefits?: string | null;
  isActive?: boolean;
}

export async function listCustomerTiers(): Promise<CustomerTier[]> {
  const res = await api.get<{ data: CustomerTier[] }>('/customer-tiers');
  return res.data;
}

export async function getCustomerTier(id: string): Promise<CustomerTier> {
  const res = await api.get<{ data: CustomerTier }>(`/customer-tiers/${id}`);
  return res.data;
}

export async function createCustomerTier(input: CustomerTierInput): Promise<CustomerTier> {
  const res = await api.post<{ data: CustomerTier }>('/customer-tiers', input);
  return res.data;
}

export async function updateCustomerTier(
  id: string,
  input: CustomerTierInput,
): Promise<{ data: CustomerTier; recalcTriggered: boolean }> {
  return api.patch<{ data: CustomerTier; recalcTriggered: boolean }>(`/customer-tiers/${id}`, input);
}

export async function deactivateCustomerTier(id: string): Promise<void> {
  await api.delete(`/customer-tiers/${id}`);
}

export async function reorderCustomerTiers(
  updates: Array<{ id: string; sortOrder: number }>,
): Promise<{ updated: number }> {
  const res = await api.patch<{ data: { updated: number } }>('/customer-tiers/reorder/batch', { updates });
  return res.data;
}

export async function triggerBulkRecalc(): Promise<{ processed: number }> {
  const res = await api.post<{ data: { processed: number } }>('/customer-tiers/recalc-all', {});
  return res.data;
}
