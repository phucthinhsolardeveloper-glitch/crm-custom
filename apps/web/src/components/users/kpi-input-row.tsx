'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { formatNumber } from '@/lib/utils';

interface KpiInputRowProps {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}

/**
 * Input số tiền VND: typing thì raw number, blur thì format `1.000.000`.
 * value === null → input rỗng (placeholder "Chưa set").
 */
export function KpiInputRow({ label, value, onChange, disabled }: KpiInputRowProps) {
  const [raw, setRaw] = useState<string>('');
  const [focused, setFocused] = useState(false);

  // Sync raw text từ value khi không focused (load lại, parent reset).
  useEffect(() => {
    if (!focused) {
      setRaw(value === null ? '' : value.toString());
    }
  }, [value, focused]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Chỉ cho phép số (loại bỏ dấu chấm, dấu phẩy, ký tự khác).
    const digits = e.target.value.replace(/\D/g, '');
    setRaw(digits);
    if (digits === '') {
      onChange(null);
    } else {
      const n = parseInt(digits, 10);
      onChange(Number.isFinite(n) ? n : null);
    }
  }

  function handleFocus() {
    setFocused(true);
    // Hiển thị raw number khi focus để dễ chỉnh sửa.
    setRaw(value === null ? '' : value.toString());
  }

  function handleBlur() {
    setFocused(false);
  }

  const display = focused ? raw : value === null ? '' : formatNumber(value);

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <Input
        value={display}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        disabled={disabled}
        placeholder="Chưa set"
        inputMode="numeric"
        className="text-right"
      />
    </div>
  );
}
