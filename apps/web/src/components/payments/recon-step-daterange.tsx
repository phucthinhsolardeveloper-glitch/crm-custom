'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Clock } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import type { NamedEntity } from '@/types/entities';
import { DateTimeRangePicker } from '@/components/shared/date-time-range-picker';
import type { DatePresetKey } from '@/lib/datetime-utc7';

/**
 * Bước 1: chọn khoảng thời gian VN (GMT+7, có giờ phút).
 * datetime-local không mang offset -> khi confirm ta gắn "+07:00" thủ công để
 * backend anchor đúng. Presets tính theo giờ VN (client TZ có thể lệch nên
 * dùng chuỗi wall-clock, không dùng Date UTC).
 */

interface Props {
  onConfirm: (fromVN: string, toVN: string, bankAccount?: string) => void;
}

// 'YYYY-MM-DDTHH:mm' theo giờ VN. Lấy từ toLocaleString timezone Asia/Ho_Chi_Minh
// để không phụ thuộc TZ máy người dùng.
function vnNow(): Date {
  const s = new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' });
  return new Date(s);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toLocalInput(d: Date, hour: number, min: number): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:${pad(min)}`;
}

export function ReconStepDateRange({ onConfirm }: Props) {
  const now = vnNow();
  const todayStart = toLocalInput(now, 0, 0);
  const nowStr = toLocalInput(now, now.getHours(), now.getMinutes());

  const [from, setFrom] = useState(todayStart);
  const [to, setTo] = useState(nowStr);
  const [datePreset, setDatePreset] = useState<DatePresetKey>('custom');
  const [banks, setBanks] = useState<NamedEntity[]>([]);
  const [bank, setBank] = useState(''); // '' = tất cả ngân hàng

  useEffect(() => {
    api
      .get<{ data: NamedEntity[] }>('/bank-accounts')
      .then((res) => setBanks(res.data))
      .catch(() => {}); // dropdown bank optional, lỗi thì để trống = ALL
  }, []);

  function handleConfirm() {
    if (!from || !to) {
      toast.error('Vui lòng chọn cả thời gian bắt đầu và kết thúc');
      return;
    }
    if (from > to) {
      toast.error('Thời gian bắt đầu phải nhỏ hơn hoặc bằng thời gian kết thúc');
      return;
    }
    // Gửi chuỗi naive (KHÔNG offset) - backend tự anchor về giờ VN (+7h). KHÔNG
    // gắn "+07:00": dấu + trong query string bị proxy Next.js decode thành dấu
    // cách -> ngày hỏng -> backend 400 -> đối soát rỗng. Bound `to` lấy giây :59.
    onConfirm(`${from}:00`, `${to}:59`, bank || undefined);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Clock className="h-4 w-4 text-sky-500" />
        Chọn khoảng thời gian đối soát
        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-600">
          Giờ Việt Nam (GMT+7)
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Khoảng thời gian
          <DateTimeRangePicker
            from={from}
            to={to}
            preset={datePreset}
            onApply={({ from: f, to: t, preset }) => {
              setDatePreset(preset);
              setFrom(f);
              setTo(t);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Ngân hàng
          <select
            value={bank}
            onChange={(e) => setBank(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none"
          >
            <option value="">Tất cả ngân hàng</option>
            {banks.map((b) => (
              <option key={b.id} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={handleConfirm} className="bg-sky-500 hover:bg-sky-600">
          Tiếp tục
        </Button>
      </div>
    </div>
  );
}
