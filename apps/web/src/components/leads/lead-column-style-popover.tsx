'use client';

import { useLeadColumns } from '@/components/leads/lead-columns-context';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Palette, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LeadFontWeight } from '@/hooks/use-typography-prefs';

/**
 * Per-column style override popover - hiện inline cạnh mỗi column row trong Setting popover.
 * User chỉnh font size, weight, bgColor, textColor cho riêng 1 cột. Undefined field = inherit
 * global typography (đảm bảo migration smooth từ global-only setup).
 *
 * UX:
 * - Trigger: small palette icon button cạnh checkbox visibility
 * - Body: 4 control (fontSize slider, weight chip, bgColor picker, textColor picker)
 * - Footer: "Reset cột này" link
 *
 * Native <input type="color"> dùng cho HEX picker (browser support tốt, no extra dep).
 */

const FONT_SIZE_PRESETS = [11, 12, 13, 14, 15, 16, 18, 20];
const FONT_WEIGHTS: { value: LeadFontWeight; label: string }[] = [
  { value: 400, label: 'Normal' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'Semibold' },
  { value: 700, label: 'Bold' },
];

interface Props {
  columnKey: string;
  columnLabel: string;
}

export function LeadColumnStylePopover({ columnKey, columnLabel }: Props) {
  const { getColumnStyle, setColumnStyle, resetColumn, hasOverride, typography } = useLeadColumns();
  const style = getColumnStyle(columnKey);
  const overridden = hasOverride(columnKey);

  // Effective values shown trong UI - per-column override → fallback global
  const effectiveFontSize = style.fontSize ?? typography.fontSize;
  const effectiveFontWeight = style.fontWeight ?? typography.fontWeight;
  const effectiveBgColor = style.bgColor ?? '';                // empty = trong suốt (inherit row)
  const effectiveTextColor = style.textColor ?? typography.color;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`Tuỳ chỉnh style cột "${columnLabel}"${overridden ? ' (đã override)' : ''}`}
          className={cn(
            'shrink-0 inline-flex h-6 w-6 items-center justify-center rounded transition-colors',
            overridden
              ? 'text-sky-600 bg-sky-50 hover:bg-sky-100'
              : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100',
          )}
          aria-label={`Style cột ${columnLabel}`}
        >
          <Palette className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-3 space-y-3"
        align="start"
        side="right"
        sideOffset={8}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Style: {columnLabel}
          </span>
          {overridden && (
            <button
              type="button"
              onClick={() => resetColumn(columnKey)}
              className="text-[11px] text-sky-600 hover:text-sky-700 inline-flex items-center gap-1"
              title="Xoá override - về dùng setting global"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          )}
        </div>

        {/* Font size */}
        <div>
          <label className="text-[11px] font-medium text-slate-500 mb-1 block">
            Kích thước chữ <span className="text-slate-400">({effectiveFontSize}px)</span>
          </label>
          <div className="flex flex-wrap gap-1">
            {FONT_SIZE_PRESETS.map((size) => {
              const selected = style.fontSize === size;
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => setColumnStyle(columnKey, { fontSize: selected ? undefined : size })}
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[11px] border transition-colors',
                    selected
                      ? 'bg-sky-500 text-white border-sky-500'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
                  )}
                >
                  {size}
                </button>
              );
            })}
          </div>
        </div>

        {/* Font weight */}
        <div>
          <label className="text-[11px] font-medium text-slate-500 mb-1 block">Độ đậm</label>
          <div className="flex gap-1">
            {FONT_WEIGHTS.map((w) => {
              const selected = style.fontWeight === w.value;
              return (
                <button
                  key={w.value}
                  type="button"
                  onClick={() => setColumnStyle(columnKey, { fontWeight: selected ? undefined : w.value })}
                  style={{ fontWeight: w.value }}
                  className={cn(
                    'flex-1 rounded px-1.5 py-1 text-[11px] border transition-colors',
                    selected
                      ? 'bg-sky-500 text-white border-sky-500'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
                  )}
                >
                  {w.label}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            Hiện áp: <span className="font-medium">{effectiveFontWeight}</span>
            {style.fontWeight === undefined && ' (global)'}
          </p>
        </div>

        {/* Background color */}
        <div>
          <label className="text-[11px] font-medium text-slate-500 mb-1 block">Màu nền cell</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={effectiveBgColor || '#ffffff'}
              onChange={(e) => setColumnStyle(columnKey, { bgColor: e.target.value })}
              className="h-7 w-10 rounded border border-slate-200 cursor-pointer"
              aria-label="Màu nền"
            />
            <input
              type="text"
              value={effectiveBgColor}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (v === '') setColumnStyle(columnKey, { bgColor: undefined });
                else if (/^#[0-9a-fA-F]{6}$/.test(v)) setColumnStyle(columnKey, { bgColor: v });
              }}
              placeholder="#ffffff (trống = trong suốt)"
              className="flex-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-mono"
            />
            {style.bgColor !== undefined && (
              <button
                type="button"
                onClick={() => setColumnStyle(columnKey, { bgColor: undefined })}
                title="Xoá màu nền"
                className="text-[10px] text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            Trống = trong suốt (lấy màu row zebra)
          </p>
        </div>

        {/* Text color */}
        <div>
          <label className="text-[11px] font-medium text-slate-500 mb-1 block">Màu chữ</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={effectiveTextColor}
              onChange={(e) => setColumnStyle(columnKey, { textColor: e.target.value })}
              className="h-7 w-10 rounded border border-slate-200 cursor-pointer"
              aria-label="Màu chữ"
            />
            <input
              type="text"
              value={style.textColor ?? ''}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (v === '') setColumnStyle(columnKey, { textColor: undefined });
                else if (/^#[0-9a-fA-F]{6}$/.test(v)) setColumnStyle(columnKey, { textColor: v });
              }}
              placeholder={typography.color}
              className="flex-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-mono"
            />
            {style.textColor !== undefined && (
              <button
                type="button"
                onClick={() => setColumnStyle(columnKey, { textColor: undefined })}
                title="Xoá màu chữ override"
                className="text-[10px] text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            Trống = lấy màu global ({typography.color})
          </p>
        </div>

        {/* Preview */}
        <div className="border-t border-slate-100 pt-2">
          <span className="text-[10px] text-slate-400 block mb-1">Preview:</span>
          <div
            className="rounded border border-slate-200 px-2 py-1.5 text-center"
            style={{
              fontSize: `${effectiveFontSize}px`,
              fontWeight: effectiveFontWeight,
              backgroundColor: effectiveBgColor || 'transparent',
              color: effectiveTextColor,
            }}
          >
            Ví dụ nội dung
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
