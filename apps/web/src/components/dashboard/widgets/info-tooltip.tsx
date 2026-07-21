'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';

interface InfoTooltipProps {
  text: string;
  /** Đặt true khi nằm trên nền gradient (text trắng) - đổi màu icon cho đủ tương phản. */
  onGradient?: boolean;
  /** Hướng bung tooltip. Dùng 'bottom' khi icon nằm sát mép trên trang (vd hàng KPI). */
  side?: 'top' | 'bottom';
}

/**
 * Icon (i) + tooltip giải thích chỉ số. Hoạt động cả hover (desktop)
 * lẫn tap (mobile - toggle state vì không có hover). Pure CSS positioning,
 * không thêm dependency - cùng pattern với tooltip miniBar của KpiCard.
 * Vùng tap mở rộng ~44px qua pseudo-element để đạt chuẩn touch target.
 */
export function InfoTooltip({ text, onGradient, side = 'top' }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const sideCls = side === 'top' ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]';

  return (
    <span className="group/info relative inline-flex">
      <button
        type="button"
        aria-label="Giải thích chỉ số"
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        onBlur={() => setOpen(false)}
        className={`relative inline-flex h-4 w-4 items-center justify-center rounded-full transition-colors
          after:absolute after:-inset-3.5 after:content-['']
          ${onGradient ? 'text-white/70 hover:text-white' : 'text-slate-300 hover:text-sky-500'}`}
      >
        <Info className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>
      <span
        role="tooltip"
        aria-hidden={!open}
        className={`pointer-events-none absolute ${sideCls} left-1/2 z-30 w-56 -translate-x-1/2
          rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-medium normal-case leading-5 tracking-normal text-white shadow-xl
          transition-opacity duration-150 group-hover/info:opacity-100 ${open ? 'opacity-100' : 'opacity-0'}`}
      >
        {text}
      </span>
    </span>
  );
}
