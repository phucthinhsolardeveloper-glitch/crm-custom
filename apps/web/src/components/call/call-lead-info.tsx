'use client';

import { useRef, useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useOmiCall } from '@/providers/omicall-provider';
import { api } from '@/lib/api-client';
import { formatPhoneDisplay, detectCarrier, CARRIER_LABEL } from '@crm/utils';

interface CallLeadInfoProps {
  call: CallState;
  // Goi sau khi bam Luu (dung o man ket thuc de dong cua so ngay sau khi luu).
  onAfterSave?: () => void;
}

const carrierColor: Record<string, string> = {
  VIETTEL: 'bg-red-50 text-red-700',
  MOBI: 'bg-blue-50 text-blue-700',
  VINA: 'bg-emerald-50 text-emerald-700',
  VIETNAMOBILE: 'bg-orange-50 text-orange-700',
  GMOBILE: 'bg-purple-50 text-purple-700',
  ITELECOM: 'bg-slate-100 text-slate-600',
};

const statusLabel: Record<string, { text: string; cls: string }> = {
  POOL: { text: 'Kho mới', cls: 'bg-slate-100 text-slate-600' },
  ASSIGNED: { text: 'Đã phân', cls: 'bg-sky-50 text-sky-700' },
  IN_PROGRESS: { text: 'Đang xử lý', cls: 'bg-emerald-50 text-emerald-700' },
  CONVERTED: { text: 'Đã chuyển đổi', cls: 'bg-green-50 text-green-700' },
  LOST: { text: 'Mất', cls: 'bg-red-50 text-red-700' },
  FLOATING: { text: 'Thả nổi', cls: 'bg-violet-50 text-violet-700' },
  ACTIVE: { text: 'Đang chăm sóc', cls: 'bg-emerald-50 text-emerald-700' },
  INACTIVE: { text: 'Không hoạt động', cls: 'bg-slate-100 text-slate-600' },
};

export function CallLeadInfo({ call, onAfterSave }: CallLeadInfoProps) {
  const { updateNoteText } = useOmiCall();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const detail = call.leadDetail;
  const contact = call.contactInfo;

  useEffect(() => {
    if (textareaRef.current && call.noteText) {
      textareaRef.current.value = call.noteText;
    }
  }, [call.uid]);

  if (!contact) return null;

  const phone = detail?.phone ? formatPhoneDisplay(detail.phone) : null;
  const carrier = detail?.phone ? detectCarrier(detail.phone) : null;
  const detailUrl = contact.type === 'LEAD' ? `/leads` : `/customers`;
  const st = detail?.status ? statusLabel[detail.status] : null;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-[18px] flex items-center justify-between border-b border-slate-200 pb-4">
        <h3 className="text-base font-bold text-slate-900">Thông tin liên hệ</h3>
        <a
          href={detailUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-[10px] bg-sky-50 px-3.5 py-[7px] text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-100"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Xem chi tiết
        </a>
      </div>

      {!detail && (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500" />
          <span className="ml-2 text-sm text-slate-400">Đang tải...</span>
        </div>
      )}

      {detail && (
        <div className="flex-1 space-y-1 overflow-y-auto pr-1">
          <SectionTitle>Thông tin cơ bản</SectionTitle>
          <Field label="Tên" value={detail.name} />
          {phone && (
            <Field label="SĐT">
              <span className="tabular-nums">{phone}</span>
              {carrier && (
                <span className={`ml-2 inline-block rounded-md px-[7px] py-0.5 text-[10px] font-semibold ${carrierColor[carrier] ?? ''}`}>
                  {CARRIER_LABEL[carrier]}
                </span>
              )}
            </Field>
          )}
          {detail.email && <Field label="Email" value={detail.email} />}
          {detail.companyName && <Field label="Công ty" value={detail.companyName} />}

          <SectionTitle>Sản phẩm & Phân loại</SectionTitle>
          {detail.product && <Field label="Sản phẩm"><Tag cls="bg-sky-50 text-sky-700">{detail.product.name}</Tag></Field>}
          {detail.source && <Field label="Nguồn"><Tag cls="bg-violet-50 text-violet-700">{detail.source.name}</Tag></Field>}
          {detail.label && <Field label="Nhãn"><Tag cls="bg-amber-100 text-amber-700">{detail.label.name}</Tag></Field>}
          {st && <Field label="Trạng thái"><Tag cls={st.cls}>{st.text}</Tag></Field>}

          {detail.recentNotes.length > 0 && (
            <>
              <SectionTitle>Ghi chú gần nhất</SectionTitle>
              {detail.recentNotes.map((note, i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-[11px] text-[12.5px] leading-relaxed text-slate-600">
                  <p className="mb-1 text-[11px] font-semibold text-slate-400">
                    {note.userName} &middot; {formatDate(note.createdAt)}
                  </p>
                  {note.content}
                </div>
              ))}
            </>
          )}

          <SectionTitle>Ghi chú cuộc gọi này</SectionTitle>
          <div className="rounded-[14px] border-[1.5px] border-slate-200 bg-white p-3.5 transition-all focus-within:border-sky-500 focus-within:shadow-[0_0_0_3px_rgba(14,165,233,0.12)]">
            <textarea
              ref={textareaRef}
              placeholder="Nhập ghi chú cho cuộc gọi này..."
              onChange={(e) => updateNoteText(call.uid, e.target.value)}
              className="w-full resize-none bg-transparent text-[13.5px] leading-relaxed text-slate-900 outline-none placeholder:text-slate-400"
              rows={3}
            />
            <div className="mt-2.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                Tự động lưu khi kết thúc
              </span>
              <button
                onClick={() => {
                  // Chup lai noi dung note vao bien rieng TRUOC khi xoa textarea,
                  // tranh race: api.post chay o microtask sau khi updateNoteText('') da clear.
                  const text = call.noteText.trim();
                  if (!text || !call.contactInfo) return;
                  const endpoint = call.contactInfo.type === 'LEAD'
                    ? `/leads/${call.contactInfo.id}/activities`
                    : `/customers/${call.contactInfo.id}/activities`;
                  api.post(endpoint, { content: text })
                    .then(() => toast.success('Đã lưu ghi chú'))
                    .catch(() => toast.error('Lưu ghi chú thất bại'));
                  if (textareaRef.current) textareaRef.current.value = '';
                  updateNoteText(call.uid, '');
                  onAfterSave?.();
                }}
                className="rounded-[10px] bg-gradient-to-r from-sky-500 to-cyan-500 px-[18px] py-2 text-[12.5px] font-bold text-white shadow-[0_6px_16px_-6px_rgba(14,165,233,0.5)] transition-all hover:-translate-y-px hover:brightness-105"
              >
                Lưu ghi chú
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="!mt-[18px] mb-2 text-[11px] font-bold uppercase tracking-[.8px] text-slate-400 first:!mt-0">{children}</p>;
}

function Field({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-2.5 border-b border-slate-100 py-[7px] text-[13.5px]">
      <span className="font-medium text-slate-400">{label}</span>
      <span className="font-semibold text-slate-800">{children ?? value}</span>
    </div>
  );
}

function Tag({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`inline-block rounded-[7px] px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return iso; }
}
