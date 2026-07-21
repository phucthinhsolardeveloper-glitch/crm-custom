import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentMatchingService } from './payment-matching.service';
import { PaymentImportService } from './payment-import.service';
import { PaymentImportTemplateService } from './payment-import-template.service';
import { PaymentScoringService } from './payment-scoring.service';
import { PaymentSuggestService } from './payment-suggest.service';
import { PaymentFuzzyCronService } from './payment-fuzzy-cron.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { CronRunModule } from '../cron-run/cron-run.module';
import { CustomerTiersModule } from '../customer-tiers/customer-tiers.module';
import { LarkSyncModule } from '../lark-sync/lark-sync.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [CronRunModule, CustomerTiersModule, LarkSyncModule, NotificationsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentMatchingService,
    PaymentImportService,
    PaymentImportTemplateService,
    PaymentScoringService,
    PaymentSuggestService,
    PaymentFuzzyCronService,
    PaymentReconciliationService,
  ],
  exports: [PaymentsService, PaymentMatchingService, PaymentImportService, PaymentScoringService],
})
export class PaymentsModule {}
