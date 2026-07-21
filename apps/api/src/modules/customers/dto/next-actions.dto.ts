/** Loại item trong Next Actions card. */
export type NextActionKind = 'OVERDUE_TASK' | 'TODAY_TASK' | 'PENDING_PAYMENT';

export interface NextActionItem {
  kind: NextActionKind;
  /** ID của entity gốc (taskId hoặc paymentId). */
  refId: string;
  /** Tiêu đề ngắn hiển thị trên card. */
  title: string;
  /** Meta info phụ: ngày, giờ, hoặc số tiền. */
  meta: string;
  /** Route navigate khi click item. */
  href: string;
}

export interface NextActionsResponse {
  items: NextActionItem[];
}
