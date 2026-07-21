'use client';

import { useOmiCall } from '@/providers/omicall-provider';

const CONFIG: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  connected: { dot: 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]', bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Tổng đài' },
  connecting: { dot: 'bg-amber-500 animate-[call-dot-pulse_1s_ease-in-out_infinite]', bg: 'bg-amber-50', text: 'text-amber-700', label: 'Đang kết nối...' },
  disconnected: { dot: 'bg-red-500', bg: 'bg-red-50', text: 'text-red-700', label: 'Mất kết nối' },
  error: { dot: 'bg-red-500', bg: 'bg-red-50', text: 'text-red-700', label: 'Chưa kết nối mic' },
};

export function CallStatusIndicator() {
  const { status, error, recheckMic } = useOmiCall();

  if (status === 'idle' || status === 'loading') return null;

  const cfg = CONFIG[status] ?? CONFIG.error;
  const clickable = status === 'error'; // chua ket noi mic -> bam de kiem tra lai

  const base = `inline-flex items-center gap-[7px] rounded-full px-3.5 py-[5px] text-xs font-semibold ${cfg.bg} ${cfg.text}`;
  const dot = <span className={`h-[7px] w-[7px] rounded-full ${cfg.dot}`} />;

  if (clickable) {
    return (
      <button
        type="button"
        onClick={recheckMic}
        className={`${base} cursor-pointer transition hover:brightness-95`}
        title="Bấm để kiểm tra lại kết nối mic"
      >
        {dot}
        {cfg.label}
      </button>
    );
  }

  return (
    <div className={base} title={error ?? undefined}>
      {dot}
      {cfg.label}
    </div>
  );
}
