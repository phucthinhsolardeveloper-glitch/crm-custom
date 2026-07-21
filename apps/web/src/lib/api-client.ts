/**
 * API client for NestJS backend.
 * Client-side calls go through Next.js proxy (/api/proxy/*) to solve cross-origin cookie auth.
 * The proxy reads httpOnly access_token cookie and forwards as Bearer token to NestJS.
 */

// Browser -> qua /api/proxy. Server-side -> ưu tiên INTERNAL_API_URL (localhost) để skip Cloudflare round-trip.
const API_BASE_URL = typeof window !== 'undefined'
  ? '/api/proxy'
  : (process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010/api/v1');

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;

  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
    ...rest,
  });

  if (!res.ok) {
    // Session expired - redirect to login
    if (res.status === 401 && typeof window !== 'undefined') {
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      // Return a never-resolving promise to prevent downstream code from running
      return new Promise<never>(() => {});
    }
    const error = await res.json().catch(() => ({ message: 'Lỗi không xác định' }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  get: <T>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'POST', body }),

  patch: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'PATCH', body }),

  put: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'PUT', body }),

  delete: <T>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),
};
