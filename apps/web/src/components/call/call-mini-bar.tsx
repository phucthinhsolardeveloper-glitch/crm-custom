'use client';

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { useOmiCall } from '@/providers/omicall-provider';
import { PhoneOff, Mic, MicOff, Maximize2 } from 'lucide-react';
import { CallTimer } from '@/components/call/call-timer';
import { formatPhoneDisplay } from '@crm/utils';

export function CallMiniBar() {
  const { activeCalls, endCall, toggleMute, maximizeCall } = useOmiCall();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const minimizedCalls = activeCalls.filter((c) => c.isMinimized && c.phase !== 'ended');
  if (!mounted || minimizedCalls.length === 0) return null;

  const call = minimizedCalls[0];
  const phone = formatPhoneDisplay(call.callData.remoteNumber);
  const name = call.contactInfo?.name ?? phone;

  return createPortal(
    <div className="fixed bottom-5 left-5 right-5 z-50 flex justify-center">
      <div className="flex w-full max-w-[460px] items-center gap-4 rounded-[18px] border border-slate-200 bg-white px-[18px] py-[13px] shadow-[0_18px_45px_-12px_rgba(15,23,42,0.3)]">
        <div className="h-[9px] w-[9px] shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)] animate-[call-dot-pulse_2s_ease-in-out_infinite]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-slate-900">{name} &middot; {phone}</p>
          <CallTimer startTs={call.callData.startTs} className="text-xs tabular-nums text-slate-500" />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => toggleMute(call.uid)}
            title={call.isMuted ? 'Bật mic' : 'Tắt mic'}
            className={`flex h-[38px] w-[38px] items-center justify-center rounded-xl border transition-colors ${
              call.isMuted
                ? 'border-transparent bg-gradient-to-br from-sky-500 to-cyan-500 text-white'
                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100'
            }`}
          >
            {call.isMuted ? <MicOff className="h-[17px] w-[17px]" /> : <Mic className="h-[17px] w-[17px]" />}
          </button>
          <button
            onClick={() => endCall(call.uid)}
            title="Kết thúc"
            className="flex h-[38px] w-[38px] items-center justify-center rounded-xl border-transparent bg-gradient-to-br from-rose-500 to-rose-600 text-white"
          >
            <PhoneOff className="h-[17px] w-[17px]" />
          </button>
          <button
            onClick={() => maximizeCall(call.uid)}
            title="Mở rộng"
            className="flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100"
          >
            <Maximize2 className="h-[17px] w-[17px]" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
