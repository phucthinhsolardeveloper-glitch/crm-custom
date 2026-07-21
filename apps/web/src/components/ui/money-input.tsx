'use client';

import { forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { formatNumber } from '@/lib/utils';

interface MoneyInputProps {
  /** Giá trị digits thô (vd "1000"). State cha luôn giữ digits, không có dấu chấm. */
  value: string;
  /** Trả về digits thô đã strip non-digit (vd "1000"). */
  onChange: (digits: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
}

/**
 * Input số tiền: hiển thị format dấu chấm phân cách nghìn (gõ 1000 -> 1.000),
 * nhưng state cha vẫn giữ digits thô để Number(value) chạy đúng khi submit.
 *
 * Dùng type="text" + inputMode="numeric" vì type="number" không cho hiện dấu chấm.
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, placeholder, className, id, disabled }, ref) => {
    const display = value ? formatNumber(Number(value)) : '';
    return (
      <Input
        ref={ref}
        id={id}
        type="text"
        inputMode="numeric"
        value={display}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      />
    );
  },
);

MoneyInput.displayName = 'MoneyInput';
