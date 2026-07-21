'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LeadFilterDatePicker } from '@/components/leads/lead-filter-date-picker';
import { FilterSearchableSelect } from '@/components/leads/filter-searchable-select';
import { AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PendingFilters } from '@/components/leads/lead-list-advanced-filter-bar';
import { SORT_OPTIONS } from '@/components/leads/lead-list-advanced-filter-bar';

const POOL_OPTIONS = [
  { value: 'POOL', label: 'Kho phòng ban' },
  { value: 'FLOATING', label: 'Kho thả nổi' },
];

const ASSIGNMENT_OPTIONS = [
  { value: 'unassigned', label: 'Chưa phân' },
  { value: 'dept', label: 'Đã phân phòng ban' },
  { value: 'user', label: 'Đã phân sale' },
];

interface LeadFilterMobileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  /** Pending state user đang sửa (chưa apply). */
  pending: PendingFilters;
  /** Set pending state scalar field. */
  updateField: <K extends keyof PendingFilters>(key: K, value: PendingFilters[K]) => void;
  /** Toggle status chip (Kho phòng ban / Kho thả nổi). */
  toggleStatus: (s: string) => void;

  pendingCount: number;
  applyFilters: () => void;
  clearAll: () => void;

  /** Sort hiện tại "field:dir" + callback đổi sort (apply ngay, không qua pending). */
  currentSort: string;
  onSortChange: (value: string) => void;

  // Reference data
  sources: { id: string; name: string }[];
  groups: { id: string; name: string }[];
  products: { id: string; name: string }[];
  users: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  teams: { id: string; name: string }[];
  labels: { id: string; name: string; color: string }[];

  hideStatus: boolean;
  /** Trang kho: ẩn filter "Phân bổ" (scope kho đã cố định assignment trên URL). */
  hideAssignment?: boolean;
  isManagerPlus: boolean;
}

/**
 * Bottom sheet hiển thị toàn bộ filter cho mobile (< 768px).
 *
 * State quản lý ở parent (`LeadListAdvancedFilterBar`) - sheet là dumb
 * component nhận props + emit qua callback. Tránh duplicate logic parse-URL
 * + buildParams + apply (đã có ở parent).
 *
 * Layout: sticky header [Tiêu đề + ✕] -> scroll body [Date + Kho + Selects]
 * -> sticky footer [Xóa lọc] [Áp dụng (n)]. Height 85vh - đủ cho ~8 form
 * group + giữ context viewport phía trên.
 */
