import { api } from '@/lib/api-client';

/**
 * Upload avatar customer qua proxy (cùng origin → cookie auth tự gửi).
 * Trả về { avatarUrl } - frontend tự refresh customer record sau khi resolve.
 */
export async function uploadCustomerAvatar(
  customerId: string,
  file: File,
): Promise<{ avatarUrl: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`/api/proxy/customers/${customerId}/avatar`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
    throw new Error(body.message || 'Upload thất bại');
  }
  const body = await res.json();
  return body.data ?? body;
}

export async function deleteCustomerAvatar(customerId: string): Promise<void> {
  await api.delete(`/customers/${customerId}/avatar`);
}
