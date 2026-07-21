'use client';

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { useOmiCall } from '@/providers/omicall-provider';
import { CallIncoming } from '@/components/call/call-incoming';
import { CallActive } from '@/components/call/call-active';
import { CallEnded } from '@/components/call/call-ended';
import { formatPhoneDisplay } from '@crm/utils';
import { PhoneOff, Check } from 'lucide-react';

export function CallOverlay() {
  const { activeCalls } = useOmiCall();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted || activeCalls.length === 0) return null;

  const primaryCall = activeCalls.find((c) => !c.isMinimized) ?? null;
  if (!primaryCall) return null;

  const content = (() => {
    switch (primaryCall.phase) {
      case 'ringing':
        return primaryCall.direction === 'inbound'
          ? <CallIncoming call={primaryCall} />
          : <ConnectingScreen call={primaryCall} />;
      case 'connecting':
        return <ConnectingScreen call={primaryCall} />;
      case 'ended':
        // Co contact -> man ket thuc co o ghi chu + countdown 30s.
        // SDT la -> man bao ket thuc don gian (tu dong dong sau 3s o provider).
        return primaryCall.contactInfo
          ? <CallEnded call={primaryCall} />
          : <EndedScreen call={primaryCall} />;
      case 'accepted':
        return <CallActive call={primaryCall} />;
      default:
        return null;
    }
  })();

  return createPortal(content, document.body);
}

function ConnectingScreen({ call }: { call: CallState }) {
  const { endCall } = useOmiCall();
  const phone = formatPhoneDisplay(call.callData.remoteNumber);
  const name = call.contactInfo?.name;
  const initials = name
    ? name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : phone.slice(0, 2);
  const isLead = call.contactInfo?.type === 'LEAD';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-sm">
      <div className="relative w-[384px] max-w-[92vw] overflow-hidden rounded-3xl bg-white p-9 text-center shadow-[0_30px_70px_-20px_rgba(15,23,42,0.4)]">
        <div className="absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-sky-500 to-cyan-500" />

        <p className="mb-3.5 text-xs font-semibold uppercase tracking-[1.2px] text-slate-400">
          Đang kết nối
          <span className="inline-flex">
            <span className="animate-[blink_1.4s_infinite_both]">.</span>
            <span className="animate-[blink_1.4s_infinite_both_0.2s]">.</span>
            <span className="animate-[blink_1.4s_infinite_both_0.4s]">.</span>
          </span>
        </p>

        <div className="mx-auto mb-5 flex h-[100px] w-[100px] items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-cyan-500 text-4xl font-bold text-white shadow-[0_12px_30px_-8px_rgba(14,165,233,0.5)]">
          {initials}
        </div>

        <h2 className="mb-1 text-[23px] font-bold tracking-tight text-slate-900">{name ?? phone}</h2>
        <p className="mb-3.5 text-[15px] font-medium tabular-nums text-slate-500">{phone}</p>

        {call.contactInfo && (
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
            isLead ? 'bg-sky-50 text-sky-700' : 'bg-emerald-50 text-emerald-700'
          }`}>
            {isLead ? 'Lead' : 'Khách hàng'}
          </span>
        )}

        <div className="mt-7">
          <button
            onClick={() => endCall(call.uid)}
            className="mx-auto flex h-[66px] w-[66px] items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-rose-600 shadow-[0_10px_24px_-6px_rgba(244,63,94,0.45)] transition-transform hover:scale-110 active:scale-95"
          >
            <PhoneOff className="h-7 w-7 text-white" />
          </button>
          <span className="mt-2.5 block text-xs font-semibold text-slate-500">Hủy cuộc gọi</span>
        </div>
      </div>
    </div>
  );
}

function EndedScreen({ call }: { call: CallState }) {
  const duration = call.callData.callingDuration;
  const mins = Math.floor((duration?.value ?? 0) / 60);
  const secs = (duration?.value ?? 0) % 60;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-sm">
      <div className="relative w-[384px] max-w-[92vw] overflow-hidden rounded-3xl bg-white p-9 text-center shadow-[0_30px_70px_-20px_rgba(15,23,42,0.4)]">
        <div className="absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-sky-500 to-cyan-500" />
        <div className="mx-auto mb-[18px] flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
          <Check className="h-8 w-8 text-emerald-600" strokeWidth={2.5} />
        </div>
        <h2 className="text-[19px] font-bold text-slate-900">Cuộc gọi kết thúc</h2>
        <p className="mt-1.5 text-sm font-medium text-slate-500">
          Thời lượng: {mins} phút {secs} giây
        </p>
        {call.noteText.trim() && (
          <p className="mt-2.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-emerald-600">
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> Ghi chú đã lưu tự động
          </p>
        )}
        <p className="mt-5 text-xs text-slate-300">Tự động đóng sau 3 giây...</p>
      </div>
    </div>
  );
}
