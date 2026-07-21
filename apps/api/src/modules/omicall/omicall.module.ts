import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OmicallContactService } from './omicall-contact.service';
import { OmicallSyncProcessor } from './omicall-sync.processor';
import { OmicallSyncListener } from './omicall-sync.listener';
import { OMICALL_SYNC_QUEUE } from './omicall.constants';

/**
 * OmiCall integration module.
 *
 * Flow: lead.assigned_user_changed event -> Listener -> BullMQ queue
 *       -> Processor -> OmiCall REST API (search -> update or add).
 *
 * Disabled at runtime when OMICALL_API_URL / OMICALL_API_KEY env vars
 * are missing (see OmicallContactService.onModuleInit). Listener still
 * enqueues jobs; processor logs and skips. This lets dev / CI run
 * without OmiCall credentials.
 */
@Module({
  imports: [BullModule.registerQueue({ name: OMICALL_SYNC_QUEUE })],
  providers: [OmicallContactService, OmicallSyncProcessor, OmicallSyncListener],
  exports: [OmicallContactService],
})
export class OmicallModule {}
