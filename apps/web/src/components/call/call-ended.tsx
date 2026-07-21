'use client';

import { useState, useEffect, useRef } from 'react';
import { Check, PhoneOff } from 'lucide-react';
import { useOmiCall } from '@/providers/omicall-provider';
import { CallLeadInfo } from '@/components/call/call-lead-info';
import { formatPhoneDisplay } from '@crm/utils';

interface CallEndedProps {
  call: CallState;
}

// Tong thoi gian giu man ket thuc mo truoc khi tu luu + dong (giay).
const AUTO_CLOSE_SECONDS = 30;

/**
 * Man hinh sau khi cuoc goi ket thuc (chi dung khi co contact + dang mo).
 * Giu o ghi chu mo de sale viet/sua tiep. Bam Luu -> luu + dong ngay.
 * De yen het AUTO_CLOSE_SECONDS -> tu luu note (neu co) + dong.
 */
export function CallEnded({ call }: CallEndedProps) {
  const { closeCall, flushNote } = useOmiCall();
  const [secs, setSecs] = useState(AUTO_CLOSE_SECONDS);
  const doneRef = useRef(false);

  // Dem nguoc moi giay.
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  // Het gio -> tu luu note + dong. doneRef chong goi 2 lan.
  useEffect(() => {
    if (secs === 0 && !doneRef.current) {
      doneRef.current = true;
      flushNote(call.uid);
      closeCall(call.uid);
    }
  }, [secs, call.uid, flushNote, closeCall]);

  const phone = formatPhoneDisplay(call.callData.remoteNumber);
  const name = call.contactInfo?.name ?? phone;
  const duration = call.callData.callingDuration;
  const mins = Math.floor((duration?.value ?? 0) / 60);
  const secsDur = (duration?.value ?? 0) % 60;

  const closeNow = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    flushNote(call.uid);
    closeCall(call.uid);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-6 backdrop-blur-sm">
      <div className="relative flex max-h-[92vh] w-[880px] max-w-[96vw] overflow-hidden rounded-3xl bg-white shadow-[0_30px_70px_-20px_rgba(15,23,42,0.4)]">
        <div className="relative flex w-[340px] min-w-[310px] flex-col items-center justify-center border-r border-slate-200 bg-gradient-to-b from-slate-50 to-blue-50 px-[30px] py-9 text-center">
          <div className="absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-sky-500 to-cyan-500" />

          <div className="mb-[18px] flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
            <Check className="h-8 w-8 text-emerald-600" strokeWidth={2.5} />
          </div>

          <h2 className="text-[19px] font-bold tracking-tight text-slate-900">Cuộc gọi kết thúc</h2>
          <p className="mt-1.5 text-sm font-medium text-slate-500">{name}</p>
          <p className="text-[13px] font-medium tabular-nums text-slate-400">{phone}</p>
          <p className="mt-2.5 text-sm font-semibold tabular-nums text-slate-600">
            Thời lượng: {mins} phút {secsDur} giây
          </p>

          <div className="mt-6 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Tự lưu &amp; đóng sau</p>
            <p className="mt-1 text-[28px] font-bold tabular-nums text-sky-600">{secs}s</p>
          </div>

          <button
            onClick={closeNow}
            className="mt-5 inline-flex items-center gap-2 rounded-[12px] bg-slate-100 px-5 py-2.5 text-[13px] font-bold text-slate-600 transition-colors hover:bg-slate-200"
          >
            <PhoneOff className="h-4 w-4" />
            Đóng ngay
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-7">
          <CallLeadInfo call={call} onAfterSave={closeNow} />
        </div>
      </div>
    </div>
  );
}
