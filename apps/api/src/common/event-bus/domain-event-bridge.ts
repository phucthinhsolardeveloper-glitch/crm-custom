import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { ClsService } from 'nestjs-cls';
import type { RawMutationEvent } from '@crm/database';
import { RawEventBusImpl } from './raw-event-bus.impl';
import { EVENT_NAMES } from './event-catalog';
import { SYSTEM_ACTOR, type ActorContext } from './system-actor';

/**
 * Translates raw Prisma mutations into semantic domain events.
 *
 * Pipeline: Prisma extension -> RawEventBus -> EventEmitter2 ('__raw__') -> this -> EventEmitter2 (semantic)
 *
 * Rules:
 * - Skip emit when CLS flag `mode === 'bulk'` (CSV import path).
 * - Resolve actor from CLS, fallback to SYSTEM_ACTOR for worker contexts.
 * - Emit BOTH a generic `<entity>.updated` event AND specialized events
 *   for tracked field changes (status, label, assigned user). Consumers can
 *   choose granularity.
 */
@Injectable()
export class DomainEventBridge {
  private readonly logger = new Logger(DomainEventBridge.name);

  constructor(
    private readonly emitter: EventEmitter2,
    private readonly cls: ClsService,
  ) {}

  @OnEvent(RawEventBusImpl.RAW_CHANNEL)
  handle(raw: RawMutationEvent): void {
    if (this.cls.get('mode') === 'bulk') return;

    const actor: ActorContext = this.cls.get('actor') ?? SYSTEM_ACTOR;
    const base = { actor, at: raw.at };

    try {
      switch (raw.model) {
        case 'Lead':
          return this.handleLead(raw, base);
        case 'Customer':
          return this.handleCustomer(raw, base);
        case 'Order':
          return this.handleOrder(raw, base);
        case 'Payment':
          return this.handlePayment(raw, base);
        case 'Task':
          return this.handleTask(raw, base);
        case 'Activity':
          return this.handleActivity(raw, base);
        case 'CallLog':
          return this.handleCallLog(raw, base);
      }
    } catch (err) {
      this.logger.error(
        `Bridge failed for ${raw.model}.${raw.op}: ${(err as Error).message}`,
      );
    }
  }

  private handleLead(raw: RawMutationEvent, base: { actor: ActorContext; at: Date }): void {
    if (raw.op === 'create' && raw.after) {
      const lead = raw.after as Record<string, any>;
      this.emitter.emit(EVENT_NAMES.LEAD_CREATED, {
        type: EVENT_NAMES.LEAD_CREATED,
        leadId: lead.id,
        lead,
        ...base,
      });
      return;
    }
    if (raw.op === 'update' && raw.before && raw.after) {
      const before = raw.before as Record<string, any>;
      const after = raw.after as Record<string, any>;
      const leadId = after.id;

      if (before.status !== after.status) {
        this.emitter.emit(EVENT_NAMES.LEAD_STATUS_CHANGED, {
          type: EVENT_NAMES.LEAD_STATUS_CHANGED,
          leadId,
          before: before.status,
          after: after.status,
          ...base,
        });
      }
      if (before.labelId !== after.labelId) {
        this.emitter.emit(EVENT_NAMES.LEAD_LABEL_CHANGED, {
          type: EVENT_NAMES.LEAD_LABEL_CHANGED,
          leadId,
          before: before.labelId,
          after: after.labelId,
          ...base,
        });
      }
      if (before.assignedUserId !== after.assignedUserId) {
        this.emitter.emit(EVENT_NAMES.LEAD_ASSIGNED_USER_CHANGED, {
          type: EVENT_NAMES.LEAD_ASSIGNED_USER_CHANGED,
          leadId,
          before: before.assignedUserId,
          after: after.assignedUserId,
          ...base,
        });
      }

      const changedFields = this.diffKeys(before, after);
      if (changedFields.length > 0) {
        this.emitter.emit(EVENT_NAMES.LEAD_UPDATED, {
          type: EVENT_NAMES.LEAD_UPDATED,
          leadId,
          before,
          after,
          changedFields,
          ...base,
        });
      }
    }
  }

