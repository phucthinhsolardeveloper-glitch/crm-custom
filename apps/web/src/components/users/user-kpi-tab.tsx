'use client';

import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { KpiInputRow } from './kpi-input-row';
import { kpiTargetsApi, type UpsertKpiTargetsPayload } from '@/lib/api/kpi-targets';
import { formatNumber } from '@/lib/utils';

interface UserKpiTabProps {
  userId: string;
  userName: string;
}

const MONTH_LABELS = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4',
  'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8',
  'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];

const MONTH_KEYS = [
  'targetJan', 'targetFeb', 'targetMar', 'targetApr',
  'targetMay', 'targetJun', 'targetJul', 'targetAug',
  'targetSep', 'targetOct', 'targetNov', 'targetDec',
] as const;

type MonthKey = (typeof MONTH_KEYS)[number];

interface FormState {
  targetYearly: number | null;
  targetJan: number | null;
  targetFeb: number | null;
  targetMar: number | null;
  targetApr: number | null;
  targetMay: number | null;
  targetJun: number | null;
  targetJul: number | null;
  targetAug: number | null;
  targetSep: number | null;
  targetOct: number | null;
  targetNov: number | null;
  targetDec: number | null;
}

const EMPTY_FORM: FormState = {
  targetYearly: null,
  targetJan: null, targetFeb: null, targetMar: null, targetApr: null,
  targetMay: null, targetJun: null, targetJul: null, targetAug: null,
  targetSep: null, targetOct: null, targetNov: null, targetDec: null,
};

/** Parse string Decimal từ API → number | null cho form state. */
function parseDecimal(s: string | null): number | null {
  if (s === null) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Tab "KPI" cho super_admin: chọn năm + nhập 13 số (yearly + 12 month).
 * 1 PUT request gửi tất cả - dễ tracking thay đổi.
 * NULL = chưa set (không phải 0).
 */
export function UserKpiTab({ userId, userName }: UserKpiTabProps) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Year selector range: 2020 → currentYear + 1 (cho phép set sớm năm sau).
  const yearOptions = useMemo(() => {
    const opts: number[] = [];
    for (let y = currentYear + 1; y >= 2020; y--) opts.push(y);
    return opts;
  }, [currentYear]);

  // Load KPI khi year đổi hoặc mount.
  useEffect(() => {
    setLoading(true);
    kpiTargetsApi.getOne(userId, year)
      .then((res) => {
        if (res.data) {
          setForm({
            targetYearly: parseDecimal(res.data.targetYearly),
            targetJan: parseDecimal(res.data.targetJan),
            targetFeb: parseDecimal(res.data.targetFeb),
            targetMar: parseDecimal(res.data.targetMar),
            targetApr: parseDecimal(res.data.targetApr),
            targetMay: parseDecimal(res.data.targetMay),
            targetJun: parseDecimal(res.data.targetJun),
            targetJul: parseDecimal(res.data.targetJul),
            targetAug: parseDecimal(res.data.targetAug),
            targetSep: parseDecimal(res.data.targetSep),
            targetOct: parseDecimal(res.data.targetOct),
            targetNov: parseDecimal(res.data.targetNov),
            targetDec: parseDecimal(res.data.targetDec),
          });
        } else {
          setForm(EMPTY_FORM);
        }
      })
      .catch(() => {
        setForm(EMPTY_FORM);
        toast.error('Không tải được KPI');
      })
      .finally(() => setLoading(false));
  }, [userId, year]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Tổng 12 tháng để hiển thị check vs target yearly.
  const sumMonthly = useMemo(() => {
    return MONTH_KEYS.reduce((sum, k) => sum + (form[k] ?? 0), 0);
  }, [form]);

  const diff = useMemo(() => {
    if (form.targetYearly === null) return null;
    return sumMonthly - form.targetYearly;
  }, [sumMonthly, form.targetYearly]);

  async function handleSave() {
    setSaving(true);
    try {
      // Convert null → undefined để BE không update field đó.
      // Nếu user muốn xóa hẳn 1 cột, để dùng DELETE endpoint (xóa cả row).
      const payload: UpsertKpiTargetsPayload = {};
      const keys: (keyof FormState)[] = ['targetYearly', ...MONTH_KEYS];
      for (const k of keys) {
        if (form[k] !== null) {
          payload[k] = form[k] as number;
        }
      }
      await kpiTargetsApi.upsert(userId, year, payload);
      toast.success(`Đã lưu KPI năm ${year}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
      toast.error(`Không lưu được KPI: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-slate-400">Đang tải KPI...</div>;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">KPI doanh số</h3>
            <p className="text-sm text-slate-500">
              Mục tiêu doanh thu cho nhân viên <strong>{userName}</strong>. Đơn vị: VND.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">Năm:</label>
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-lg border border-sky-100 bg-sky-50 p-4">
          <KpiInputRow
            label="Mục tiêu cả năm"
            value={form.targetYearly}
            onChange={(v) => updateField('targetYearly', v)}
            disabled={saving}
          />
        </div>

        <div>
          <div className="text-sm font-medium text-slate-700 mb-3">Mục tiêu theo tháng</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {MONTH_KEYS.map((key, i) => (
              <KpiInputRow
                key={key}
                label={MONTH_LABELS[i]}
                value={form[key]}
                onChange={(v) => updateField(key as MonthKey, v)}
                disabled={saving}
              />
            ))}
          </div>
        </div>

        <div className="rounded-md bg-slate-50 px-4 py-3 text-sm">
          <span className="text-slate-600">Tổng 12 tháng: </span>
          <strong className="text-slate-900">{formatNumber(sumMonthly)} ₫</strong>
          {diff !== null && (
            <span className={`ml-2 ${diff === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
              ({diff === 0 ? 'khớp KPI năm' : `lệch ${formatNumber(Math.abs(diff))} so với KPI năm`})
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? 'Đang lưu...' : 'Lưu KPI'}
        </Button>
      </div>
    </div>
  );
}
