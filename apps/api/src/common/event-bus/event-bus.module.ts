import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ClsModule } from 'nestjs-cls';
import './cls-store.types';
import { RawEventBusImpl } from './raw-event-bus.impl';
import { DomainEventBridge } from './domain-event-bridge';

/**
 * Global event bus infrastructure.
 *
 * - EventEmitter2 (wildcard) for fan-out to event listeners (audit, etc.).
 * - nestjs-cls for actor + mode propagation through async chains.
 * - ClsMiddleware mounted globally: stores req.user as `actor` in CLS.
 *
 * Workers and cron jobs MUST wrap their entry points with `cls.runWith({ actor, mode? })`
 * because they have no HTTP middleware to populate CLS.
 */
@Global()
@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 50,
      verboseMemoryLeak: true,
    }),
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        setup: (cls, req: any) => {
          if (req?.user) cls.set('actor', req.user);
        },
      },
    }),
  ],
  providers: [RawEventBusImpl, DomainEventBridge],
  exports: [RawEventBusImpl, EventEmitterModule, ClsModule],
})
export class EventBusModule {}
