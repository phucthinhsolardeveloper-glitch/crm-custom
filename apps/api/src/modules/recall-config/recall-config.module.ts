import { Module } from '@nestjs/common';
import { RecallConfigController } from './recall-config.controller';
import { RecallConfigService } from './recall-config.service';
import { CronRunModule } from '../cron-run/cron-run.module';

@Module({
  imports: [CronRunModule],
  controllers: [RecallConfigController],
  providers: [RecallConfigService],
})
export class RecallConfigModule {}
