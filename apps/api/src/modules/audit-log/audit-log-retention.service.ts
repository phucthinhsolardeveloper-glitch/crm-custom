import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AuditLogService } from './audit-log.service';
import { CronRunService } from '../cron-run/cron-run.service';

const RETENTION_DAYS = 60;

/**
 * Daily 3:30 AM (after notification cleanup) - drops audit_logs and cron_runs
 * older than RETENTION_DAYS. Self-instrumented via cron-run tracking so retention
 * itself shows up in the trace UI ("eat own dogfood").
 *
 * Lives in its own service to keep concerns clean: AuditLogService is the data
 * layer, this is just the schedule trigger.
 */
@Injectable()
export class AuditLogRetentionService {
  private readonly logger = new Logger(AuditLogRetentionService.name);

  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly cronRunService: CronRunService,
  ) {}

  @Cron('30 3 * * *')
  async runRetention(): Promise<void> {
    try {
      await this.cronRunService.track('audit-retention', async (ctx) => {
        const { auditDeleted, cronDeleted } = await this.auditLogService.pruneOldRecords(RETENTION_DAYS);
        ctx.affected = auditDeleted + cronDeleted;
        ctx.metadata = {
          retentionDays: RETENTION_DAYS,
          auditDeleted,
          cronDeleted,
          cutoff: new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString(),
        };
        if (auditDeleted + cronDeleted > 0) {
          this.logger.log(`Retention: deleted ${auditDeleted} audit + ${cronDeleted} cron rows`);
        }
      });
    } catch (err) {
      this.logger.error(`Retention cron failed: ${err instanceof Error ? err.stack : String(err)}`);
    }
  }
}