export function LeadFilterMobileSheet({
  open, onOpenChange,
  pending, updateField, toggleStatus,
  pendingCount, applyFilters, clearAll,
  currentSort, onSortChange,
  sources, groups, products, users, departments, teams, labels,
  hideStatus, hideAssignment = false, isManagerPlus,
}: LeadFilterMobileSheetProps) {

  function handleApply() {
    applyFilters();
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[85vh] rounded-t-2xl p-0 flex flex-col"
      >
        {/* Sticky header */}
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-slate-100 flex-shrink-0">
          <SheetTitle className="text-lg">Bộ lọc nâng cao</SheetTitle>
          <SheetDescription className="sr-only">
            Chọn các tiêu chí lọc lead và bấm Áp dụng để xem kết quả
          </SheetDescription>
        </SheetHeader>

        {/* Scroll body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Pending banner */}
          {pendingCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>
                Có <strong>{pendingCount}</strong> thay đổi chưa áp dụng - bấm <strong>Áp dụng</strong> để xem.
              </span>
            </div>
          )}

          {/* Sắp xếp - apply NGAY khi chọn (không qua nút Áp dụng), đóng sheet luôn cho gọn */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2 block">
              Sắp xếp
            </label>
            <Select value={currentSort} onValueChange={(v) => { onSortChange(v); onOpenChange(false); }}>
              <SelectTrigger className="h-11 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date filter group */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2 block">
              Thời gian
            </label>
            <LeadFilterDatePicker
              mode={pending.timeMode}
              onModeChange={(m) => updateField('timeMode', m)}
              preset={pending.preset}
              onPresetChange={(p) => updateField('preset', p)}
              from={pending.dateFrom}
              to={pending.dateTo}
              onFromChange={(v) => updateField('dateFrom', v)}
              onToChange={(v) => updateField('dateTo', v)}
            />
          </div>

          {/* Toggle lọc trùng / không trùng SĐT - hiện cho mọi role. 2 nút loại trừ lẫn nhau. */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2 block">
              Lọc trùng
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  updateField('duplicatesOnly', pending.duplicatesOnly === 'true' ? '' : 'true');
                  updateField('nonDuplicatesOnly', '');
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium border transition-colors',
                  pending.duplicatesOnly === 'true'
                    ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200',
                )}
              >
                {pending.duplicatesOnly === 'true' && <span className="text-[10px]">✓</span>}
                Chỉ hiện lead trùng SĐT
              </button>
              <button
                type="button"
                onClick={() => {
                  updateField('nonDuplicatesOnly', pending.nonDuplicatesOnly === 'true' ? '' : 'true');
                  updateField('duplicatesOnly', '');
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium border transition-colors',
                  pending.nonDuplicatesOnly === 'true'
                    ? 'bg-sky-500 text-white border-sky-500 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200',
                )}
              >
                {pending.nonDuplicatesOnly === 'true' && <span className="text-[10px]">✓</span>}
                Chỉ hiện lead không trùng SĐT
              </button>
            </div>
          </div>

          {/* Status chips (USER only) */}
          {!hideStatus && (
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2 block">
                Chọn kho
              </label>
              <div className="flex flex-wrap gap-2">
                {POOL_OPTIONS.map((s) => {
                  const checked = pending.statuses.includes(s.value);
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => toggleStatus(s.value)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium border transition-colors',
                        checked
                          ? 'bg-sky-500 text-white border-sky-500 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200',
                      )}
                    >
                      {checked && <span className="text-[10px]">✓</span>}
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Select fields - 1 col stack vertical cho mobile */}
          <div className="space-y-3">
            {isManagerPlus && !hideAssignment && (
              <SelectField
                label="Phân bổ"
                value={pending.assignment}
                onChange={(v) => updateField('assignment', v)}
                options={ASSIGNMENT_OPTIONS}
              />
            )}

            <SearchableField
              label="Nguồn"
              value={pending.sourceId}
              onChange={(v) => updateField('sourceId', v)}
              options={sources.map((s) => ({ value: s.id, label: s.name }))}
              searchPlaceholder="Tìm nguồn..."
            />

            <SearchableField
              label="Nhóm"
              value={pending.groupId}
              onChange={(v) => updateField('groupId', v)}
              options={groups.map((g) => ({ value: g.id, label: g.name }))}
              searchPlaceholder="Tìm nhóm..."
            />

            <SearchableField
              label="Sản phẩm"
              value={pending.productId}
              onChange={(v) => updateField('productId', v)}
              options={products.map((p) => ({ value: p.id, label: p.name }))}
              searchPlaceholder="Tìm sản phẩm..."
            />

            {isManagerPlus && (
              <SearchableField
                label="Phòng ban"
                value={pending.departmentId}
                onChange={(v) => updateField('departmentId', v)}
                options={departments.map((d) => ({ value: d.id, label: d.name }))}
                searchPlaceholder="Tìm phòng ban..."
              />
            )}

            {isManagerPlus && teams.length > 0 && (
              <SearchableField
                label="Nhóm sale"
                value={pending.teamId}
                onChange={(v) => updateField('teamId', v)}
                options={teams.map((t) => ({ value: t.id, label: t.name }))}
                searchPlaceholder="Tìm nhóm sale..."
              />
            )}

            {isManagerPlus && (
              <SearchableField
                label="Nhân viên"
                value={pending.assignedUserId}
                onChange={(v) => updateField('assignedUserId', v)}
                options={users.map((u) => ({ value: u.id, label: u.name }))}
                searchPlaceholder="Tìm nhân viên..."
              />
            )}

            <SearchableField
              label="Nhãn"
              value={pending.labelId}
              onChange={(v) => updateField('labelId', v)}
              options={labels.map((l) => ({ value: l.id, label: l.name, dotColor: l.color }))}
              searchPlaceholder="Tìm nhãn..."
            />

            <SelectField
              label="Đơn hàng"
              value={pending.hasOrder}
              onChange={(v) => updateField('hasOrder', v)}
              options={[
                { value: 'true', label: 'Có đơn hàng' },
                { value: 'false', label: 'Chưa có đơn' },
              ]}
            />
          </div>
        </div>

        {/* Sticky footer */}
        <div className="flex gap-2.5 px-4 py-3 border-t border-slate-100 bg-white flex-shrink-0">
          <Button
            variant="outline"
            onClick={() => { clearAll(); onOpenChange(false); }}
            className="flex-1 h-12"
          >
            <X className="h-4 w-4 mr-1" />Xóa lọc
          </Button>
          <Button
            onClick={handleApply}
            className="flex-[2] h-12 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600 text-white shadow-md"
          >
            Áp dụng{pendingCount > 0 && ` (${pendingCount})`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Local SelectField để DRY 8+ select trong sheet. Empty placeholder = "Tất cả". */
interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; dotColor?: string }[];
}

/** Local field bọc FilterSearchableSelect (multi) + label - dùng cho mọi filter đa chọn. */
function SearchableField({
  label, value, onChange, options, searchPlaceholder,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  options: { value: string; label: string; dotColor?: string }[];
  searchPlaceholder?: string;
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5 block">
        {label}
      </label>
      <FilterSearchableSelect
        value={value}
        onChange={onChange}
        options={options}
        searchPlaceholder={searchPlaceholder}
        triggerClassName="h-11"
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: SelectFieldProps) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5 block">
        {label}
      </label>
      <Select value={value || 'all'} onValueChange={(v) => onChange(v === 'all' ? '' : v)}>
        <SelectTrigger className="h-11 text-sm">
          <SelectValue placeholder="Tất cả" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.dotColor && (
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1.5"
                  style={{ backgroundColor: o.dotColor }}
                />
              )}
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
