/**
 * Định nghĩa 7 tab của trang Customer Detail Hybrid + parse helpers.
 * Tab state lưu ở URL query param `?tab=<key>` để shareable.
 */
export const CUSTOMER_TABS = [
  { key: 'overview', label: 'Tổng quan', countField: null },
  { key: 'orders', label: 'Đơn hàng', countField: 'orders' },
  { key: 'leads', label: 'Lead', countField: 'leads' },
  { key: 'activity', label: 'Hoạt động', countField: null },
  { key: 'notes', label: 'Note', countField: null },
  { key: 'payments', label: 'Payment', countField: null },
  { key: 'files', label: 'File', countField: null },
] as const;

export type CustomerTabKey = (typeof CUSTOMER_TABS)[number]['key'];

const VALID_KEYS = new Set(CUSTOMER_TABS.map((t) => t.key));

/** Parse raw query param → valid tab key. Fallback `overview` cho input invalid. */
export function parseCustomerTab(raw: string | undefined | null): CustomerTabKey {
  return raw && VALID_KEYS.has(raw as CustomerTabKey) ? (raw as CustomerTabKey) : 'overview';
}

/** Lookup label theo key. */
export function getCustomerTabLabel(key: CustomerTabKey): string {
  return CUSTOMER_TABS.find((t) => t.key === key)?.label ?? 'Tổng quan';
}
