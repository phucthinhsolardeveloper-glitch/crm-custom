'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Zap, Eye, EyeOff } from 'lucide-react';

/** Only allow relative paths starting with / - block protocol-relative, absolute URLs, and dangerous protocols */
function sanitizeRedirect(raw: string | null): string {
  if (!raw) return '/dashboard';
  // Block protocol-relative (//evil.com), absolute (http://), data: and javascript: URIs
  if (/^[a-z]+:/i.test(raw) || raw.startsWith('//') || !raw.startsWith('/')) {
    return '/dashboard';
  }
  return raw;
}

function LoginFormInner() {
  const searchParams = useSearchParams();
  const redirect = sanitizeRedirect(searchParams.get('redirect'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.message || 'Thông tin đăng nhập không đúng');
        return;
      }

      window.location.href = redirect;
    } catch {
      setError('Lỗi kết nối đến máy chủ');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-8 flex items-center gap-2.5 lg:hidden">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-[0_4px_14px_0_rgba(14,165,233,0.3)]">
          <Zap size={20} />
        </div>
        <span className="text-2xl font-extrabold text-gradient">CRM-Custom</span>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-extrabold text-slate-900">Chào mừng trở lại</h2>
        <p className="mt-1.5 text-sm text-slate-500">Đăng nhập vào tài khoản của bạn để tiếp tục</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email" type="email" placeholder="email@company.com"
            value={email} onChange={(e) => setEmail(e.target.value)}
            required autoFocus
            className="h-11"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Mật khẩu</Label>
          <div className="relative">
            <Input
              id="password" type={showPassword ? 'text' : 'password'} placeholder="Nhập mật khẩu"
              value={password} onChange={(e) => setPassword(e.target.value)}
              required minLength={8}
              className="h-11 pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <Button type="submit" className="w-full h-11 text-sm" disabled={isLoading}>
          {isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </Button>
      </form>

      <p className="mt-8 text-center text-xs text-slate-400">
        CRM-Custom &mdash; Hệ thống CRM nội bộ
      </p>
    </div>
  );
}

export function LoginForm() {
  return (
    <Suspense>
      <LoginFormInner />
    </Suspense>
  );
}
