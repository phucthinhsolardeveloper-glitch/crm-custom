import { Module } from '@nestjs/common';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';
import { LarkSyncModule } from '../lark-sync/lark-sync.module';

@Module({
  imports: [LarkSyncModule],
  controllers: [RefundsController],
  providers: [RefundsService],
})
export class RefundsModule {}
