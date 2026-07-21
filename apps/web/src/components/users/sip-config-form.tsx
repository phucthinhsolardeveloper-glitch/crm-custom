'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/shared/form-field';
import { sipConfigApi } from '@/lib/api/sip-config';

interface SipConfigFormProps {
  userId: string;
  userName: string;
}

/**
 * Form super_admin nhap SIP credentials OmiCall cho user.
 * Credentials nay duoc OmiCall Web SDK dung de register tong dai khi user login.
 */
export function SipConfigForm({ userId, userName }: SipConfigFormProps) {
  const [form, setForm] = useState({ sipRealm: '', sipUser: '', sipPassword: '' });
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load config hien tai khi mount
  useEffect(() => {
    sipConfigApi.get(userId)
      .then((res) => {
        if (res.data) {
          setForm({
            sipRealm: res.data.sipRealm,
            sipUser: res.data.sipUser,
            sipPassword: res.data.sipPassword,
          });
          setConfigured(true);
        }
      })
      .catch(() => { /* chua cau hinh - giu form rong */ })
      .finally(() => setLoading(false));
  }, [userId]);

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.sipRealm || !form.sipUser || !form.sipPassword) {
      toast.error('Vui lòng nhập đầy đủ thông tin SIP');
      return;
    }
    setSaving(true);
    try {
      await sipConfigApi.upsert(userId, form);
      setConfigured(true);
      toast.success('Đã lưu cấu hình SIP');
    } catch {
      toast.error('Không thể lưu cấu hình SIP');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!confirm('Xóa cấu hình SIP của nhân viên này?')) return;
    setSaving(true);
    try {
      await sipConfigApi.remove(userId);
      setForm({ sipRealm: '', sipUser: '', sipPassword: '' });
      setConfigured(false);
      toast.success('Đã xóa cấu hình SIP');
    } catch {
      toast.error('Không thể xóa cấu hình SIP');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-slate-400">Đang tải cấu hình SIP...</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">SIP / Tổng đài OmiCall</h3>
          <span
            className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
              configured
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {configured ? 'Đã cấu hình' : 'Chưa cấu hình'}
          </span>
        </div>

        <p className="text-sm text-slate-500">
          Thông tin đăng nhập tổng đài cho nhân viên <strong>{userName}</strong>. Lấy từ OmiCall:
          Cấu hình - Tổng đài - Số nội bộ.
        </p>

        <FormField label="SIP Realm (tên miền tổng đài)" required>
          <Input
            value={form.sipRealm}
            onChange={(e) => update('sipRealm', e.target.value)}
            placeholder="vd: demo01"
          />
        </FormField>

        <FormField label="SIP User (số nội bộ / extension)" required>
          <Input
            value={form.sipUser}
            onChange={(e) => update('sipUser', e.target.value)}
            placeholder="vd: 100"
          />
        </FormField>

        <FormField label="SIP Password" required>
          <Input
            type="password"
            value={form.sipPassword}
            onChange={(e) => update('sipPassword', e.target.value)}
            placeholder="Mật khẩu số nội bộ"
          />
        </FormField>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? 'Đang lưu...' : 'Lưu cấu hình SIP'}
        </Button>
        {configured && (
          <Button type="button" variant="outline" onClick={handleRemove} disabled={saving}>
            Xóa cấu hình
          </Button>
        )}
      </div>
    </form>
  );
}
