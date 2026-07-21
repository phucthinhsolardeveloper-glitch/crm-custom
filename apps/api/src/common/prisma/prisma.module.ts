import { Global, Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '@crm/database';
import { PrismaService } from './prisma.service';
import { EventBusModule } from '../event-bus/event-bus.module';
import { RawEventBusImpl } from '../event-bus/raw-event-bus.impl';

/**
 * Prisma DI: instantiates a single PrismaClient composed with soft-delete + event extensions.
 * Event bus is injected so event listeners receive every tracked mutation.
 */
@Global()
@Module({
  imports: [EventBusModule],
  providers: [
    {
      provide: PrismaClient,
      useFactory: (bus: RawEventBusImpl) => createPrismaClient(bus),
      inject: [RawEventBusImpl],
    },
    PrismaService,
  ],
  exports: [PrismaClient],
})
export class PrismaModule {}
