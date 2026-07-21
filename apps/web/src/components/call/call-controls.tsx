'use client';

import { MicOff, Mic, Pause, Play, Grid3X3, PhoneOff } from 'lucide-react';
import { useOmiCall } from '@/providers/omicall-provider';

interface CallControlsProps {
  call: CallState;
  showKeypad: boolean;
  onToggleKeypad: () => void;
}

export function CallControls({ call, showKeypad, onToggleKeypad }: CallControlsProps) {
  const { endCall, toggleMute, toggleHold } = useOmiCall();

  const controls = [
    {
      icon: call.isMuted ? <MicOff className="h-[22px] w-[22px]" /> : <Mic className="h-[22px] w-[22px]" />,
      label: call.isMuted ? 'Bật mic' : 'Tắt mic',
      active: call.isMuted,
      onClick: () => toggleMute(call.uid),
    },
    {
      icon: call.isOnHold ? <Play className="h-[22px] w-[22px]" /> : <Pause className="h-[22px] w-[22px]" />,
      label: call.isOnHold ? 'Tiếp tục' : 'Giữ máy',
      active: call.isOnHold,
      onClick: () => toggleHold(call.uid),
    },
    {
      icon: <Grid3X3 className="h-[22px] w-[22px]" />,
      label: 'Bàn phím',
      active: showKeypad,
      onClick: onToggleKeypad,
    },
  ];

  return (
    <div className="flex flex-col items-center gap-[18px]">
      <div className="flex gap-3.5">
        {controls.map((ctrl) => (
          <div key={ctrl.label} className="text-center">
            <button
              onClick={ctrl.onClick}
              className={`flex h-[58px] w-[58px] items-center justify-center rounded-[18px] border transition-all hover:-translate-y-px active:scale-95 ${
                ctrl.active
                  ? 'border-transparent bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-[0_6px_16px_-4px_rgba(14,165,233,0.5)]'
                  : 'border-slate-200 bg-white text-slate-500 shadow-[0_2px_6px_-2px_rgba(15,23,42,0.08)] hover:bg-slate-50 hover:shadow-[0_4px_12px_-4px_rgba(15,23,42,0.15)]'
              }`}
            >
              {ctrl.icon}
            </button>
            <span className="mt-2 block text-[11px] font-semibold text-slate-500">{ctrl.label}</span>
          </div>
        ))}
      </div>

      <div className="text-center">
        <button
          onClick={() => endCall(call.uid)}
          className="flex h-[58px] w-[58px] items-center justify-center rounded-[18px] border-transparent bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-[0_6px_16px_-4px_rgba(244,63,94,0.5)] transition-all hover:brightness-105 active:scale-95"
        >
          <PhoneOff className="h-[22px] w-[22px]" />
        </button>
        <span className="mt-2 block text-[11px] font-semibold text-slate-500">Kết thúc</span>
      </div>
    </div>
  );
}
