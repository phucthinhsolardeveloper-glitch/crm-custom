'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/shared/form-field';
import { api } from '@/lib/api-client';
import type { NamedEntity } from '@/types/entities';

/** Giá trị các field payment sửa được (string cho input/select, dễ bind). */
export interface PaymentEditValue {
  installmentId: string;
  amount: string;
  transferDate: string;      // YYYY-MM-DD
  paymentTypeId: string;
  bankAccountId: string;
  transferContent: string;
  notes: string;
  status: string;            // chỉ để hiển thị - biết có khoá amount không
}

interface Props {
  value: PaymentEditValue;
  onChange: (patch: Partial<PaymentEditValue>) => void;
}

function toList(raw: unknown): NamedEntity[] {
  const arr = Array.isArray(raw) ? raw : (raw as { data?: unknown })?.data;
  if (!Array.isArray(arr)) return [];
  return arr.map((x) => ({ id: String((x as { id: unknown }).id), name: String((x as { name?: unknown }).name ?? '') }));
}

/**
 * Section sửa thông tin THANH TOÁN (payment) trong dialog sửa đơn.
 * Thuần hiển thị: nhận value + onChange, không tự lưu (dialog cha submit PATCH /payments).
 * amount bị khoá khi payment đã VERIFIED/REJECTED/REFUNDED (chỉ sửa được khi PENDING).
 */
export function EditPaymentSection({ value, onChange }: Props) {
  const [paymentTypes, setPaymentTypes] = useState<NamedEntity[]>([]);
  const [banks, setBanks] = useState<NamedEntity[]>([]);
  const [installments, setInstallments] = useState<NamedEntity[]>([]);

  useEffect(() => {
    api.get('/payment-types').then((r) => setPaymentTypes(toList(r))).catch(() => {});
    api.get('/bank-accounts').then((r) => setBanks(toList(r))).catch(() => {});
    api.get('/payment-installments').then((r) => setInstallments(toList(r))).catch(() => {});
  }, []);

  const amountLocked = value.status !== 'PENDING';

  return (
    <div className="border-t border-slate-200 pt-3">
      <p className="text-sm font-semibold text-slate-700 mb-3">Thông tin thanh toán</p>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Đợt TT">
          <Select value={value.installmentId} onValueChange={(v) => onChange({ installmentId: v })}>
            <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
            <SelectContent>
              {installments.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label={amountLocked ? 'Doanh thu (khoá - đã xác minh)' : 'Doanh thu về cty'}>
          {amountLocked ? (
            <Input value={value.amount} disabled readOnly />
          ) : (
            <MoneyInput value={value.amount} onChange={(v) => onChange({ amount: v })} placeholder="Số tiền CK" />
          )}
        </FormField>
        <FormField label="Ngày CK">
          <Input type="date" value={value.transferDate} onChange={(e) => onChange({ transferDate: e.target.value })} />
        </FormField>
        <FormField label="Hình thức CK">
          <Select value={value.paymentTypeId} onValueChange={(v) => onChange({ paymentTypeId: v })}>
            <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
            <SelectContent>
              {paymentTypes.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Ngân hàng">
          <Select value={value.bankAccountId} onValueChange={(v) => onChange({ bankAccountId: v })}>
            <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
            <SelectContent>
              {banks.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Nội dung CK">
          <Input value={value.transferContent} onChange={(e) => onChange({ transferContent: e.target.value })} placeholder="Nội dung CK" />
        </FormField>
        <FormField label="Ghi chú thanh toán" className="col-span-2">
          <Textarea value={value.notes} onChange={(e) => onChange({ notes: e.target.value })} rows={2} placeholder="Ghi chú thanh toán..." />
        </FormField>
      </div>
    </div>
  );
}