  private handleCustomer(raw: RawMutationEvent, base: { actor: ActorContext; at: Date }): void {
    if (raw.op === 'create' && raw.after) {
      const c = raw.after as Record<string, any>;
      this.emitter.emit(EVENT_NAMES.CUSTOMER_CREATED, {
        type: EVENT_NAMES.CUSTOMER_CREATED,
        entityId: c.id,
        entity: c,
        ...base,
      });
      return;
    }
    if (raw.op === 'update' && raw.before && raw.after) {
      const before = raw.before as Record<string, any>;
      const after = raw.after as Record<string, any>;
      if (before.status !== after.status) {
        this.emitter.emit(EVENT_NAMES.CUSTOMER_STATUS_CHANGED, {
          type: EVENT_NAMES.CUSTOMER_STATUS_CHANGED,
          customerId: after.id,
          before: before.status,
          after: after.status,
          ...base,
        });
      }
      if (before.assignedUserId !== after.assignedUserId) {
        this.emitter.emit(EVENT_NAMES.CUSTOMER_ASSIGNED_USER_CHANGED, {
          type: EVENT_NAMES.CUSTOMER_ASSIGNED_USER_CHANGED,
          customerId: after.id,
          before: before.assignedUserId,
          after: after.assignedUserId,
          ...base,
        });
      }
    }
  }

  private handleOrder(raw: RawMutationEvent, base: { actor: ActorContext; at: Date }): void {
    if (raw.op === 'create' && raw.after) {
      const o = raw.after as Record<string, any>;
      this.emitter.emit(EVENT_NAMES.ORDER_CREATED, {
        type: EVENT_NAMES.ORDER_CREATED,
        entityId: o.id,
        entity: o,
        ...base,
      });
      return;
    }
    if (raw.op === 'update' && raw.before && raw.after) {
      const before = raw.before as Record<string, any>;
      const after = raw.after as Record<string, any>;
      if (before.status !== after.status) {
        this.emitter.emit(EVENT_NAMES.ORDER_STATUS_CHANGED, {
          type: EVENT_NAMES.ORDER_STATUS_CHANGED,
          orderId: after.id,
          before: before.status,
          after: after.status,
          ...base,
        });
      }
    }
  }

  private handlePayment(raw: RawMutationEvent, base: { actor: ActorContext; at: Date }): void {
    if (raw.op === 'create' && raw.after) {
      const p = raw.after as Record<string, any>;
      this.emitter.emit(EVENT_NAMES.PAYMENT_CREATED, {
        type: EVENT_NAMES.PAYMENT_CREATED,
        entityId: p.id,
        entity: p,
        ...base,
      });
      return;
    }
    if (raw.op === 'update' && raw.before && raw.after) {
      const before = raw.before as Record<string, any>;
      const after = raw.after as Record<string, any>;
      if (before.status !== after.status) {
        this.emitter.emit(EVENT_NAMES.PAYMENT_STATUS_CHANGED, {
          type: EVENT_NAMES.PAYMENT_STATUS_CHANGED,
          paymentId: after.id,
          before: before.status,
          after: after.status,
          ...base,
        });
      }
    }
  }

  private handleTask(raw: RawMutationEvent, base: { actor: ActorContext; at: Date }): void {
    if (raw.op === 'create' && raw.after) {
      const t = raw.after as Record<string, any>;
      this.emitter.emit(EVENT_NAMES.TASK_CREATED, {
        type: EVENT_NAMES.TASK_CREATED,
        entityId: t.id,
        entity: t,
        ...base,
      });
      return;
    }
    if (raw.op === 'update' && raw.before && raw.after) {
      const before = raw.before as Record<string, any>;
      const after = raw.after as Record<string, any>;
      if (before.status !== 'COMPLETED' && after.status === 'COMPLETED') {
        this.emitter.emit(EVENT_NAMES.TASK_COMPLETED, {
          type: EVENT_NAMES.TASK_COMPLETED,
          entityId: after.id,
          entity: after,
          ...base,
        });
      }
    }
  }

  private handleActivity(raw: RawMutationEvent, base: { actor: ActorContext; at: Date }): void {
    if (raw.op === 'create' && raw.after) {
      const a = raw.after as Record<string, any>;
      this.emitter.emit(EVENT_NAMES.ACTIVITY_CREATED, {
        type: EVENT_NAMES.ACTIVITY_CREATED,
        entityId: a.id,
        entity: a,
        ...base,
      });
    }
  }

  private handleCallLog(raw: RawMutationEvent, base: { actor: ActorContext; at: Date }): void {
    if (raw.op === 'create' && raw.after) {
      const c = raw.after as Record<string, any>;
      this.emitter.emit(EVENT_NAMES.CALL_LOG_CREATED, {
        type: EVENT_NAMES.CALL_LOG_CREATED,
        entityId: c.id,
        entity: c,
        ...base,
      });
    }
  }

  /** Returns keys whose values differ between before and after (shallow compare). */
  private diffKeys(before: Record<string, any>, after: Record<string, any>): string[] {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const changed: string[] = [];
    for (const k of keys) {
      if (this.normalize(before[k]) !== this.normalize(after[k])) changed.push(k);
    }
    return changed;
  }

  private normalize(v: unknown): string {
    if (v === null || v === undefined) return '__null__';
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
}
