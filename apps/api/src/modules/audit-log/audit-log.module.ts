import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditLogService } from './audit-log.service';
import { AuditLogController } from './audit-log.controller';
import { AuditLogInterceptor } from './audit-log.interceptor';
import { AuditLogRetentionService } from './audit-log-retention.service';
import { CronRunModule } from '../cron-run/cron-run.module';

@Module({
  imports: [CronRunModule],
  controllers: [AuditLogController],
  providers: [
    AuditLogService,
    AuditLogRetentionService,
    // Global interceptor - auto-logs every mutation across all controllers.
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
  exports: [AuditLogService],
})
export class AuditLogModule {}
