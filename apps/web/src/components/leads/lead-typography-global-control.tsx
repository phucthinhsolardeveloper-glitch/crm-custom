'use client';

import { useLeadColumns } from '@/components/leads/lead-columns-context';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LeadFontSize, LeadFontWeight } from '@/hooks/use-typography-prefs';

/**
 * Global typography control - section đầu trong Setting popover.
 *
 * User chỉnh cỡ chữ + độ đậm + màu chữ áp dụng cho TOÀN BẢNG.
 * Toggle "Apply for Header / Data" cho phép tắt riêng một phần (vd: chỉ data cells
 * theo custom, header giữ default để nổi bật).
 *
 * Per-column override (gear icon ở từng row column list) THẮNG global typography.
 * Đã khôi phục 2026-05-23 (lần trước bị xóa 2026-05-21).
 */

const FONT_SIZES: LeadFontSize[] = [12, 13, 14, 15, 16];
const FONT_WEIGHTS: { value: LeadFontWeight; label: string }[] = [
  { value: 400, label: 'Mỏng' },
  { value: 500, label: 'Bình' },
  { value: 600, label: 'Đậm' },
  { value: 700, label: 'Rất đậm' },
];

export function LeadTypographyGlobalControl() {
  const { typography, updateTypography, resetTypography } = useLeadColumns();

  return (
    <div className="space-y-2.5 px-1">
      {/* Font size */}
      <div>
        <label className="text-[11px] font-medium text-slate-500 mb-1 block">
          Cỡ chữ <span className="text-slate-400">({typography.fontSize}px)</span>
        </label>
        <div className="flex flex-wrap gap-1">
          {FONT_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => updateTypography('fontSize', s)}
              className={cn(
                'rounded px-1.5 py-0.5 text-[11px] border transition-colors',
                typography.fontSize === s
                  ? 'bg-sky-500 text-white border-sky-500'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Font weight */}
      <div>
        <label className="text-[11px] font-medium text-slate-500 mb-1 block">Độ đậm</label>
        <div className="flex gap-1">
          {FONT_WEIGHTS.map((w) => (
            <button
              key={w.value}
              type="button"
              onClick={() => updateTypography('fontWeight', w.value)}
              style={{ fontWeight: w.value }}
              className={cn(
                'flex-1 rounded px-1.5 py-1 text-[11px] border transition-colors',
                typography.fontWeight === w.value
                  ? 'bg-sky-500 text-white border-sky-500'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* Color */}
      <div>
        <label className="text-[11px] font-medium text-slate-500 mb-1 block">Màu chữ</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={typography.color}
            onChange={(e) => updateTypography('color', e.target.value)}
            className="h-7 w-10 rounded border border-slate-200 cursor-pointer"
            aria-label="Màu chữ toàn bảng"
          />
          <input
            type="text"
            value={typography.color}
            onChange={(e) => {
              const v = e.target.value.trim();
              if (/^#[0-9a-fA-F]{6}$/.test(v)) updateTypography('color', v);
            }}
            className="flex-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-mono"
            placeholder="#0f172a"
          />
        </div>
      </div>

      {/* Apply scope toggles */}
      <div>
        <label className="text-[11px] font-medium text-slate-500 mb-1 block">Áp dụng cho</label>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={typography.applyToHeader}
              onChange={(e) => updateTypography('applyToHeader', e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            Header
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={typography.applyToData}
              onChange={(e) => updateTypography('applyToData', e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            Data cells
          </label>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          Tắt toggle = phần đó giữ font mặc định, override per-column vẫn hoạt động.
        </p>
      </div>

      {/* Preview */}
      <div className="border-t border-slate-100 pt-2">
        <span className="text-[10px] text-slate-400 block mb-1">Preview:</span>
        <div
          className="rounded border border-slate-200 px-2 py-1.5 text-center"
          style={{
            fontSize: `${typography.fontSize}px`,
            fontWeight: typography.fontWeight,
            color: typography.color,
          }}
        >
          Nguyễn Văn A - 0901234567
        </div>
      </div>

      {/* Reset */}
      <button
        type="button"
        onClick={resetTypography}
        className="text-[11px] text-sky-600 hover:text-sky-700 inline-flex items-center gap-1"
        title="Khôi phục kiểu chữ mặc định"
      >
        <RotateCcw className="h-3 w-3" />
        Reset typography
      </button>
    </div>
  );
}
