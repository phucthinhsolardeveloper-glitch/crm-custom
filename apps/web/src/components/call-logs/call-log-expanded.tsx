'use client';

/**
 * Expanded detail panel cho 1 cuoc goi.
 * Bao gom: recording player (neu co), AI analysis, transcript, meta footer.
 * Nut "Xoa cuoc goi" chi render khi user.role === 'SUPER_ADMIN'.
 */
import { Trash2, Download, MessageSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { formatDateTime } from '@/lib/utils';
import type { CallLogRecord } from '@/types/entities';
import { parseAnalysis, formatDuration } from './call-log-helpers';
import { CallLogBentoAnalysis } from './call-log-bento-analysis';
import { CallLogFeedback } from './call-log-feedback';

interface CallLogExpandedProps {
  log: CallLogRecord;
  canDelete: boolean;
  isDeleting: boolean;
  onDelete: () => void;
}

/** Bento v2 (co score / summary / customer / sale / actions) hoac fallback v1 markdown. */
function hasV2Bento(a: ReturnType<typeof parseAnalysis>): boolean {
  return !!a && (typeof a.score === 'number' || !!a.summary || !!a.customer || !!a.sale || !!a.actions);
}

/**
 * Cuoc goi co diem nhung KHONG co phan tich chi tiet (summary/customer/sale/actions/detail rong).
 * Thuong do AI tra thieu hoac bi cat output - hien nhac thay vi khung trong.
 */
function isScoreOnly(a: ReturnType<typeof parseAnalysis>): boolean {
  return (
    !!a &&
    typeof a.score === 'number' &&
    !a.summary &&
    !a.customer &&
    !a.sale &&
    !(a.actions && a.actions.length) &&
    !a.detail
  );
}

export function CallLogExpanded({ log, canDelete, isDeleting, onDelete }: CallLogExpandedProps) {
  const analysis = parseAnalysis(log.analysis);
  const hasContent = !!log.content?.trim();
  const transcriptLines = (log.content ?? '').split('\n').filter((l) => l.trim());

  return (
    <div className="ml-2 mr-2 mt-1 mb-2 rounded-lg border border-slate-100 bg-slate-50 p-4 space-y-3 text-sm">
      {/* AI analysis - bento v2 hoac markdown v1 fallback (TOP - focal point) */}
      {isScoreOnly(analysis) ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            ⚠️ Cuộc gọi mới có điểm <strong>{Math.round(analysis!.score as number)}/10</strong>, chưa có phân tích chi tiết.
          </div>
          <p className="text-xs text-amber-700 mt-1">AI chưa phân tích đầy đủ (cuộc gọi dài hoặc thiếu nội dung). Có thể chấm lại sau.</p>
        </div>
      ) : hasV2Bento(analysis) ? (
        <>
          <CallLogBentoAnalysis analysis={analysis!} />
          {/* AI hay viet phan tich vao `detail` markdown thay vi object customer/sale/actions.
              Khi thieu breakdown cau truc -> render detail de khong mat phan tich. */}
          {analysis!.detail && !analysis!.customer && !analysis!.sale && !(analysis!.actions && analysis!.actions.length) && (
            <div className="rounded-lg bg-white border border-purple-200 p-3">
              <div className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2">✨ Phân tích chi tiết</div>
              <div className="prose prose-sm prose-gray max-w-none text-sm [&_strong]:text-slate-800 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_p]:my-1">
                <ReactMarkdown>{analysis!.detail}</ReactMarkdown>
              </div>
            </div>
          )}
        </>
      ) : analysis && analysis.detail ? (
        <div className="rounded-lg bg-white border border-purple-200 p-3">
          <div className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2">✨ Phân tích AI (v1)</div>
          <div className="prose prose-sm prose-gray max-w-none text-sm [&_strong]:text-slate-800 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_p]:my-1">
            <ReactMarkdown>{analysis.detail}</ReactMarkdown>
          </div>
        </div>
      ) : null}

      {/* Feedback (gop y) - LEADER+ gui, sale xem feedback cuoc cua minh */}
      <CallLogFeedback callLogId={log.id} />

      {/* Recording player (sau AI - khong chiem focus mat user khi expand) */}
      {log.recordingUrl && (
        <div className="rounded-lg bg-white border border-slate-200 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">🎙️ Ghi âm cuộc gọi</div>
            <a
              href={log.recordingUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-sky-600 hover:underline flex items-center gap-1"
            >
              <Download className="h-3 w-3" />
              Tải xuống
            </a>
          </div>
          <audio controls preload="none" className="w-full">
            <source src={log.recordingUrl} type="audio/mpeg" />
            Trình duyệt không hỗ trợ phát ghi âm.
          </audio>
        </div>
      )}

      {/* Transcript - accordion (mac dinh dong) */}
      <details className="rounded-lg bg-white border border-slate-200">
        <summary className="cursor-pointer px-3 py-2.5 flex items-center justify-between hover:bg-slate-50 rounded-lg list-none [&::-webkit-details-marker]:hidden">
          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5" />
            Nội dung hội thoại
            {hasContent && <span className="rounded-full bg-slate-100 text-slate-500 px-2 py-0.5 text-[10px] font-bold">{transcriptLines.length} dòng</span>}
          </div>
          <span className="text-xs text-sky-600">Xem chi tiết ▾</span>
        </summary>
        <div className="px-3 pb-3 pt-1 border-t border-slate-100">
          {hasContent ? (
            <div className="text-sm text-slate-700 leading-relaxed space-y-1 max-h-60 overflow-auto pr-1 whitespace-pre-wrap">
              {transcriptLines.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 italic text-sm">Chưa có nội dung - chờ OmiCall gửi transcript</p>
          )}
        </div>
      </details>

      {/* Meta footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>Thời lượng: <strong className="text-slate-700">{formatDuration(log.duration)}</strong></span>
          <span>Lúc: <strong className="text-slate-700">{formatDateTime(log.callTime)}</strong></span>
          {log.hangupCause && <span>Hangup: <code className="text-slate-700">{log.hangupCause}</code></span>}
          {log.endbyName && <span>Kết thúc: <code className="text-slate-700">{log.endbyName}</code></span>}
          {log.externalId && <span title="OmiCall call UUID">UUID: <code className="text-slate-700">{log.externalId.slice(0, 8)}…</code></span>}
        </div>
        {canDelete && (
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="sm" className="text-rose-500 hover:text-rose-600 hover:bg-rose-50" disabled={isDeleting}>
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                {isDeleting ? 'Đang xoá...' : 'Xoá cuộc gọi'}
              </Button>
            }
            title="Xoá cuộc gọi"
            description={`Xoá cuộc gọi ${log.phoneNumber} lúc ${formatDateTime(log.callTime)}? Hành động này không hoàn tác được qua UI.`}
            confirmLabel="Xoá"
            onConfirm={onDelete}
            isLoading={isDeleting}
          />
        )}
      </div>
    </div>
  );
}
