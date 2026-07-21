'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Department {
  id: string;
  name: string;
}

interface WeightConfig {
  workload: number;
  level: number;
  conversion: number;
}

interface DistributionConfig {
  isActive: boolean;
  weightConfig: WeightConfig;
}

interface UserScore {
  userId: string;
  name: string;
  score: number;
  details: Record<string, number>;
}

interface Props {
  departments: Department[];
}

export function DistributionAiWeightConfigClient({ departments }: Props) {
  const [deptId, setDeptId] = useState<string>('');
  const [config, setConfig] = useState<DistributionConfig | null>(null);
  const [scores, setScores] = useState<UserScore[]>([]);
  const [saving, setSaving] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);

  useEffect(() => {
    if (!deptId) return;
    setLoadingConfig(true);
    Promise.all([
      api.get<{ data: DistributionConfig }>(`/distribution/config/${deptId}`),
      api.get<{ data: UserScore[] }>(`/distribution/scores/${deptId}`),
    ])
      .then(([configRes, scoresRes]) => {
        setConfig(configRes.data ?? { isActive: false, weightConfig: { workload: 40, level: 30, conversion: 30 } });
        setScores(scoresRes.data ?? []);
      })
      .catch(() => toast.error('Không thể tải cấu hình phân phối'))
      .finally(() => setLoadingConfig(false));
  }, [deptId]);

  function handleWeightChange(key: keyof WeightConfig, value: number) {
    if (!config) return;
    setConfig({ ...config, weightConfig: { ...config.weightConfig, [key]: value } });
  }

  const totalWeight = config
    ? config.weightConfig.workload + config.weightConfig.level + config.weightConfig.conversion
    : 0;

  async function handleSave() {
    if (!deptId || !config) return;
    if (totalWeight !== 100) {
      toast.error('Tổng trọng số phải bằng 100%');
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/distribution/config/${deptId}`, {
        isActive: config.isActive,
        weightConfig: config.weightConfig,
      });
      toast.success('Đã lưu cấu hình phân phối AI');
    } catch {
      toast.error('Lưu cấu hình thất bại');
    } finally {
      setSaving(false);
    }
  }

  async function handleDistribute() {
    if (!deptId) return;
    setDistributing(true);
    try {
      const res = await api.post<{ data: { assigned: number } }>(`/distribution/distribute/${deptId}`);
      toast.success(`Đã phân phối ${res.data?.assigned ?? 0} leads tự động`);
    } catch {
      toast.error('Phân phối tự động thất bại');
    } finally {
      setDistributing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Department selector */}
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <label className="block text-sm font-medium text-slate-700 mb-2">Chọn phòng ban</label>
        <Select value={deptId} onValueChange={setDeptId}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="-- Chọn phòng ban --" />
          </SelectTrigger>
          <SelectContent>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {deptId && loadingConfig && (
        <div className="text-sm text-slate-400">Đang tải cấu hình...</div>
      )}

      {deptId && !loadingConfig && config && (
        <>
          {/* Active toggle + weights */}
          <div className="rounded-xl border bg-white p-5 shadow-sm space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-800">Phân phối AI tự động</p>
                <p className="text-sm text-slate-500">Bật để hệ thống tự động phân phối leads theo điểm số</p>
              </div>
              <button
                onClick={() => setConfig({ ...config, isActive: !config.isActive })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  config.isActive ? 'bg-sky-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    config.isActive ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="border-t pt-4 space-y-4">
              <p className="text-sm font-medium text-slate-700">
                Trọng số tính điểm{' '}
                <span className={totalWeight !== 100 ? 'text-red-500 font-semibold' : 'text-green-600'}>
                  (tổng: {totalWeight}%)
                </span>
              </p>

              {(
                [
                  { key: 'workload' as const, label: 'Khối lượng công việc' },
                  { key: 'level' as const, label: 'Cấp bậc nhân viên' },
                  { key: 'conversion' as const, label: 'Tỉ lệ chuyển đổi' },
                ] as const
              ).map(({ key, label }) => (
                <div key={key} className="flex items-center gap-4">
                  <label className="w-52 text-sm text-slate-600">{label}</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={config.weightConfig[key]}
                    onChange={(e) => handleWeightChange(key, Number(e.target.value))}
                    className="w-20 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                  />
                  <span className="text-sm text-slate-400">%</span>
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-2">
              <Button onClick={handleSave} disabled={saving || totalWeight !== 100}>
                {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
              </Button>
              <Button variant="outline" onClick={handleDistribute} disabled={distributing}>
                {distributing ? 'Đang phân phối...' : 'Phân phối tự động'}
              </Button>
            </div>
          </div>

          {/* Scores table */}
          {scores.length > 0 && (
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <p className="font-medium text-slate-800 mb-3">Điểm số nhân viên</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-slate-500">Nhân viên</th>
                      <th className="px-4 py-2 text-right font-medium text-slate-500">Điểm tổng</th>
                      <th className="px-4 py-2 text-right font-medium text-slate-500">Khối lượng</th>
                      <th className="px-4 py-2 text-right font-medium text-slate-500">Cấp bậc</th>
                      <th className="px-4 py-2 text-right font-medium text-slate-500">Chuyển đổi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scores.map((s) => (
                      <tr key={s.userId} className="border-b border-slate-100 hover:bg-slate-50 last:border-0">
                        <td className="px-4 py-2 font-medium text-slate-800">{s.name}</td>
                        <td className="px-4 py-2 text-right font-semibold text-sky-600">{s.score.toFixed(1)}</td>
                        <td className="px-4 py-2 text-right text-slate-600">{s.details?.workload?.toFixed(1) ?? '-'}</td>
                        <td className="px-4 py-2 text-right text-slate-600">{s.details?.level?.toFixed(1) ?? '-'}</td>
                        <td className="px-4 py-2 text-right text-slate-600">{s.details?.conversion?.toFixed(1) ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {scores.length === 0 && (
            <div className="rounded-xl border bg-white p-5 shadow-sm text-center text-sm text-slate-400">
              Chưa có dữ liệu điểm số nhân viên
            </div>
          )}
        </>
      )}
    </div>
  );
}
