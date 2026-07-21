'use client';

import { Phone } from 'lucide-react';
import { useOmiCall } from '@/providers/omicall-provider';

interface LeadDetailCallButtonProps {
  /** SDT can goi. */
  phone: string;
  /** Ten lead - hien thi tren popup cuoc goi OmiCall. */
  leadName?: string;
}

/**
 * Nut goi qua tong dai OmiCall cho trang chi tiet lead.
 * Tach rieng client component vi trang chi tiet la server component,
 * trong khi useOmiCall (WebRTC) chi chay duoc o trinh duyet.
 */
export function LeadDetailCallButton({ phone, leadName }: LeadDetailCallButtonProps) {
  const { makeCall, isReady } = useOmiCall();

  return (
    <button
      type="button"
      onClick={() => makeCall(phone, leadName)}
      disabled={!isReady}
      title={isReady ? 'Goi dien qua tong dai' : 'Tong dai chua ket noi'}
      className="inline-flex items-center gap-1.5 rounded-md bg-sky-50 px-2.5 py-1 text-sm font-medium text-sky-600 hover:bg-sky-100 hover:text-sky-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-sky-50"
    >
      <Phone className="h-3.5 w-3.5" />
      Goi
    </button>
  );
}
