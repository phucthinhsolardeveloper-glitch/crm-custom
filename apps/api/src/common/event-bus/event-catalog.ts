import type { ActorContext } from './system-actor';

/**
 * Semantic event names emitted by DomainEventBridge.
 * Listeners subscribe via @OnEvent(EVENT_NAMES.LEAD_LABEL_CHANGED) etc.
 *
 * Naming: `<entity>.<action>` lower snake_case for action.
 */
export const EVENT_NAMES = {
  LEAD_CREATED: 'lead.created',
  LEAD_UPDATED: 'lead.updated',
  LEAD_STATUS_CHANGED: 'lead.status_changed',
  LEAD_LABEL_CHANGED: 'lead.label_changed',
  LEAD_ASSIGNED_USER_CHANGED: 'lead.assigned_user_changed',

  CUSTOMER_CREATED: 'customer.created',
  CUSTOMER_UPDATED: 'customer.updated',
  CUSTOMER_STATUS_CHANGED: 'customer.status_changed',
  CUSTOMER_ASSIGNED_USER_CHANGED: 'customer.assigned_user_changed',

  ORDER_CREATED: 'order.created',
  ORDER_STATUS_CHANGED: 'order.status_changed',

  PAYMENT_CREATED: 'payment.created',
  PAYMENT_STATUS_CHANGED: 'payment.status_changed',

  TASK_CREATED: 'task.created',
  TASK_COMPLETED: 'task.completed',

  ACTIVITY_CREATED: 'activity.created',
  CALL_LOG_CREATED: 'call_log.created',
} as const;

export type SemanticEventName = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];

export interface BaseSemanticEvent {
  actor: ActorContext;
  at: Date;
}

export interface LeadCreatedEvent extends BaseSemanticEvent {
  type: 'lead.created';
  leadId: bigint;
  lead: Record<string, unknown>;
}

export interface LeadUpdatedEvent extends BaseSemanticEvent {
  type: 'lead.updated';
  leadId: bigint;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  changedFields: string[];
}

export interface LeadStatusChangedEvent extends BaseSemanticEvent {
  type: 'lead.status_changed';
  leadId: bigint;
  before: string;
  after: string;
}

export interface LeadLabelChangedEvent extends BaseSemanticEvent {
  type: 'lead.label_changed';
  leadId: bigint;
  before: bigint | null;
  after: bigint | null;
}

export interface LeadAssignedUserChangedEvent extends BaseSemanticEvent {
  type: 'lead.assigned_user_changed';
  leadId: bigint;
  before: bigint | null;
  after: bigint | null;
}

export interface CustomerStatusChangedEvent extends BaseSemanticEvent {
  type: 'customer.status_changed';
  customerId: bigint;
  before: string;
  after: string;
}

export interface OrderStatusChangedEvent extends BaseSemanticEvent {
  type: 'order.status_changed';
  orderId: bigint;
  before: string;
  after: string;
}

export interface PaymentStatusChangedEvent extends BaseSemanticEvent {
  type: 'payment.status_changed';
  paymentId: bigint;
  before: string;
  after: string;
}

export interface GenericCreatedEvent extends BaseSemanticEvent {
  type:
    | 'customer.created'
    | 'order.created'
    | 'payment.created'
    | 'task.created'
    | 'activity.created'
    | 'call_log.created';
  entityId: bigint;
  entity: Record<string, unknown>;
}

export type SemanticEvent =
  | LeadCreatedEvent
  | LeadUpdatedEvent
  | LeadStatusChangedEvent
  | LeadLabelChangedEvent
  | LeadAssignedUserChangedEvent
  | CustomerStatusChangedEvent
  | OrderStatusChangedEvent
  | PaymentStatusChangedEvent
  | GenericCreatedEvent;
