'use client';

import { SettingsCrudList } from '@/components/settings/settings-crud-list';
import { invalidateOrderCaches } from '@/components/orders/create-order-dialog';
import type { SettingsItem } from '@/types/entities';

interface BankAccountSettingsProps {
  data: SettingsItem[];
  canEdit: boolean;
}

/** Đọc field text từ SettingsItem (index trả về unknown). */
function str(item: SettingsItem, key: string): string {
  const v = item[key];
  return typeof v === 'string' ? v : '';
}

/** Badge 1 dòng cho 1 tài khoản: thông tin TK + loại THU/CHI + status + nhãn màu. */
function renderBankAccount(item: SettingsItem) {
  const bank = str(item, 'bankName');
  const accountNumber = str(item, 'accountNumber');
  const holder = str(item, 'accountHolder');
  const direction = str(item, 'direction') || 'THU';
  const label = str(item, 'label');
  const labelColor = str(item, 'labelColor') || '#6b7280';
  const isActive = item['isActive'] !== false; // mặc định coi như active nếu thiếu

  const isThu = direction === 'THU';

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {/* Tên + ngân hàng */}
      <span className="text-sm font-semibold text-slate-900">{bank || item.name}</span>
      {bank && <span className="text-xs text-slate-400">({item.name})</span>}

      {/* Số TK + chủ TK */}
      {accountNumber && <span className="text-xs text-slate-500">{accountNumber}</span>}
      {holder && <span className="text-xs text-slate-400">- {holder}</span>}

      {/* Loại THU/CHI */}
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
          isThu ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'
        }`}
      >
        {isThu ? 'THU' : 'CHI'}
      </span>

      {/* Status */}
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
          isActive ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-500'
        }`}
      >
        {isActive ? 'ACTIVE' : 'DEACTIVE'}
      </span>

      {/* Nhãn màu */}
      {label && (
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
          style={{ backgroundColor: labelColor }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

export function BankAccountSettings({ data, canEdit }: BankAccountSettingsProps) {
  return (
    <SettingsCrudList
      data={data}
      endpoint="/bank-accounts"
      entityName="Tài khoản ngân hàng"
      canEdit={canEdit}
      onMutate={invalidateOrderCaches}
      renderItem={renderBankAccount}
      fields={[
        { key: 'name', label: 'Tên hiển thị', required: true, placeholder: 'VD: ACB 6688, VCB Mastercard' },
        { key: 'bankName', label: 'Ngân hàng', placeholder: 'VD: ACB, VIB, VCB, TCB' },
        { key: 'accountNumber', label: 'Số tài khoản', placeholder: 'VD: 626636688' },
        { key: 'accountHolder', label: 'Tên chủ tài khoản', placeholder: 'VD: CONG TY TNHH ... TAKI' },
        {
          key: 'direction',
          label: 'Loại',
          type: 'select',
          options: [
            { value: 'THU', label: 'THU - Nhận tiền' },
            { value: 'CHI', label: 'CHI - Chi tiền' },
          ],
        },
        { key: 'label', label: 'Nhãn', placeholder: 'VD: Khoá học, tool (Sale chốt)' },
        { key: 'labelColor', label: 'Màu nhãn', type: 'color', randomColorDefault: true },
        { key: 'isActive', label: 'Trạng thái', type: 'checkbox', placeholder: 'Đang hoạt động (ACTIVE)', defaultChecked: true },
      ]}
    />
  );
}
