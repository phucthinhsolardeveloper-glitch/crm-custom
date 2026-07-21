'use client';

import { useCallback, useRef } from 'react';

/**
 * Detect long-press gesture (giữ tay 500ms) tách biệt với tap thường.
 *
 * Hủy timeout nếu pointer move > 10px (user đang scroll vertical, không phải
 * giữ tay) hoặc khi pointer rời element (`pointerleave`/`pointercancel`).
 *
 * Pointer Events API cover cả touch + mouse + pen - không cần track riêng
 * `touchstart`/`mousedown`.
 *
 * Usage:
 *   const bind = useLongPress({
 *     onLongPress: () => setSelectionMode(true),
 *     onTap: () => openDrawer(),
 *   });
 *   <div {...bind}> ... </div>
 *
 * Lưu ý cho caller:
 * - `onTap` chỉ fire khi pointer up TRƯỚC threshold + không move quá ngưỡng.
 * - Trong selection mode, caller nên đổi `onTap` thành toggle-select (không
 *   mở drawer) - hook chỉ chịu trách nhiệm phát hiện gesture.
 */
interface LongPressOptions {
  onLongPress: () => void;
  onTap?: () => void;
  /** Ngưỡng giữ tay (ms). Default 500ms - chuẩn iOS/Android long-press. */
  ms?: number;
  /** Ngưỡng move (px) trước khi hủy. Default 10px - đủ tránh trigger khi scroll. */
  moveThreshold?: number;
}

export function useLongPress({ onLongPress, onTap, ms = 500, moveThreshold = 10 }: LongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const triggeredRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    triggeredRef.current = false;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    timerRef.current = setTimeout(() => {
      triggeredRef.current = true;
      onLongPress();
    }, ms);
  }, [onLongPress, ms]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!startPosRef.current || !timerRef.current) return;
    const dx = e.clientX - startPosRef.current.x;
    const dy = e.clientY - startPosRef.current.y;
    if (Math.hypot(dx, dy) > moveThreshold) clearTimer();
  }, [clearTimer, moveThreshold]);

  const onPointerUp = useCallback(() => {
    const wasLongPress = triggeredRef.current;
    // `hadStart` = pointerDown có thực sự bắt đầu TRÊN element này không. Nếu user
    // chạm vào action zone (cây bút, phone, notes...) - các zone đó đã
    // stopPropagation ở onPointerDown nên startPosRef vẫn null. Không guard bằng
    // hadStart -> pointerUp vẫn bubble lên card -> onTap fire -> mở nhầm edit drawer
    // dù user bấm nút khác. Đây là lý do "bấm chỗ nào cũng mở thông tin".
    const hadStart = startPosRef.current !== null;
    clearTimer();
    startPosRef.current = null;
    // Tap = pointer up trước khi long-press fire + pointerDown bắt đầu trên card.
    if (!wasLongPress && hadStart && onTap) onTap();
  }, [clearTimer, onTap]);

  const onPointerLeave = useCallback(() => {
    clearTimer();
    startPosRef.current = null;
  }, [clearTimer]);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
    onPointerCancel: onPointerLeave,
  };
}
