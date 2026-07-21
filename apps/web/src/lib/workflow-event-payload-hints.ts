/**
 * Top fields cua moi event payload de gop y user trong JsonLogic filter builder.
 * Mirror cua interface tu apps/api/src/common/event-bus/event-catalog.ts.
 *
 * Moi entry: { var, label, example, valueType? }
 * - var: ten field nhu user nhap vao JsonLogic (dot notation)
 * - label: mo ta tieng Viet
 * - example: gia tri vi du de show placeholder
 * - valueType: dieu khien SmartValuePicker render widget nao
 *   - 'lead-label' / 'user' / 'lead-source' / 'department': fetch list tu cache
 *   - 'lead-status' / 'customer-status' / 'order-status' / 'payment-status' /
 *     'task-priority' / 'call-direction' / 'call-status' / 'user-role' /
 *     'entity-type': enum option tu getEnumOptions()
 *   - 'number' / 'text': fallback Input
 *   - undefined: behave nhu 'text'
 */

export type ValueType =
  | 'lead-label'
  | 'user'
  | 'lead-source'
  | 'department'
  | 'lead-status'
  | 'customer-status'
  | 'order-status'
  | 'payment-status'
  | 'task-priority'
  | 'call-direction'
  | 'call-status'
  | 'user-role'
  | 'entity-type'
  | 'number'
  | 'text';

export interface PayloadHint {
  var: string;
  label: string;
  example: string;
  valueType?: ValueType;
}

const COMMON: PayloadHint[] = [
  { var: 'actor.id', label: 'ID nguoi gay ra event', example: '1', valueType: 'user' },
  { var: 'actor.role', label: 'Role nguoi gay ra event', example: 'USER', valueType: 'user-role' },
  { var: 'actor.departmentId', label: 'Phong ban nguoi gay ra', example: '2', valueType: 'department' },
];

const LEAD_BASE: PayloadHint[] = [
  { var: 'leadId', label: 'ID lead', example: '123', valueType: 'number' },
  ...COMMON,
];

const CUSTOMER_BASE: PayloadHint[] = [
  { var: 'customerId', label: 'ID khach hang', example: '456', valueType: 'number' },
  ...COMMON,
];

