'use client';

import { Type, Check, RotateCcw } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import {
  useGlobalFontPref,
  GLOBAL_FONT_LABELS,
  GLOBAL_FONT_CATEGORIES,
  FONT_FAMILY_CSS,
  FONT_WEIGHT_OPTIONS,
  type GlobalFontKey,
} from '@/hooks/use-global-font-pref';
import { cn } from '@/lib/utils';

const CATEGORY_LABELS: Record<'sans' | 'serif' | 'vietnamese', string> = {
  sans: 'Sans-serif',
  serif: 'Serif',
  vietnamese: 'Tối ưu tiếng Việt',
};

/** Group font theo category để render section trong picker. */
function groupFontsByCategory(): Record<string, GlobalFontKey[]> {
  const groups: Record<string, GlobalFontKey[]> = { vietnamese: [], sans: [], serif: [] };
  (Object.keys(GLOBAL_FONT_LABELS) as GlobalFontKey[]).forEach((key) => {
    groups[GLOBAL_FONT_CATEGORIES[key]].push(key);
  });
  return groups;
}

interface FontPickerMenuProps {
  /** Trigger element (button/icon) hiển thị trên header. */
  trigger?: React.ReactNode;
}

export function FontPickerMenu({ trigger }: FontPickerMenuProps) {
  const { font, weight, updateFont, updateWeight, resetFont, hydrated } = useGlobalFontPref();
  const groups = groupFontsByCategory();

  return (
    <Popover>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button
            variant="ghost"
            size="icon"
            title="Tùy chỉnh phông chữ"
            aria-label="Tùy chỉnh phông chữ"
          >
            <Type size={18} />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Phông chữ</h3>
            <button
              type="button"
              onClick={resetFont}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-sky-600 transition-colors"
              title="Khôi phục mặc định"
            >
              <RotateCcw size={12} />
              Mặc định
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Áp dụng cho toàn bộ giao diện. Lưu trên trình duyệt của bạn.
          </p>
        </div>

        {/* Font family picker - grouped theo category */}
        <div className="max-h-80 overflow-y-auto py-2">
          {(['vietnamese', 'sans', 'serif'] as const).map((category) => (
            <div key={category}>
              <div className="px-4 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {CATEGORY_LABELS[category]}
              </div>
              {groups[category].map((key) => {
                const isActive = hydrated && font === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => updateFont(key)}
                    className={cn(
                      'flex w-full items-center justify-between px-4 py-2 text-sm transition-colors',
                      isActive ? 'bg-sky-50 text-sky-700' : 'text-slate-700 hover:bg-slate-50',
                    )}
                    style={{ fontFamily: FONT_FAMILY_CSS[key] }}
                  >
                    <span>{GLOBAL_FONT_LABELS[key]}</span>
                    {isActive && <Check size={14} className="text-sky-600" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Font weight picker */}
        <div className="border-t border-slate-200 px-4 py-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Độ đậm
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {FONT_WEIGHT_OPTIONS.map((opt) => {
              const isActive = hydrated && weight === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateWeight(opt.value)}
                  className={cn(
                    'rounded-md border px-2 py-1.5 text-xs transition-colors',
                    isActive
                      ? 'border-sky-300 bg-sky-50 text-sky-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                  )}
                  style={{ fontWeight: opt.value }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
