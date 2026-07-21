'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';

/**
 * Reusable row-selection state cho bulk action (xóa hàng loạt, bulk-assign...).
 * Dùng Set<string> để ID lookup O(1). Pair với <BulkDeleteBar />.
 *
 * Auto-prune: khi `allItems` thay đổi (vd polling refetch list), bất kỳ
 * selectedId nào không còn xuất hiện trong list mới sẽ bị loại khỏi state.
 * Tránh bug "checkbox tàng hình" trỏ vào lead đã ra khỏi danh sách.
 */
export function useBulkSelection<T extends { id: string }>(allItems: T[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allIds = useMemo(() => allItems.map((it) => it.id), [allItems]);

  // Prune selectedIds không còn tồn tại trong allItems sau khi list refetch.
  // KISS: chỉ tạo Set mới nếu thực sự có id bị loại (tránh re-render không cần thiết).
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const currentIds = new Set(allIds);
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (currentIds.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [allIds]);

  const allSelected = allIds.length > 0 && selected.size === allIds.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = useCallback(() => {
    setSelected((prev) => (prev.size === allIds.length ? new Set() : new Set(allIds)));
  }, [allIds]);

  const clear = useCallback(() => setSelected(new Set()), []);

  return {
    selected,
    selectedIds: Array.from(selected),
    count: selected.size,
    isSelected,
    toggleOne,
    toggleAll,
    allSelected,
    someSelected,
    clear,
  };
}