export const EVENT_PAYLOAD_HINTS: Record<string, PayloadHint[]> = {
  'lead.created': [
    ...LEAD_BASE,
    { var: 'lead.status', label: 'Trang thai lead', example: 'POOL', valueType: 'lead-status' },
    { var: 'lead.labelId', label: 'Nhan', example: '5', valueType: 'lead-label' },
    { var: 'lead.sourceId', label: 'Nguon', example: '3', valueType: 'lead-source' },
    { var: 'lead.departmentId', label: 'Phong ban', example: '2', valueType: 'department' },
    { var: 'lead.assignedUserId', label: 'Nguoi phu trach', example: '7', valueType: 'user' },
  ],
  'lead.updated': [
    ...LEAD_BASE,
    { var: 'before.status', label: 'Trang thai cu', example: 'POOL', valueType: 'lead-status' },
    { var: 'after.status', label: 'Trang thai moi', example: 'ASSIGNED', valueType: 'lead-status' },
    { var: 'after.labelId', label: 'Nhan moi', example: '5', valueType: 'lead-label' },
    { var: 'after.assignedUserId', label: 'Sale moi', example: '7', valueType: 'user' },
    { var: 'changedFields', label: 'Danh sach field bi doi (mang)', example: '["status"]', valueType: 'text' },
  ],
  'lead.status_changed': [
    ...LEAD_BASE,
    { var: 'before', label: 'Status cu', example: 'POOL', valueType: 'lead-status' },
    { var: 'after', label: 'Status moi', example: 'CONVERTED', valueType: 'lead-status' },
  ],
  'lead.label_changed': [
    ...LEAD_BASE,
    { var: 'before', label: 'Nhan cu', example: '3', valueType: 'lead-label' },
    { var: 'after', label: 'Nhan moi', example: '5', valueType: 'lead-label' },
  ],
  'lead.assigned_user_changed': [
    ...LEAD_BASE,
    { var: 'before', label: 'Sale cu', example: '7', valueType: 'user' },
    { var: 'after', label: 'Sale moi', example: '8', valueType: 'user' },
  ],

  'customer.created': [
    ...CUSTOMER_BASE,
    { var: 'entity.status', label: 'Trang thai khach hang', example: 'ACTIVE', valueType: 'customer-status' },
    { var: 'entity.assignedUserId', label: 'Sale phu trach', example: '7', valueType: 'user' },
  ],
  'customer.updated': [
    ...CUSTOMER_BASE,
    { var: 'after.status', label: 'Trang thai moi', example: 'INACTIVE', valueType: 'customer-status' },
    { var: 'after.assignedUserId', label: 'Sale moi', example: '8', valueType: 'user' },
    { var: 'changedFields', label: 'Field bi doi', example: '["status"]', valueType: 'text' },
  ],
  'customer.status_changed': [
    ...CUSTOMER_BASE,
    { var: 'before', label: 'Status cu', example: 'ACTIVE', valueType: 'customer-status' },
    { var: 'after', label: 'Status moi', example: 'INACTIVE', valueType: 'customer-status' },
  ],
  'customer.assigned_user_changed': [
    ...CUSTOMER_BASE,
    { var: 'before', label: 'Sale cu', example: '7', valueType: 'user' },
    { var: 'after', label: 'Sale moi', example: '8', valueType: 'user' },
  ],

  'order.created': [
    { var: 'orderId', label: 'ID don hang', example: '789', valueType: 'number' },
    { var: 'entity.status', label: 'Trang thai', example: 'PENDING', valueType: 'order-status' },
    { var: 'entity.customerId', label: 'Khach hang', example: '456', valueType: 'number' },
    { var: 'entity.totalAmount', label: 'Tong tien', example: '5000000', valueType: 'number' },
    ...COMMON,
  ],
  'order.status_changed': [
    { var: 'orderId', label: 'ID don hang', example: '789', valueType: 'number' },
    { var: 'before', label: 'Status cu', example: 'PENDING', valueType: 'order-status' },
    { var: 'after', label: 'Status moi', example: 'COMPLETED', valueType: 'order-status' },
    ...COMMON,
  ],

  'payment.created': [
    { var: 'paymentId', label: 'ID thanh toan', example: '1001', valueType: 'number' },
    { var: 'entity.status', label: 'Trang thai', example: 'PENDING', valueType: 'payment-status' },
    { var: 'entity.amount', label: 'So tien', example: '1000000', valueType: 'number' },
    { var: 'entity.orderId', label: 'Don hang', example: '789', valueType: 'number' },
    ...COMMON,
  ],
  'payment.status_changed': [
    { var: 'paymentId', label: 'ID thanh toan', example: '1001', valueType: 'number' },
    { var: 'before', label: 'Status cu', example: 'PENDING', valueType: 'payment-status' },
    { var: 'after', label: 'Status moi', example: 'VERIFIED', valueType: 'payment-status' },
    ...COMMON,
  ],

  'task.created': [
    { var: 'entity.id', label: 'ID cong viec', example: '2001', valueType: 'number' },
    { var: 'entity.assignedTo', label: 'Nguoi nhan', example: '7', valueType: 'user' },
    { var: 'entity.priority', label: 'Do uu tien', example: 'HIGH', valueType: 'task-priority' },
    { var: 'entity.entityType', label: 'Loai entity lien quan', example: 'LEAD', valueType: 'entity-type' },
    ...COMMON,
  ],
  'task.completed': [
    { var: 'entity.id', label: 'ID cong viec', example: '2001', valueType: 'number' },
    { var: 'entity.assignedTo', label: 'Nguoi hoan thanh', example: '7', valueType: 'user' },
    ...COMMON,
  ],

  'activity.created': [
    { var: 'entity.id', label: 'ID hoat dong', example: '3001', valueType: 'number' },
    { var: 'entity.type', label: 'Loai hoat dong', example: 'NOTE', valueType: 'text' },
    { var: 'entity.entityType', label: 'Loai entity', example: 'LEAD', valueType: 'entity-type' },
    { var: 'entity.entityId', label: 'ID entity', example: '123', valueType: 'number' },
    ...COMMON,
  ],
  'call_log.created': [
    { var: 'entity.id', label: 'ID cuoc goi', example: '4001', valueType: 'number' },
    { var: 'entity.direction', label: 'Goi den/di', example: 'INBOUND', valueType: 'call-direction' },
    { var: 'entity.status', label: 'Trang thai goi', example: 'ANSWERED', valueType: 'call-status' },
    { var: 'entity.duration', label: 'Thoi luong (giay)', example: '120', valueType: 'number' },
    ...COMMON,
  ],
};

export function getEventHints(eventName: string): PayloadHint[] {
  return EVENT_PAYLOAD_HINTS[eventName] ?? COMMON;
}

/** Lookup hint cua 1 var path trong context cua event (tra ve undefined neu khong tim thay). */
export function findHintForVar(eventName: string, varPath: string): PayloadHint | undefined {
  return getEventHints(eventName).find((h) => h.var === varPath);
}
