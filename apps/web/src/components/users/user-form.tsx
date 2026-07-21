'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/shared/form-field';
import { useFormAction } from '@/hooks/use-form-action';
import { api } from '@/lib/api-client';
import { userCreateSchema, userEditSchema, parseZodErrors } from '@/lib/zod-form-validation-schemas';
import type { UserRecord, NamedEntity } from '@/types/entities';

interface UserFormProps {
  user?: UserRecord;
  departments: NamedEntity[];
  levels: NamedEntity[];
  /** Role của người đang đăng nhập - MANAGER bị giới hạn chỉ thao tác USER. */
  currentUserRole?: string;
}

/** Shared create/edit form for users. */
export function UserForm({ user, departments, levels, currentUserRole }: UserFormProps) {
  // MANAGER chỉ được set role = USER, không được chọn MANAGER/SUPER_ADMIN.
  const isManagerActor = currentUserRole === 'MANAGER';
  // Email chỉ SUPER_ADMIN sửa được khi edit (BE chặn MANAGER thay đổi email).
  const canEditEmail = currentUserRole === 'SUPER_ADMIN';
  const router = useRouter();
  const isEdit = !!user;
  const { execute, isLoading, error } = useFormAction({
    successMessage: isEdit ? 'Đã cập nhật nhân viên' : 'Đã tạo nhân viên',
    onSuccess: () => router.push('/users'),
  });

  const [form, setForm] = useState({
    email: user?.email || '',
    password: '',
    name: user?.name || '',
    phone: user?.phone || '',
    address: user?.address || '',
    role: user?.role || 'USER',
    departmentId: user?.departmentId || '',
    teamId: user?.teamId || '',
    employeeLevelId: user?.employeeLevelId || '',
    status: user?.status || 'ACTIVE',
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [teams, setTeams] = useState<NamedEntity[]>([]);

  useEffect(() => {
    if (form.departmentId) {
      api.get<{ data: NamedEntity[] }>(`/teams?departmentId=${form.departmentId}`)
        .then(r => setTeams(r.data))
        .catch(() => setTeams([]));
    } else {
      setTeams([]);
      setForm(prev => ({ ...prev, teamId: '' }));
    }
  }, [form.departmentId]);

  function update(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) setFieldErrors(prev => ({ ...prev, [key]: '' }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const schema = isEdit ? userEditSchema : userCreateSchema;
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(parseZodErrors(parsed.error));
      return;
    }
    setFieldErrors({});
    const body: Record<string, unknown> = {};

    if (isEdit) {
      // Email chỉ gửi nếu thay đổi và actor có quyền - tránh BE 403 với MANAGER.
      if (canEditEmail && form.email && form.email !== user.email) {
        body.email = form.email;
      }
      if (form.name) body.name = form.name;
      if (form.phone) body.phone = form.phone;
      if (form.address !== undefined) body.address = form.address;
      if (form.password) body.password = form.password;
      body.role = form.role;
      body.status = form.status;
      if (form.departmentId) body.departmentId = form.departmentId;
      // teamId: always send (empty string triggers disconnect in backend)
      body.teamId = form.teamId;
      if (form.employeeLevelId) body.employeeLevelId = form.employeeLevelId;
      await execute('patch', `/users/${user.id}`, body);
    } else {
      body.email = form.email;
      body.password = form.password;
      body.name = form.name;
      if (form.phone) body.phone = form.phone;
      if (form.address) body.address = form.address;
      if (form.role) body.role = form.role;
      if (form.departmentId) body.departmentId = form.departmentId;
      if (form.teamId) body.teamId = form.teamId;
      if (form.employeeLevelId) body.employeeLevelId = form.employeeLevelId;
      await execute('post', '/users', body);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <h3 className="font-semibold text-slate-900">Thông tin cơ bản</h3>

        <FormField label="Email" required={!isEdit} error={fieldErrors.email}>
          <Input
            type="email"
            value={form.email}
            onChange={e => update('email', e.target.value)}
            disabled={isEdit && !canEditEmail}
            placeholder="email@company.com"
          />
          {isEdit && canEditEmail && form.email !== user.email && (
            <p className="mt-1 text-xs text-amber-600">
              Đổi email sẽ buộc user đăng xuất khỏi tất cả thiết bị.
            </p>
          )}
        </FormField>

        <FormField label={isEdit ? 'Mật khẩu mới (để trống nếu không đổi)' : 'Mật khẩu'} required={!isEdit} error={fieldErrors.password}>
          <Input
            type="password"
            value={form.password}
            onChange={e => update('password', e.target.value)}
            placeholder="Tối thiểu 8 ký tự"
          />
        </FormField>

        <FormField label="Họ tên" required error={fieldErrors.name}>
          <Input
            value={form.name}
            onChange={e => update('name', e.target.value)}
            placeholder="Nguyễn Văn A"
          />
        </FormField>

        <FormField label="Số điện thoại" error={fieldErrors.phone}>
          <Input
            value={form.phone}
            onChange={e => update('phone', e.target.value)}
            placeholder="0912345678"
          />
        </FormField>

        <FormField label="Địa chỉ">
          <Input
            value={form.address}
            onChange={e => update('address', e.target.value)}
            placeholder="Số nhà, đường, quận/huyện, tỉnh/TP"
          />
        </FormField>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <h3 className="font-semibold text-slate-900">Phân quyền & Tổ chức</h3>

        <FormField label="Vai trò">
          <Select
            value={form.role}
            onValueChange={v => update('role', v)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="USER">Nhân viên</SelectItem>
              {/* MANAGER được gán LEADER (vai trò dưới MANAGER); MANAGER/SUPER_ADMIN chỉ SUPER_ADMIN gán. */}
              <SelectItem value="LEADER">Trưởng nhóm</SelectItem>
              {!isManagerActor && <SelectItem value="MANAGER">Quản lý</SelectItem>}
              {!isManagerActor && <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>}
            </SelectContent>
          </Select>
          {isManagerActor && (
            <p className="mt-1 text-xs text-slate-400">
              Quản lý chỉ được gán vai trò Nhân viên hoặc Trưởng nhóm.
            </p>
          )}
        </FormField>

        {isEdit && (
          <FormField label="Trạng thái">
            <Select value={form.status} onValueChange={v => update('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Hoạt động</SelectItem>
                <SelectItem value="INACTIVE">Vô hiệu hóa</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        )}

        <FormField label="Phòng ban">
          <Select value={form.departmentId} onValueChange={v => update('departmentId', v)}>
            <SelectTrigger><SelectValue placeholder="Chọn phòng ban" /></SelectTrigger>
            <SelectContent>
              {departments.map(d => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        {teams.length > 0 && (
          <FormField label="Team">
            <Select
              value={form.teamId || '__none__'}
              onValueChange={v => update('teamId', v === '__none__' ? '' : v)}
            >
              <SelectTrigger><SelectValue placeholder="Chọn team" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">- Không thuộc team -</SelectItem>
                {teams.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}

        <FormField label="Cấp bậc">
          <Select value={form.employeeLevelId} onValueChange={v => update('employeeLevelId', v)}>
            <SelectTrigger><SelectValue placeholder="Chọn cấp bậc" /></SelectTrigger>
            <SelectContent>
              {levels.map(l => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Đang lưu...' : (isEdit ? 'Cập nhật' : 'Tạo nhân viên')}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/users')}>
          Hủy
        </Button>
      </div>
    </form>
  );
}
