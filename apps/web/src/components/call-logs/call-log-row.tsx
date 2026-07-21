'use client';

/**
 * Single row trong danh sach cuoc goi.
 * Focal point: avatar + ten sale phu trach (180px reserved width).
 * Click avatar/ten -> emit onUserClick de auto-filter theo sale.
 */
import { Clock, ChevronDown } from 'lucide-react';
import { cn, formatDateTime } from '@/lib/utils';
import type { CallLogRecord } from '@/types/entities';
import { CALL_TYPE_CONFIG, avatarGradient, nameInitials, parseAnalysis, formatDuration, hashTagColor } from './call-log-helpers';
import { CallLogScoreBadge } from './call-log-score-badge';

interface CallLogRowProps {
  log: CallLogRecord;
  isExpanded: boolean;
  onToggle: () => void;
  onUserClick?: (userId: string) => void;
}

export function CallLogRow({ log, isExpanded, onToggle, onUserClick }: CallLogRowProps) {
  const config = CALL_TYPE_CONFIG[log.callType as keyof typeof CALL_TYPE_CONFIG] ?? CALL_TYPE_CONFIG.OUTGOING;
  const Icon = config.icon;
  const user = log.matchedUser;
  const hasContent = !!log.content?.trim();
  const hasRecording = !!log.recordingUrl;
  const analysis = parseAnalysis(log.analysis);
  const hasAi = !!analysis;
  const hasScore = typeof analysis?.score === 'number';

  return (
    <div
      onClick={onToggle}
      className={cn(
        'rounded-xl border bg-white px-4 py-3 cursor-pointer transition-all',
        isExpanded ? 'border-sky-300 shadow-md' : 'border-slate-200 hover:border-sky-200 hover:shadow-sm',
      )}
    >
      <div className="flex items-center gap-4">
        {/* Sale avatar + name (focal point) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (user?.id && onUserClick) onUserClick(user.id);
          }}
          className={cn(
            'flex items-center gap-3 min-w-[160px] max-w-[200px] text-left rounded-lg p-1 -m-1',
            user?.id && onUserClick && 'hover:bg-slate-50',
          )}
          title={user ? `Lọc theo ${user.name}` : 'Chưa xác định được user'}
        >
          {user ? (
            <div className={cn(
              'h-10 w-10 shrink-0 rounded-full bg-gradient-to-br text-white font-bold grid place-items-center text-sm',
              avatarGradient(user.id),
            )}>
              {nameInitials(user.name)}
            </div>
          ) : (
            <div className="h-10 w-10 shrink-0 rounded-full bg-slate-200 text-slate-400 font-bold grid place-items-center">?</div>
          )}
          <div className="min-w-0">
            {user ? (
              <div className="text-sm font-semibold text-slate-800 truncate">{user.name}</div>
            ) : (
              <div className="text-sm font-medium text-slate-500 italic truncate">Chưa xác định</div>
            )}
          </div>
        </button>

        {/* Call type icon */}
        <div className="shrink-0 flex flex-col items-center gap-0.5">
          <div className={cn('h-8 w-8 rounded-lg grid place-items-center', config.bg, config.color)}>
            <Icon className="h-4 w-4" />
          </div>
          <span className={cn('text-[10px] font-semibold', config.color)}>{config.label}</span>
        </div>

        {/* Customer phone + AI tags */}
        <div className="flex-1 min-w-0">
          <div className="text-base font-bold text-slate-900">{log.phoneNumber}</div>
          {analysis && analysis.tags && analysis.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {analysis.tags.slice(0, 5).map((tag, i) => (
                <span key={i} className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', hashTagColor(tag))}>
                  {tag}
                </span>
              ))}
              {analysis.tags.length > 5 && (
                <span className="rounded-full bg-slate-100 text-slate-500 px-2 py-0.5 text-[10px] font-semibold">+{analysis.tags.length - 5}</span>
              )}
            </div>
          )}
        </div>

        {/* Duration + time */}
        <div className="shrink-0 text-right">
          <div className="text-sm font-bold text-slate-800 flex items-center gap-1 justify-end">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            {formatDuration(log.duration)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">{formatDateTime(log.callTime)}</div>
        </div>

        {/* Score badge (AI v2) hoặc indicator stack fallback */}
        {hasScore ? (
          <CallLogScoreBadge score={analysis!.score} size="sm" />
        ) : (
          <div className="shrink-0 flex flex-col items-center gap-1 w-[44px]">
            {hasRecording && (
              <span className="rounded-md bg-rose-50 text-rose-600 border border-rose-200 px-1.5 py-0.5 text-[10px] font-bold" title="Có ghi âm">REC</span>
            )}
            {hasAi && (
              <span className="rounded-md bg-purple-50 text-purple-600 border border-purple-200 px-1.5 py-0.5 text-[10px] font-bold" title="Đã phân tích AI (v1)">AI</span>
            )}
            {!hasRecording && !hasAi && hasContent && (
              <span className="rounded-md bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 text-[10px] font-bold" title="Có transcript">TXT</span>
            )}
          </div>
        )}

        <ChevronDown className={cn('h-4 w-4 text-slate-400 shrink-0 transition-transform', isExpanded && 'rotate-180')} />
      </div>
    </div>
  );
}
