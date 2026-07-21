import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js 16 "proxy" (tên cũ: middleware). Đây là file ACTIVE - Next 16 chỉ đọc proxy.ts,
 * không còn đọc middleware.ts. Chạy server-side (Node runtime) trên mọi page navigate.
 *
 * Gộp 2 nhiệm vụ:
 *  1. Auto-refresh: khi access token sắp/đã hết hạn mà còn refresh token -> gọi BE /auth/refresh,
 *     set cookie mới vào response. Tránh user bị logout sau 1h (access token TTL = 1h).
 *  2. Guard: route cần auth mà không có token hợp lệ (kể cả sau khi thử refresh) -> redirect /login.
 *
 * Why proxy (not server-side refresh trong page.tsx): RSC KHÔNG set cookie được - chỉ
 * Route Handler / proxy mới set được. proxy là điểm sớm nhất intercept request + set cookie.
 */

// Ưu tiên INTERNAL_API_URL (localhost) để gọi /auth/refresh trực tiếp NestJS, skip Cloudflare
// round-trip - quan trọng vì proxy chạy trên MỌI page navigate.
const API_BASE = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010/api/v1';

/** Refresh khi access token còn dưới 5 phút tới exp - đủ buffer để page request không kịp expire. */
const REFRESH_THRESHOLD_SECONDS = 5 * 60;
const ACCESS_COOKIE_MAX_AGE = 60 * 60;
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

/** Public routes không cần auth. */
const PUBLIC_PATHS = ['/', '/login'];

/**
 * Decode JWT payload (phần giữa) để lấy `exp`. KHÔNG verify signature - proxy chỉ dùng exp
 * để quyết định refresh/redirect; BE vẫn verify signature ở mọi request.
 * Trả null nếu JWT shape sai.
 */
function decodeJwtExp(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // base64url -> base64 (replace - _ và pad =).
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    const payload = JSON.parse(atob(b64)) as { exp?: number; sub?: string };
    if (typeof payload.exp !== 'number' || !payload.sub) return null;
    return payload.exp;
  } catch {
    return null;
  }
}

/** Token còn hạn (>30s buffer) hay chưa. */
function isTokenValid(token: string | undefined): boolean {
  if (!token) return false;
  const exp = decodeJwtExp(token);
  if (exp === null) return false;
  return exp * 1000 > Date.now() - 30_000;
}

/** Gắn cookie token mới vào response (sau refresh thành công). */
function setAuthCookies(response: NextResponse, accessToken: string, refreshToken: string) {
  const isProd = process.env.NODE_ENV === 'production';
  response.cookies.set('access_token', accessToken, {
    httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', maxAge: ACCESS_COOKIE_MAX_AGE,
  });
  response.cookies.set('refresh_token', refreshToken, {
    httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', maxAge: REFRESH_COOKIE_MAX_AGE,
  });
}

/** Xoá cookie (refresh fail / session hết hạn). */
function clearAuthCookies(response: NextResponse) {
  response.cookies.set('access_token', '', { path: '/', maxAge: 0 });
  response.cookies.set('refresh_token', '', { path: '/', maxAge: 0 });
}

interface RefreshOutcome {
  /** Token mới nếu refresh thành công. */
  accessToken?: string;
  refreshToken?: string;
  /** true nếu refresh đã chạy và thất bại thật sự (cần clear cookie). */
  failed?: boolean;
}

/** Gọi BE refresh nếu cần. Trả token mới (success) / failed (clear cookie) / rỗng (không cần refresh). */
async function maybeRefresh(accessToken: string | undefined, refreshToken: string): Promise<RefreshOutcome> {
  const exp = accessToken ? decodeJwtExp(accessToken) : null;
  const nowSec = Math.floor(Date.now() / 1000);
  const remaining = exp !== null ? exp - nowSec : -1;
  const shouldRefresh = !accessToken || exp === null || remaining < REFRESH_THRESHOLD_SECONDS;
  if (!shouldRefresh) return {};

  try {
    const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!refreshRes.ok) return { failed: true };

    const data = await refreshRes.json();
    const newAccess = data?.data?.accessToken;
    const newRefresh = data?.data?.refreshToken;
    if (!newAccess || !newRefresh) return {};
    return { accessToken: newAccess, refreshToken: newRefresh };
  } catch {
    // Network error -> không clear cookie, để request đi tiếp (page tự xử lý nếu cần).
    return {};
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Request prefetch của Next (<Link> tự prefetch khi hover/cuộn) KHÔNG được rotate token:
  // cookie set trên response prefetch không được trình duyệt lưu -> request thật sau đó cầm
  // refresh token cũ đã bị revoke -> reuse-detection nuke session -> logout oan. Bỏ qua sớm.
  const isPrefetch =
    request.headers.get('next-router-prefetch') === '1' ||
    request.headers.get('purpose') === 'prefetch' ||
    (request.headers.get('sec-purpose')?.includes('prefetch') ?? false);
  if (isPrefetch) return NextResponse.next();

  const accessToken = request.cookies.get('access_token')?.value;
  const refreshToken = request.cookies.get('refresh_token')?.value;

  // Bước 1: thử refresh nếu có refresh token.
  let refreshed: RefreshOutcome = {};
  if (refreshToken) {
    refreshed = await maybeRefresh(accessToken, refreshToken);
  }

  // Token hiệu lực sau khi (có thể) refresh: ưu tiên token mới, fallback token hiện tại.
  const effectiveAccess = refreshed.accessToken ?? accessToken;
  const hasValidToken = !refreshed.failed && isTokenValid(effectiveAccess);

  // Helper: build response chuẩn + đính kèm cookie (mới / clear) theo kết quả refresh.
  const withCookies = (response: NextResponse): NextResponse => {
    if (refreshed.accessToken && refreshed.refreshToken) {
      setAuthCookies(response, refreshed.accessToken, refreshed.refreshToken);
    } else if (refreshed.failed) {
      clearAuthCookies(response);
    }
    return response;
  };

  // Bước 2a: public route.
  if (PUBLIC_PATHS.includes(pathname)) {
    // User đã đăng nhập mà vào /login -> đẩy về dashboard.
    if (pathname === '/login' && hasValidToken) {
      return withCookies(NextResponse.redirect(new URL('/dashboard', request.url)));
    }
    return withCookies(NextResponse.next());
  }

  // Bước 2b: protected route, không có token hợp lệ -> redirect login.
  if (!hasValidToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return withCookies(NextResponse.redirect(loginUrl));
  }

  return withCookies(NextResponse.next());
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
