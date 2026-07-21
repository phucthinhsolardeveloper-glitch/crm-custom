import { Module } from '@nestjs/common';
import { CronRunService } from './cron-run.service';
import { CronRunController } from './cron-run.controller';

@Module({
  controllers: [CronRunController],
  providers: [CronRunService],
  exports: [CronRunService],
})
export class CronRunModule {}
