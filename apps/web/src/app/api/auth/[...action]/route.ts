import { NextRequest, NextResponse } from 'next/server';

// Route Handler chạy server-side. Ưu tiên INTERNAL_API_URL (localhost) để skip Cloudflare round-trip.
// Fallback NEXT_PUBLIC_API_URL khi chưa cấu hình.
const API_BASE = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010/api/v1';

/** Build Set-Cookie header string. */
function buildCookie(name: string, value: string, options: {
  httpOnly?: boolean; secure?: boolean; sameSite?: string;
  path?: string; maxAge?: number;
}): string {
  const parts = [`${name}=${value}`];
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join('; ');
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string[] }> }) {
  const { action } = await params;
  const actionName = action[0];
  const isProd = process.env.NODE_ENV === 'production';

  if (actionName === 'login') {
    const body = await request.json();
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });

    const response = NextResponse.json({ data: { message: 'Đăng nhập thành công' } });

    response.headers.append('Set-Cookie', buildCookie('access_token', data.data.accessToken, {
      httpOnly: true, secure: isProd, sameSite: 'Lax', path: '/', maxAge: 60 * 60,
    }));
    response.headers.append('Set-Cookie', buildCookie('refresh_token', data.data.refreshToken, {
      httpOnly: true, secure: isProd, sameSite: 'Lax', path: '/', maxAge: 7 * 24 * 60 * 60,
    }));

    return response;
  }

  if (actionName === 'refresh') {
    const refreshToken = request.cookies.get('refresh_token')?.value;
    if (!refreshToken) {
      return NextResponse.json({ message: 'Không có refresh token' }, { status: 401 });
    }

    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    const data = await res.json();
    if (!res.ok) {
      const response = NextResponse.json(data, { status: res.status });
      response.headers.append('Set-Cookie', buildCookie('access_token', '', { path: '/', maxAge: 0 }));
      response.headers.append('Set-Cookie', buildCookie('refresh_token', '', { path: '/', maxAge: 0 }));
      return response;
    }

    const response = NextResponse.json({ data: { message: 'Token refreshed' } });
    response.headers.append('Set-Cookie', buildCookie('access_token', data.data.accessToken, {
      httpOnly: true, secure: isProd, sameSite: 'Lax', path: '/', maxAge: 60 * 60,
    }));
    response.headers.append('Set-Cookie', buildCookie('refresh_token', data.data.refreshToken, {
      httpOnly: true, secure: isProd, sameSite: 'Lax', path: '/', maxAge: 7 * 24 * 60 * 60,
    }));
    return response;
  }

  if (actionName === 'logout') {
    const refreshToken = request.cookies.get('refresh_token')?.value;
    if (refreshToken) {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {});
    }

    const response = NextResponse.json({ data: { message: 'Đăng xuất thành công' } });
    response.headers.append('Set-Cookie', buildCookie('access_token', '', { path: '/', maxAge: 0 }));
    response.headers.append('Set-Cookie', buildCookie('refresh_token', '', { path: '/', maxAge: 0 }));
    return response;
  }

  return NextResponse.json({ message: 'Action không hợp lệ' }, { status: 400 });
}
