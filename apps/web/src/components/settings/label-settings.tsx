'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, Trash2, Plus, Clock, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { api } from '@/lib/api-client';
import { settingsNameSchema, parseZodErrors } from '@/lib/zod-form-validation-schemas';
import type { LabelEntity, LabelRecallConfigItem } from '@/types/entities';
import { LabelColorPresets, LabelPreviewChip } from './label-color-presets';

interface LabelSettingsProps {
  data: LabelEntity[];
  recallConfigs: LabelRecallConfigItem[];
  canEdit: boolean;        // manager + admin: edit name/color/category
  canEditRecall: boolean;  // super admin only: edit recall window
}

type RecallUnit = 'minute' | 'hour' | 'day';

// NOTHING = no config row (backend deletes it), RECALL/NOTIFY map to config.action.
type AutomationMode = 'NOTHING' | 'RECALL' | 'NOTIFY';

const MODE_OPTIONS: { value: AutomationMode; label: string; hint: string }[] = [
  { value: 'NOTHING', label: 'Không', hint: 'Không tự động làm gì khi lead gắn nhãn này quá hạn.' },
  { value: 'RECALL', label: 'Thu hồi', hint: 'Quá hạn sẽ thu hồi lead về kho POOL.' },
  { value: 'NOTIFY', label: 'Thông báo', hint: 'Quá hạn chỉ gửi thông báo cho người đang giữ lead, không thu hồi.' },
];

interface FormState {
  name: string;
  color: string;
  textColor: string;
  category: string;
  triggersOrder: boolean;
  mode: AutomationMode;
  // Window value, only meaningful when mode != NOTHING.
  value: string;
  unit: RecallUnit;
}

const EMPTY_FORM: FormState = {
  name: '',
  color: '#6b7280',
  textColor: '#ffffff',
  category: '',
  triggersOrder: false,
  mode: 'NOTHING',
  value: '',
  unit: 'day',
};

// Cron runs every 5 minutes - anything below 5 min would race or be silently delayed.
const MIN_MINUTES = 5;
// Cap = 1 year (365 days). Per-unit caps below keep the input form sane.
const PER_UNIT_LIMITS: Record<RecallUnit, { min: number; max: number; minutesPerUnit: number; label: string }> = {
  minute: { min: 5, max: 1440, minutesPerUnit: 1, label: 'Phút' },        // up to 24h
  hour:   { min: 1, max: 168,  minutesPerUnit: 60, label: 'Giờ' },        // up to 7 days
  day:    { min: 1, max: 365,  minutesPerUnit: 1440, label: 'Ngày' },     // up to 1 year
};

/** Pick the largest unit that divides cleanly so the form pre-fills with the most natural value. */
function decomposeMinutes(minutes: number): { value: number; unit: RecallUnit } {
  if (minutes % 1440 === 0) return { value: minutes / 1440, unit: 'day' };
  if (minutes % 60 === 0) return { value: minutes / 60, unit: 'hour' };
  return { value: minutes, unit: 'minute' };
}

/** Human-readable summary used in the badge next to each label. */
function humanizeMinutes(minutes: number): string {
  const { value, unit } = decomposeMinutes(minutes);
  const labelMap: Record<RecallUnit, string> = { minute: 'phút', hour: 'giờ', day: 'ngày' };
  return `${value} ${labelMap[unit]}`;
}

