'use client';

import { useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { api } from '@/lib/api-client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, User, Mail, Phone, Shield, Building2, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { KpiHistoryPanel } from '@/components/profile/kpi-history-panel';
import { PushNotificationToggle } from '@/components/settings/push-notification-toggle';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Quản trị viên',
  MANAGER: 'Quản lý',
  USER: 'Nhân viên',
};

export default function ProfilePage() {
  const { user } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState('');
  const [phoneFetched, setPhoneFetched] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fetch full user data (including phone) on mount
  useState(() => {
    if (!user) return;
    api.get<{ data: { phone?: string } }>(`/users/${user.id}`).then((res) => {
      setPhone(res.data.phone || '');
      setPhoneFetched(true);
    }).catch(() => setPhoneFetched(true));
  });

  async function handleSaveInfo(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch('/users/profile', { name, phone: phone || undefined });
      toast.success('Cập nhật thông tin thành công');
      // Reload to refresh auth context
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi cập nhật');
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('Mật khẩu xác nhận không khớp');
      return;
    }
    setSaving(true);
    try {
      await api.patch('/users/profile', { password, currentPassword });
      toast.success('Đổi mật khẩu thành công. Vui lòng đăng nhập lại.');
      // Password change revokes tokens - redirect to login
      setTimeout(() => { window.location.href = '/login'; }, 1500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi đổi mật khẩu');
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Thông tin cá nhân</h1>
        <p className="text-sm text-slate-500">Quản lý thông tin tài khoản của bạn</p>
      </div>

      <KpiHistoryPanel userId={String(user.id)} />

      {/* Bật/tắt thông báo đẩy (Web Push) theo từng thiết bị */}
      <PushNotificationToggle />

      {/* Account info (read-only) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tài khoản</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <Mail size={16} className="text-slate-400" />
            <span className="text-slate-500 w-24">Email</span>
            <span className="font-medium text-slate-700">{user.email}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Shield size={16} className="text-slate-400" />
            <span className="text-slate-500 w-24">Vai trò</span>
            <span className="inline-flex rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
              {ROLE_LABELS[user.role] || user.role}
            </span>
          </div>
          {user.departmentId && (
            <div className="flex items-center gap-3 text-sm">
              <Building2 size={16} className="text-slate-400" />
              <span className="text-slate-500 w-24">Phòng ban</span>
              <span className="font-medium text-slate-700">ID: {user.departmentId}</span>
            </div>
          )}
          {user.teamId && (
            <div className="flex items-center gap-3 text-sm">
              <UsersRound size={16} className="text-slate-400" />
              <span className="text-slate-500 w-24">Team</span>
              <span className="font-medium text-slate-700">ID: {user.teamId}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit name & phone */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thông tin cơ bản</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveInfo} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Họ tên</Label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  id="name" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Nhập họ tên" required className="h-11 pl-10"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Số điện thoại</Label>
              <div className="relative">
                <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  id="phone" value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder={phoneFetched ? 'Chưa cập nhật' : 'Đang tải...'} className="h-11 pl-10"
                />
              </div>
            </div>
            <Button type="submit" disabled={saving} className="h-10">
              {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Đổi mật khẩu</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="current-password">Mật khẩu hiện tại</Label>
              <Input
                id="current-password" type={showPassword ? 'text' : 'password'}
                value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Cần để xác minh bạn là chủ tài khoản" required className="h-11"
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Mật khẩu mới</Label>
              <div className="relative">
                <Input
                  id="new-password" type={showPassword ? 'text' : 'password'}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tối thiểu 8 ký tự" required minLength={8} className="h-11 pr-11"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Xác nhận mật khẩu</Label>
              <Input
                id="confirm-password" type={showPassword ? 'text' : 'password'}
                value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu mới" required minLength={8} className="h-11"
              />
            </div>
            <Button type="submit" disabled={saving || !password || !currentPassword} variant="outline" className="h-10">
              {saving ? 'Đang đổi...' : 'Đổi mật khẩu'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
