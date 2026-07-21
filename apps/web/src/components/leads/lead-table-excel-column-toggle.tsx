'use client';

import { useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Settings, RotateCcw, GripVertical, Lock } from 'lucide-react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { LeadTableRowStyleSettings } from '@/components/leads/lead-table-row-style-settings';
import { LeadColumnStylePopover } from '@/components/leads/lead-column-style-popover';
import { LeadTypographyGlobalControl } from '@/components/leads/lead-typography-global-control';
import { useLeadColumns } from '@/components/leads/lead-columns-context';

export interface ToggleableColumn {
  key: string;
  label: string;
  /** Sticky columns (name, phone, edit, actions) - không cho drag reorder, chỉ toggle visibility (nếu hideable). */
  sticky?: boolean;
}

interface ColumnToggleProps {
  columns: ToggleableColumn[];
  isVisible: (key: string) => boolean;
  onToggle: (key: string) => void;
  onReset: () => void;
  /** Current order của non-sticky columns (subset). */
  order: string[];
  onReorder: (next: string[]) => void;
}

/**
 * Popover: ẩn/hiện cột + drag-reorder cột non-sticky.
 * - Sticky columns (Tên/SĐT/Thao tác) render khóa, chỉ checkbox toggle (nếu cho ẩn).
 * - Non-sticky render với grip handle, kéo thả để đổi thứ tự.
 * - Order propagate lên cha qua onReorder; cha persist vào localStorage qua useColumnPrefs.
 */
export function LeadTableExcelColumnToggle({
  columns, isVisible, onToggle, onReset, order, onReorder,
}: ColumnToggleProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Tách sticky vs draggable. Sticky always render đầu (informational, lock icon).
  const stickyCols = useMemo(() => columns.filter((c) => c.sticky), [columns]);
  const draggableCols = useMemo(() => columns.filter((c) => !c.sticky), [columns]);

  // Effective order: prefer saved order; fallback theo thứ tự columns gốc.
  const effectiveOrder = useMemo(() => {
    const keys = draggableCols.map((c) => c.key);
    if (order.length === 0) return keys;
    // Validate: order chỉ chứa keys hợp lệ, append columns mới chưa có trong order.
    const set = new Set(keys);
    const valid = order.filter((k) => set.has(k));
    const missing = keys.filter((k) => !order.includes(k));
    return [...valid, ...missing];
  }, [draggableCols, order]);

  const orderedDraggable = useMemo(() => {
    const map = new Map(draggableCols.map((c) => [c.key, c]));
    return effectiveOrder.map((k) => map.get(k)).filter((c): c is ToggleableColumn => !!c);
  }, [draggableCols, effectiveOrder]);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = effectiveOrder.indexOf(String(active.id));
    const newIdx = effectiveOrder.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    onReorder(arrayMove(effectiveOrder, oldIdx, newIdx));
  }

  // Reset gộp: columns + typography + per-column styles + row colors
  // 2026-05-23: khôi phục lại Typography section + reset typography trong reset all.
  // layoutLocked: bố cục cột khóa theo phòng ban - ẩn section ẩn/hiện + reorder,
  // reset chỉ áp style cá nhân (không đụng bố cục do admin quản).
  const { resetAllColumns: resetColumnStyles, resetRowStyles, resetTypography, layoutLocked } = useLeadColumns();
  function handleResetAll() {
    if (!layoutLocked) onReset();
    resetColumnStyles();
    resetRowStyles();
    resetTypography();
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-8">
          <Settings className="h-3.5 w-3.5 mr-1.5" />
          Setting
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="end">
        <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100 mb-1">
          <span className="text-xs font-medium text-slate-500">Tùy chỉnh bảng</span>
          <button
            type="button"
            onClick={handleResetAll}
            className="text-[11px] text-sky-600 hover:text-sky-700 flex items-center gap-1"
            title="Khôi phục mặc định (cột + typography)"
          >
            <RotateCcw className="h-3 w-3" />
            Reset tất cả
          </button>
        </div>

        <div className="max-h-[520px] overflow-y-auto px-1">
          {/* Section: Global typography (font size/weight/color + apply toggles).
              2026-05-23: khôi phục sau khi xóa 2026-05-21 (per user feedback). */}
          <div className="pb-3 mb-2 border-b border-slate-100">
            <div className="px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Kiểu chữ toàn bảng
            </div>
            <LeadTypographyGlobalControl />
          </div>

          {/* Section: Row colors (zebra pair + hover + selected). */}
          <div className="pb-3 mb-2 border-b border-slate-100">
            <div className="px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Màu dòng
            </div>
            <LeadTableRowStyleSettings />
          </div>

          {/* Section: Columns visibility + reorder + per-column style (header + data).
              Khi layoutLocked (bố cục theo phòng ban): ẩn toggle/reorder, chỉ còn hint
              + style palette (width/typography/màu vẫn là pref cá nhân). */}
          {layoutLocked ? (
            <div className="px-2 py-2 text-xs text-slate-500 bg-slate-50 rounded-lg flex items-start gap-2">
              <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-400" />
              <span>
                Bố cục cột do quản trị viên cấu hình cho phòng ban của bạn.
                Bạn vẫn chỉnh được độ rộng cột, kiểu chữ và màu sắc.
              </span>
            </div>
          ) : (
          <>
          <div className="px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Hiển thị cột (kéo để đổi thứ tự, palette đổi font/màu cột - cả header và data)
          </div>
          {/* Sticky columns - không drag, hiển thị icon khóa nhưng vẫn cho style */}
          {stickyCols.length > 0 && (
            <div className="mb-1">
              {stickyCols.map((col) => (
                <div
                  key={col.key}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-slate-500"
                  title="Cột cố định - không thể di chuyển"
                >
                  <Lock className="h-3 w-3 text-slate-300 shrink-0" />
                  <span className="flex-1 truncate">{col.label}</span>
                  <LeadColumnStylePopover columnKey={col.key} columnLabel={col.label} />
                </div>
              ))}
              <div className="my-1 border-t border-dashed border-slate-100" />
            </div>
          )}

          {/* Draggable columns */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={effectiveOrder} strategy={verticalListSortingStrategy}>
              {orderedDraggable.map((col) => (
                <SortableRow
                  key={col.key}
                  col={col}
                  checked={isVisible(col.key)}
                  onToggle={() => onToggle(col.key)}
                />
              ))}
            </SortableContext>
          </DndContext>
          </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface SortableRowProps {
  col: ToggleableColumn;
  checked: boolean;
  onToggle: () => void;
}

/** Single row trong list - kéo grip + checkbox toggle. */
function SortableRow({ col, checked, onToggle }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.key });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 text-sm group"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 shrink-0"
        title="Kéo để đổi thứ tự"
        aria-label={`Kéo cột ${col.label}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <label className="flex items-center gap-2 flex-1 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
        />
        <span className="text-slate-700 truncate">{col.label}</span>
      </label>
      <LeadColumnStylePopover columnKey={col.key} columnLabel={col.label} />
    </div>
  );
}