/** Label settings with integrated auto-recall config (per-label timer in minutes). */
export function LabelSettings({ data, recallConfigs, canEdit, canEditRecall }: LabelSettingsProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<LabelEntity | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  // Map labelId → config for O(1) lookup
  const configByLabelId = new Map(recallConfigs.map(c => [c.labelId, c]));

  function openCreate() {
    setEditingLabel(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setDialogOpen(true);
  }

  function openEdit(label: LabelEntity) {
    const config = configByLabelId.get(label.id);
    let mode: AutomationMode = 'NOTHING';
    let value = '';
    let unit: RecallUnit = 'day';
    if (config) {
      mode = config.action === 'NOTIFY' ? 'NOTIFY' : 'RECALL';
      const decomposed = decomposeMinutes(config.recallMinutes);
      value = String(decomposed.value);
      unit = decomposed.unit;
    }
    setEditingLabel(label);
    setForm({
      name: label.name,
      color: label.color || '#6b7280',
      textColor: label.textColor || '#ffffff',
      category: label.category || '',
      triggersOrder: label.triggersOrder ?? false,
      mode,
      value,
      unit,
    });
    setErrors({});
    setDialogOpen(true);
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    const nameParsed = settingsNameSchema.safeParse({ name: form.name });
    if (!nameParsed.success) Object.assign(next, parseZodErrors(nameParsed.error));

    if (form.mode !== 'NOTHING') {
      const n = Number(form.value);
      const limits = PER_UNIT_LIMITS[form.unit];
      if (form.value === '' || !Number.isInteger(n) || n < limits.min || n > limits.max) {
        next.value = `Giá trị phải là số nguyên từ ${limits.min} đến ${limits.max} ${limits.label.toLowerCase()}`;
      } else {
        // Final guard: even if user picks "minute" with value < 5 we already block via limits,
        // but double-check the resulting minute count is ≥ MIN_MINUTES.
        const totalMinutes = n * limits.minutesPerUnit;
        if (totalMinutes < MIN_MINUTES) {
          next.value = `Tối thiểu ${MIN_MINUTES} phút (cron chạy mỗi 5 phút)`;
        }
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setIsLoading(true);

    // Single-request payload: backend wraps label + recall config in $transaction.
    // recallMinutes semantics: undefined = don't touch (manager edit), null = remove, number = upsert.
    const body: Record<string, unknown> = {
      name: form.name,
      color: form.color,
      textColor: form.textColor,
      category: form.category || undefined,
      triggersOrder: form.triggersOrder,
    };
    if (canEditRecall) {
      if (form.mode === 'NOTHING') {
        body.recallMinutes = null;
      } else {
        body.recallMinutes = Number(form.value) * PER_UNIT_LIMITS[form.unit].minutesPerUnit;
        body.action = form.mode;
      }
    }

    try {
      if (editingLabel) {
        await api.patch(`/labels/${editingLabel.id}`, body);
      } else {
        await api.post('/labels', body);
      }
      toast.success(editingLabel ? 'Đã cập nhật nhãn' : 'Đã tạo nhãn');
      setDialogOpen(false);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Có lỗi xảy ra';
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(label: LabelEntity) {
    try {
      await api.delete(`/labels/${label.id}`);
      toast.success('Đã vô hiệu hóa nhãn');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Có lỗi xảy ra');
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">Nhãn ({data.length})</h3>
        {canEdit && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Thêm
          </Button>
        )}
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-slate-400">Chưa có dữ liệu</p>
      ) : (
        <div className="space-y-1">
          {data.map((item) => {
            const config = configByLabelId.get(item.id);
            return (
              <div key={item.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-50">
                <div className="flex flex-1 items-center gap-2">
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ backgroundColor: item.color, color: item.textColor || '#ffffff' }}
                  >
                    {item.name}
                  </span>
                  {item.category && <span className="text-xs text-slate-400">{item.category}</span>}
                  {config && config.action === 'NOTIFY' ? (
                    <span className="inline-flex items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 text-xs text-sky-700">
                      <Bell className="h-3 w-3" />
                      Báo sau {humanizeMinutes(config.recallMinutes)}
                    </span>
                  ) : config ? (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                      <Clock className="h-3 w-3" />
                      Recall {humanizeMinutes(config.recallMinutes)}
                    </span>
                  ) : null}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}>
                      <Pencil className="h-3.5 w-3.5 text-slate-400" />
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </Button>
                      }
                      title="Xóa nhãn"
                      description={`Bạn có chắc muốn vô hiệu hóa nhãn "${item.name}"? Cấu hình recall theo nhãn này (nếu có) sẽ ngừng chạy.`}
                      confirmLabel="Xóa"
                      onConfirm={() => handleDelete(item)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLabel ? 'Sửa nhãn' : 'Thêm nhãn'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Tên nhãn" required error={errors.name}>
              <Input
                placeholder="VD: VIP"
                value={form.name}
                onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
              />
            </Field>
            <Field label="Bộ màu gợi ý">
              <LabelColorPresets
                selectedBg={form.color}
                selectedText={form.textColor}
                onPick={(bg, text) => setForm(p => ({ ...p, color: bg, textColor: text }))}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Màu nền">
                <Input
                  type="color"
                  className="h-10 w-full p-1"
                  value={form.color}
                  onChange={(e) => setForm(p => ({ ...p, color: e.target.value }))}
                />
              </Field>
              <Field label="Màu chữ">
                <Input
                  type="color"
                  className="h-10 w-full p-1"
                  value={form.textColor}
                  onChange={(e) => setForm(p => ({ ...p, textColor: e.target.value }))}
                />
              </Field>
            </div>
            <LabelPreviewChip bg={form.color} text={form.textColor} name={form.name} />
            <Field label="Danh mục">
              <Input
                placeholder="VD: lead, customer"
                value={form.category}
                onChange={(e) => setForm(p => ({ ...p, category: e.target.value }))}
              />
            </Field>
            {/* Cờ trigger: khi gán nhãn này cho lead ở bảng /leads, tự mở popup tạo đơn hàng. */}
            <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-3 cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                checked={form.triggersOrder}
                onChange={(e) => setForm(p => ({ ...p, triggersOrder: e.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-slate-400 text-sky-600 focus:ring-sky-500"
              />
              <span className="text-sm">
                <span className="font-medium text-slate-700">Tự mở popup tạo đơn khi gán nhãn này</span>
                <span className="block text-xs text-slate-400">Khi đổi nhãn của lead sang nhãn này ở bảng Leads, popup tạo đơn hàng sẽ tự mở với thông tin điền sẵn.</span>
              </span>
            </label>
            {canEditRecall && (
              <>
                <Field
                  label="Tự động khi quá hạn"
                  hint={MODE_OPTIONS.find(o => o.value === form.mode)?.hint}
                >
                  <div className="flex gap-2">
                    {MODE_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                          form.mode === option.value
                            ? 'border-sky-500 bg-sky-50 font-medium text-sky-700'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="automation-mode"
                          className="sr-only"
                          checked={form.mode === option.value}
                          onChange={() => setForm(p => ({ ...p, mode: option.value }))}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </Field>
                {form.mode !== 'NOTHING' && (
                  <Field
                    label={form.mode === 'RECALL' ? 'Thời gian thu hồi' : 'Thời gian nhắc'}
                    error={errors.value}
                    hint={`Tối thiểu ${MIN_MINUTES} phút (cron chạy mỗi 5 phút). Gắn lại nhãn sẽ tính lại từ đầu.`}
                  >
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min={PER_UNIT_LIMITS[form.unit].min}
                        max={PER_UNIT_LIMITS[form.unit].max}
                        placeholder={form.unit === 'minute' ? 'VD: 30' : form.unit === 'hour' ? 'VD: 4' : 'VD: 7'}
                        value={form.value}
                        onChange={(e) => setForm(p => ({ ...p, value: e.target.value }))}
                        className="flex-1"
                      />
                      <Select
                        value={form.unit}
                        onValueChange={(v) => setForm(p => ({ ...p, unit: v as RecallUnit }))}
                      >
                        <SelectTrigger className="w-[110px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="minute">Phút</SelectItem>
                          <SelectItem value="hour">Giờ</SelectItem>
                          <SelectItem value="day">Ngày</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </Field>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface FieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}

function Field({ label, required, error, hint, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
