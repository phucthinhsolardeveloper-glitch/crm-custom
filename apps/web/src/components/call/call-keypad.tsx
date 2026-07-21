'use client';

import { useState } from 'react';
import { useOmiCall } from '@/providers/omicall-provider';

interface CallKeypadProps {
  call: CallState;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

export function CallKeypad({ call }: CallKeypadProps) {
  const { sendDtmf } = useOmiCall();
  const [digits, setDigits] = useState('');

  const press = (tone: string) => {
    sendDtmf(call.uid, tone);
    setDigits((d) => d + tone);
  };

  return (
    <div className="mb-5 w-full rounded-[18px] border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 min-h-[30px] text-center text-[22px] font-bold tabular-nums tracking-[5px] text-sky-700">
        {digits || ' '}
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {KEYS.map((key) => (
          <button
            key={key}
            onClick={() => press(key)}
            className="h-[50px] rounded-[14px] border border-slate-200 bg-white text-xl font-semibold text-slate-800 transition-all hover:bg-slate-100 active:scale-95 active:bg-sky-50 active:text-sky-700"
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  );
}
