import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { RawEventBus, RawMutationEvent } from '@crm/database';

/**
 * Internal Prisma -> NestJS bridge.
 *
 * Prisma extension calls `emit()` synchronously after a successful query.
 * We forward to EventEmitter2 on a private `__raw__` channel.
 * DomainEventBridge listens to `__raw__` and translates raw mutations
 * into semantic events (lead.label_changed, etc.).
 */
@Injectable()
export class RawEventBusImpl implements RawEventBus {
  static readonly RAW_CHANNEL = '__raw__';

  constructor(private readonly emitter: EventEmitter2) {}

  emit(event: RawMutationEvent): void {
    this.emitter.emit(RawEventBusImpl.RAW_CHANNEL, event);
  }
}
