'use client';

/**
 * Bento AI analysis cho 1 cuoc goi - layout 2 compact + 2 focus.
 * - Compact: Tong quan (sky) + Khach hang (emerald), padding gon.
 * - Focus: Sale best practices (amber) + Actions (purple), glow animation, border 2px.
 * - Render conditional: thieu data thi an section, khong crash.
 * - Class `focus-amber`/`focus-purple`/`compact-card` khai bao o globals.css.
 */
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CallAnalysisV2 } from '@/types/entities';
import { scoreTone } from './call-log-helpers';

interface CallLogBentoAnalysisProps {
  analysis: CallAnalysisV2;
}

type Priority = 'urgent' | 'today' | 'optional';

const PRIORITY_CFG: Record<Priority, { label: string; badge: string; border: string; hoverBorder: string }> = {
  urgent:   { label: '🔴 Gấp',  badge: 'bg-rose-500',  border: 'border-rose-200',  hoverBorder: 'hover:border-rose-400' },
  today:    { label: '🟡 Ngày', badge: 'bg-amber-500', border: 'border-amber-200', hoverBorder: 'hover:border-amber-400' },
  optional: { label: '⚪ Tùy',  badge: 'bg-slate-400', border: 'border-slate-200', hoverBorder: 'hover:border-slate-400' },
};

export function CallLogBentoAnalysis({ analysis }: CallLogBentoAnalysisProps) {
  const { score, summary, meta, customer, sale, actions } = analysis;
  const tone = scoreTone(score);
  const hasFocusContent = (sale && (sale.strengths?.length || sale.improvements?.length)) || (actions && actions.length > 0);

  return (
    <div>
      <div className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-3 flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5" />
        Phân tích AI
        {hasFocusContent && (
          <span className="rounded-full bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 text-[10px] font-bold">🌟 Trọng tâm bên dưới</span>
        )}
      </div>

      {/* Compact row: Tong quan + Khach hang */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div className="compact-card rounded-lg border border-sky-200 bg-gradient-to-br from-sky-50 to-cyan-50 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[11px] font-bold uppercase text-sky-700">📋 Tổng quan</div>
            {typeof score === 'number' && (
              <div className="flex items-baseline gap-0.5">
                <span className={cn('text-lg font-extrabold leading-none', tone.textColor)}>{Math.round(score)}</span>
                <span className="text-[10px] text-slate-400 font-semibold">/10</span>
              </div>
            )}
          </div>
          {summary && <p className="text-[13px] text-slate-700 leading-snug">{summary}</p>}
          {meta && (
            <div className="flex flex-wrap gap-1 mt-2 text-[10px]">
              {meta.mood    && <span className="rounded bg-white/70 border border-slate-200 px-1.5 py-0.5"><strong>Mood:</strong> {meta.mood}</span>}
              {meta.intent  && <span className="rounded bg-white/70 border border-slate-200 px-1.5 py-0.5"><strong>Intent:</strong> {meta.intent}</span>}
              {meta.outcome && <span className="rounded bg-white/70 border border-slate-200 px-1.5 py-0.5"><strong>Kết:</strong> {meta.outcome}</span>}
            </div>
          )}
        </div>

        {customer && (customer.need || customer.concern || customer.moods?.length) && (
          <div className="compact-card rounded-lg border border-emerald-200 bg-white p-3">
            <div className="text-[11px] font-bold uppercase text-emerald-700 mb-1.5">👤 Khách hàng</div>
            <div className="space-y-1 text-[13px]">
              {customer.need    && <p><span className="text-[10px] uppercase text-emerald-600 font-bold">Cần: </span><span className="text-slate-700">{customer.need}</span></p>}
              {customer.concern && <p><span className="text-[10px] uppercase text-emerald-600 font-bold">Lo: </span><span className="text-slate-700">{customer.concern}</span></p>}
            </div>
            {customer.moods && customer.moods.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {customer.moods.map((m, i) => (
                  <span key={i} className="rounded-md bg-slate-100 text-slate-700 px-1.5 py-0.5 text-[10px] font-semibold">{m}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Focus row: Sale + Actions */}
      {hasFocusContent && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sale && (sale.strengths?.length || sale.improvements?.length) && (
            <div className="focus-amber rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-5 relative">
              <div className="absolute top-3 right-3 rounded-full bg-amber-500 text-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider shadow-md">⭐ Trọng tâm</div>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white grid place-items-center text-lg shadow-md">💼</div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-amber-700 font-bold">Best practices</div>
                  <div className="text-base font-extrabold text-slate-800">Sale - rút kinh nghiệm</div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-3">
                {sale.strengths && sale.strengths.length > 0 && (
                  <div className="rounded-xl bg-white border border-emerald-200 p-3">
                    <div className="text-[10px] uppercase text-emerald-600 font-bold mb-2">✓ Giữ phát huy</div>
                    <ul className="text-[12.5px] text-slate-700 space-y-1.5">
                      {sale.strengths.map((s, i) => (
                        <li key={i} className="flex gap-1.5"><span className="text-emerald-500 mt-0.5">●</span><span>{s}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
                {sale.improvements && sale.improvements.length > 0 && (
                  <div className="rounded-xl bg-white border border-rose-200 p-3">
                    <div className="text-[10px] uppercase text-rose-600 font-bold mb-2">✗ Sửa ngay</div>
                    <ul className="text-[12.5px] text-slate-700 space-y-1.5">
                      {sale.improvements.map((s, i) => (
                        <li key={i} className="flex gap-1.5"><span className="text-rose-500 mt-0.5">●</span><span>{s}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {actions && actions.length > 0 && (
            <div className="focus-purple rounded-2xl border-2 border-purple-300 bg-gradient-to-br from-purple-50 via-white to-pink-50 p-5 relative">
              <div className="absolute top-3 right-3 rounded-full bg-purple-500 text-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider shadow-md">🎯 Làm ngay</div>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 text-white grid place-items-center text-lg shadow-md">✅</div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-purple-700 font-bold">Việc cần làm tiếp</div>
                  <div className="text-base font-extrabold text-slate-800">{actions.length} task</div>
                </div>
              </div>
              <div className="space-y-2 mt-3">
                {actions.map((a, i) => {
                  const cfg = PRIORITY_CFG[(a.priority as Priority) ?? 'optional'];
                  return (
                    <div key={i} className={cn('rounded-xl bg-white border-2 p-3 transition hover:shadow-md', cfg.border, cfg.hoverBorder)}>
                      <div className="flex items-start gap-2">
                        <span className={cn('rounded text-white px-1.5 py-0.5 text-[10px] font-bold uppercase shrink-0 mt-0.5', cfg.badge)}>{cfg.label}</span>
                        <div className="flex-1 text-sm text-slate-800 font-semibold leading-snug">{a.title}</div>
                      </div>
                      {a.dueHint && <div className="mt-2"><span className="text-[11px] text-slate-500">{a.dueHint}</span></div>}
                      {a.note && <p className="text-[11px] text-slate-500 italic mt-1.5 pl-1">{a.note}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
