import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { LarkTokenService } from './lark-token.service';
import { LarkBaseClient } from './lark-base.client';
import { LarkMappingEngine } from './lark-mapping-engine';
import { LarkMappingService } from './lark-mapping.service';
import { LarkMappingController } from './lark-mapping.controller';
import { LarkSyncService } from './lark-sync.service';
import { LarkSyncProcessor } from './lark-sync.processor';
import { LarkSyncHistoryController } from './lark-sync-history.controller';
import { LarkSyncHistoryService } from './lark-sync-history.service';
import { LARK_SYNC_QUEUE } from './lark-sync.constants';

/**
 * Lark Base sync module (config-driven).
 *
 * Flow: PaymentsService.create -> LarkSyncService.enqueuePaymentSync
 *       -> BullMQ queue -> LarkSyncProcessor
 *       -> LarkSyncMapping (DB config) + CRM_FIELD_CATALOG (code)
 *       -> LarkBaseClient.createRecord -> luu larkSyncedAt/larkRecordId.
 *
 * Disabled at runtime khi thieu LARK_APP_ID / LARK_APP_SECRET (xem
 * LarkTokenService.onModuleInit). Enqueue van chay; processor skip + log,
 * de dev / CI chay khong can credentials Lark.
 */
@Module({
  imports: [BullModule.registerQueue({ name: LARK_SYNC_QUEUE })],
  controllers: [LarkMappingController, LarkSyncHistoryController],
  providers: [
    LarkTokenService,
    LarkBaseClient,
    LarkMappingEngine,
    LarkMappingService,
    LarkSyncService,
    LarkSyncProcessor,
    LarkSyncHistoryService,
  ],
  exports: [LarkSyncService, LarkMappingService],
})
export class LarkSyncModule {}
