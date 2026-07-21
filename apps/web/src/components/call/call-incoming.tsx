'use client';

import { Phone, PhoneOff } from 'lucide-react';
import { useOmiCall } from '@/providers/omicall-provider';
import { formatPhoneDisplay } from '@crm/utils';

interface CallIncomingProps {
  call: CallState;
}

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

export function CallIncoming({ call }: CallIncomingProps) {
  const { acceptCall, declineCall } = useOmiCall();
  const phone = formatPhoneDisplay(call.callData.remoteNumber);
  const isLead = call.contactInfo?.type === 'LEAD';
  const initials = call.contactInfo ? getInitials(call.contactInfo.name) : '?';

  const detail = call.leadDetail;
  const metaParts: string[] = [];
  if (detail?.product) metaParts.push(detail.product.name);
  if (detail?.source) metaParts.push(detail.source.name);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-sm">
      <div className="relative w-[384px] max-w-[92vw] overflow-hidden rounded-3xl bg-white p-9 text-center shadow-[0_30px_70px_-20px_rgba(15,23,42,0.4)]">
        <div className="absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-sky-500 to-cyan-500" />

        <p className="mb-3.5 text-xs font-semibold uppercase tracking-[1.2px] text-slate-400">
          Cuộc gọi đến
        </p>

        <div className="mx-auto mb-5 flex h-[100px] w-[100px] items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-cyan-500 text-4xl font-bold text-white shadow-[0_12px_30px_-8px_rgba(14,165,233,0.5)] animate-[pulse-ring_2s_ease-out_infinite]">
          {initials}
        </div>

        <h2 className="mb-1 text-[23px] font-bold tracking-tight text-slate-900">
          {call.contactInfo?.name ?? phone}
        </h2>
        <p className="mb-3.5 text-[15px] font-medium tabular-nums text-slate-500">{phone}</p>

        {call.contactInfo ? (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
            isLead ? 'bg-sky-50 text-sky-700' : 'bg-emerald-50 text-emerald-700'
          }`}>
            {isLead ? 'Lead' : 'Khách hàng'}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Số lạ
          </span>
        )}

        {/* Thông tin nhanh */}
        {(metaParts.length > 0 || detail?.label) && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-[13px] text-slate-600">
            {metaParts.length > 0 && (
              <div><span className="font-semibold text-slate-900">{metaParts[0]}</span>{metaParts[1] ? ` · ${metaParts[1]}` : ''}</div>
            )}
            {detail?.label && (
              <div className="mt-1">
                Nhãn: <span className="ml-1 inline-block rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{detail.label.name}</span>
              </div>
            )}
          </div>
        )}

        {/* Nghe / Từ chối */}
        <div className="mt-7 flex items-center justify-center gap-14">
          <div className="text-center">
            <button
              onClick={() => declineCall(call.uid)}
              className="flex h-[66px] w-[66px] items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-rose-600 shadow-[0_10px_24px_-6px_rgba(244,63,94,0.45)] transition-transform hover:scale-110 active:scale-95"
            >
              <PhoneOff className="h-7 w-7 text-white" />
            </button>
            <span className="mt-2.5 block text-xs font-semibold text-slate-500">Từ chối</span>
          </div>
          <div className="text-center">
            <button
              onClick={() => acceptCall(call.uid)}
              className="flex h-[66px] w-[66px] items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-green-600 shadow-[0_10px_24px_-6px_rgba(16,185,129,0.5)] transition-transform hover:scale-110 active:scale-95 animate-[accept-glow_2s_ease-in-out_infinite]"
            >
              <Phone className="h-7 w-7 text-white" />
            </button>
            <span className="mt-2.5 block text-xs font-semibold text-slate-500">Nghe máy</span>
          </div>
        </div>
      </div>
    </div>
  );
}
