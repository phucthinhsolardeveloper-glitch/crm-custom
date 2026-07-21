'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/shared/form-field';
import { fetchProvinces, fetchWards, formatAddress, type AddressUnit } from '@/lib/address-kit';

export interface CustomerAddressValue {
  addressProvinceCode: string;
  addressProvinceName: string;
  addressWardCode: string;
  addressWardName: string;
  addressStreet: string;
}

interface Props {
  value: CustomerAddressValue;
  onChange: (patch: Partial<CustomerAddressValue>) => void;
}

/**
 * Phần nhập địa chỉ có cấu trúc cho customer (mô hình 2 cấp).
 * Chọn Tỉnh/Thành -> tự load Phường/Xã. Dữ liệu cache 1 năm ở localStorage (xem lib/address-kit).
 */
export function CustomerAddressFields({ value, onChange }: Props) {
  const [provinces, setProvinces] = useState<AddressUnit[]>([]);
  const [wards, setWards] = useState<AddressUnit[]>([]);
  const [loadingWards, setLoadingWards] = useState(false);
  const [error, setError] = useState('');

  // Load tỉnh/thành 1 lần khi mount.
  useEffect(() => {
    let active = true;
    fetchProvinces()
      .then((list) => active && setProvinces(list))
      .catch(() => active && setError('Không tải được danh sách tỉnh/thành'));
    return () => {
      active = false;
    };
  }, []);

  // Load phường/xã mỗi khi mã tỉnh đổi (gồm cả lần đầu ở chế độ sửa).
  useEffect(() => {
    if (!value.addressProvinceCode) {
      setWards([]);
      return;
    }
    let active = true;
    setLoadingWards(true);
    fetchWards(value.addressProvinceCode)
      .then((list) => active && setWards(list))
      .catch(() => active && setError('Không tải được danh sách phường/xã'))
      .finally(() => active && setLoadingWards(false));
    return () => {
      active = false;
    };
  }, [value.addressProvinceCode]);

  function handleProvince(code: string) {
    const name = provinces.find((p) => p.code === code)?.name ?? '';
    // Đổi tỉnh -> reset phường/xã đang chọn.
    onChange({
      addressProvinceCode: code,
      addressProvinceName: name,
      addressWardCode: '',
      addressWardName: '',
    });
  }

  function handleWard(code: string) {
    const name = wards.find((w) => w.code === code)?.name ?? '';
    onChange({ addressWardCode: code, addressWardName: name });
  }

  const preview = formatAddress({
    street: value.addressStreet,
    wardName: value.addressWardName,
    provinceName: value.addressProvinceName,
  });

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Tỉnh / Thành phố">
          <Select value={value.addressProvinceCode} onValueChange={handleProvince}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn tỉnh/thành" />
            </SelectTrigger>
            <SelectContent>
              {provinces.map((p) => (
                <SelectItem key={p.code} value={p.code}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="Phường / Xã">
          <Select
            value={value.addressWardCode}
            onValueChange={handleWard}
            disabled={!value.addressProvinceCode || loadingWards}
          >
            <SelectTrigger>
              <SelectValue placeholder={loadingWards ? 'Đang tải...' : 'Chọn phường/xã'} />
            </SelectTrigger>
            <SelectContent>
              {wards.map((w) => (
                <SelectItem key={w.code} value={w.code}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <FormField label="Số nhà / Đường">
        <Input
          value={value.addressStreet}
          onChange={(e) => onChange({ addressStreet: e.target.value })}
          placeholder="VD: 12 Nguyễn Trãi"
        />
      </FormField>

      {preview && (
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
            Địa chỉ sẽ lưu
          </div>
          <div className="text-sm font-medium text-slate-700">{preview}</div>
        </div>
      )}
    </div>
  );
}
