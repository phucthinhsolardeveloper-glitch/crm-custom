'use client';

import { useState } from 'react';
import { Minimize2 } from 'lucide-react';
import { useOmiCall } from '@/providers/omicall-provider';
import { CallTimer } from '@/components/call/call-timer';
import { CallControls } from '@/components/call/call-controls';
import { CallLeadInfo } from '@/components/call/call-lead-info';
import { CallKeypad } from '@/components/call/call-keypad';
import { formatPhoneDisplay } from '@crm/utils';

interface CallActiveProps {
  call: CallState;
}

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

export function CallActive({ call }: CallActiveProps) {
  const { minimizeCall } = useOmiCall();
  const [showKeypad, setShowKeypad] = useState(false);

  const phone = formatPhoneDisplay(call.callData.remoteNumber);
  const name = call.contactInfo?.name ?? phone;
  const initials = call.contactInfo ? getInitials(call.contactInfo.name) : phone.slice(0, 2);
  const isLead = call.contactInfo?.type === 'LEAD';
  const hasContact = !!call.contactInfo;

  const minimizeBtn = (
    <button
      onClick={() => minimizeCall(call.uid)}
      title="Thu nhỏ"
      className="absolute right-4 top-4 z-10 flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
    >
      <Minimize2 className="h-[19px] w-[19px]" />
    </button>
  );

  const leftColumn = (
    <>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[1.2px] text-slate-400">Đang gọi</p>
      <div className={`mb-3.5 flex h-20 w-20 items-center justify-center rounded-full text-[28px] font-bold text-white shadow-[0_12px_30px_-8px_rgba(14,165,233,0.5)] ${
        hasContact ? 'bg-gradient-to-br from-sky-500 to-cyan-500' : 'bg-gradient-to-br from-slate-400 to-slate-300'
      }`}>
        {initials}
      </div>
      <h2 className="mb-1 text-[19px] font-bold tracking-tight text-slate-900">{name}</h2>
      <p className="mb-2.5 text-[15px] font-medium tabular-nums text-slate-500">{phone}</p>
      {hasContact ? (
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
          isLead ? 'bg-sky-50 text-sky-700' : 'bg-emerald-50 text-emerald-700'
        }`}>
          {isLead ? 'Lead' : 'Khách hàng'}
        </span>
      ) : (
        <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          Không tìm thấy
        </span>
      )}
      <CallTimer startTs={call.callData.startTs} className="my-[18px] block text-[40px] font-bold tabular-nums tracking-wide text-slate-900" />

      {showKeypad && <CallKeypad call={call} />}

      <CallControls call={call} showKeypad={showKeypad} onToggleKeypad={() => setShowKeypad((v) => !v)} />
    </>
  );

  // 2 cột khi có contact
  if (hasContact) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-6 backdrop-blur-sm">
        <div className="relative flex max-h-[92vh] w-[880px] max-w-[96vw] overflow-hidden rounded-3xl bg-white shadow-[0_30px_70px_-20px_rgba(15,23,42,0.4)]">
          {minimizeBtn}
          <div className="relative flex w-[340px] min-w-[310px] flex-col items-center justify-center border-r border-slate-200 bg-gradient-to-b from-slate-50 to-blue-50 px-[30px] py-9">
            <div className="absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-sky-500 to-cyan-500" />
            {leftColumn}
          </div>
          <div className="flex-1 overflow-y-auto p-7">
            <CallLeadInfo call={call} />
          </div>
        </div>
      </div>
    );
  }

  // 1 cột - SĐT lạ
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-6 backdrop-blur-sm">
      <div className="relative w-[384px] max-w-[92vw] overflow-hidden rounded-3xl bg-white p-9 text-center shadow-[0_30px_70px_-20px_rgba(15,23,42,0.4)]">
        <div className="absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-sky-500 to-cyan-500" />
        {minimizeBtn}
        <div className="flex flex-col items-center">{leftColumn}</div>
      </div>
    </div>
  );
}
