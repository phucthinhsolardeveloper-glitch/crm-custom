'use client';

import { useLeadColumns } from '@/components/leads/lead-columns-context';
import { RotateCcw } from 'lucide-react';
import { DEFAULT_ROW_STYLE, type RowStylePrefs } from '@/hooks/use-row-style-prefs';

/**
 * Section trong Setting popover để chỉnh màu cặp zebra rows + hover + selected.
 * Mỗi state có CẶP (background, text) - render 2 color picker side-by-side để dễ chỉnh.
 * Native color picker (HEX free) + text input HEX fallback.
 */

interface RowFieldDef {
  bgKey: keyof RowStylePrefs;
  textKey: keyof RowStylePrefs;
  label: string;
  hint: string;
}

const ROW_FIELDS: RowFieldDef[] = [
  { bgKey: 'oddRowBg',    textKey: 'oddRowText',    label: 'Dòng lẻ',   hint: 'Index 1, 3, 5...' },
  { bgKey: 'evenRowBg',   textKey: 'evenRowText',   label: 'Dòng chẵn', hint: 'Index 0, 2, 4...' },
  { bgKey: 'hoverBg',     textKey: 'hoverText',     label: 'Khi hover', hint: 'Khi rê chuột vào' },
  { bgKey: 'selectedBg',  textKey: 'selectedText',  label: 'Khi chọn',  hint: 'Khi tick checkbox' },
];

export function LeadTableRowStyleSettings() {
  const { rowStyles, setRowStyle, resetRowStyles } = useLeadColumns();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-slate-400">
          Đổi cặp màu zebra cho rows (HEX picker tự do).
        </p>
        <button
          type="button"
          onClick={resetRowStyles}
          className="text-[11px] text-sky-600 hover:text-sky-700 inline-flex items-center gap-1"
          title="Khôi phục cặp màu mặc định"
        >
          <RotateCcw className="h-3 w-3" />
          Mặc định
        </button>
      </div>

      {/* Header labels giải thích 2 cột color picker */}
      <div className="flex items-center gap-2 px-1">
        <span className="w-10 text-center text-[9px] uppercase tracking-wide text-slate-400 shrink-0">Nền</span>
        <span className="w-10 text-center text-[9px] uppercase tracking-wide text-slate-400 shrink-0">Chữ</span>
        <span className="flex-1 text-[9px] uppercase tracking-wide text-slate-400">Trạng thái</span>
      </div>

      {ROW_FIELDS.map((field) => {
        const bgValue = rowStyles[field.bgKey];
        const textValue = rowStyles[field.textKey];
        const isBgDefault = bgValue === DEFAULT_ROW_STYLE[field.bgKey];
        const isTextDefault = textValue === DEFAULT_ROW_STYLE[field.textKey];
        const isDefault = isBgDefault && isTextDefault;
        return (
          <div key={field.bgKey} className="flex items-center gap-2">
            {/* Background color picker */}
            <input
              type="color"
              value={bgValue}
              onChange={(e) => setRowStyle(field.bgKey, e.target.value)}
              className="h-7 w-10 rounded border border-slate-200 cursor-pointer shrink-0"
              aria-label={`${field.label} - nền`}
              title={`${field.label} - màu nền (${bgValue})`}
            />
            {/* Text color picker */}
            <input
              type="color"
              value={textValue}
              onChange={(e) => setRowStyle(field.textKey, e.target.value)}
              className="h-7 w-10 rounded border border-slate-200 cursor-pointer shrink-0"
              aria-label={`${field.label} - chữ`}
              title={`${field.label} - màu chữ (${textValue})`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-medium text-slate-600">{field.label}</span>
                {!isDefault && (
                  <span className="text-[9px] uppercase tracking-wide text-sky-600 font-semibold">
                    custom
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-400 truncate block">{field.hint}</span>
            </div>
          </div>
        );
      })}

      {/* Preview - hiển thị cả bg + text để user thấy contrast */}
      <div className="rounded border border-slate-200 overflow-hidden mt-2">
        <div
          className="px-2 py-1 text-[10px]"
          style={{ backgroundColor: rowStyles.evenRowBg, color: rowStyles.evenRowText }}
        >
          Dòng chẵn - bg {rowStyles.evenRowBg} / text {rowStyles.evenRowText}
        </div>
        <div
          className="px-2 py-1 text-[10px]"
          style={{ backgroundColor: rowStyles.oddRowBg, color: rowStyles.oddRowText }}
        >
          Dòng lẻ - bg {rowStyles.oddRowBg} / text {rowStyles.oddRowText}
        </div>
        <div
          className="px-2 py-1 text-[10px]"
          style={{ backgroundColor: rowStyles.hoverBg, color: rowStyles.hoverText }}
        >
          Hover - bg {rowStyles.hoverBg} / text {rowStyles.hoverText}
        </div>
        <div
          className="px-2 py-1 text-[10px]"
          style={{ backgroundColor: rowStyles.selectedBg, color: rowStyles.selectedText }}
        >
          Selected - bg {rowStyles.selectedBg} / text {rowStyles.selectedText}
        </div>
      </div>
    </div>
  );
}
