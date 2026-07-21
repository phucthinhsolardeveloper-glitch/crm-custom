'use client';

import { cn } from '@/lib/utils';

// 10 curated bg+text pairs. Pastel pairs use dark text for AA contrast,
// vivid pairs use white text. User can still tweak via color pickers below.
export const LABEL_COLOR_PRESETS: { name: string; bg: string; text: string }[] = [
  { name: 'Đỏ',         bg: '#ef4444', text: '#ffffff' },
  { name: 'Cam',        bg: '#f97316', text: '#ffffff' },
  { name: 'Vàng đậm',   bg: '#facc15', text: '#0f172a' },
  { name: 'Xanh lá',    bg: '#10b981', text: '#ffffff' },
  { name: 'Xanh dương', bg: '#3b82f6', text: '#ffffff' },
  { name: 'Tím',        bg: '#8b5cf6', text: '#ffffff' },
  { name: 'Hồng pastel', bg: '#fce7f3', text: '#831843' },
  { name: 'Xanh pastel', bg: '#dbeafe', text: '#1e3a8a' },
  { name: 'Vàng pastel', bg: '#fef9c3', text: '#713f12' },
  { name: 'Xám',        bg: '#6b7280', text: '#ffffff' },
];

interface Props {
  selectedBg: string;
  selectedText: string;
  onPick: (bg: string, text: string) => void;
}

/** Click-to-apply preset chips. Highlights current selection if it matches a preset. */
export function LabelColorPresets({ selectedBg, selectedText, onPick }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {LABEL_COLOR_PRESETS.map((p) => {
        // Match presets case-insensitively because color pickers normalize to lowercase
        const isActive =
          p.bg.toLowerCase() === selectedBg.toLowerCase() &&
          p.text.toLowerCase() === selectedText.toLowerCase();
        return (
          <button
            key={p.bg + p.text}
            type="button"
            onClick={() => onPick(p.bg, p.text)}
            title={p.name}
            className={cn(
              'rounded-full px-2.5 py-1 text-[11px] font-medium transition-all border',
              isActive
                ? 'border-sky-500 ring-2 ring-sky-200 scale-105'
                : 'border-transparent hover:border-slate-300 hover:scale-105',
            )}
            style={{ backgroundColor: p.bg, color: p.text }}
          >
            {p.name}
          </button>
        );
      })}
    </div>
  );
}

interface PreviewProps {
  bg: string;
  text: string;
  name?: string;
}

/** Live preview matching how labels actually render in tables / kanban. */
export function LabelPreviewChip({ bg, text, name }: PreviewProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-xs text-slate-500">Xem trước:</span>
      <span
        className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium"
        style={{ backgroundColor: bg, color: text }}
      >
        {name || 'Nhãn của bạn'}
      </span>
    </div>
  );
}
