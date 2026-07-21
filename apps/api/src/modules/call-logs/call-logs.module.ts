import { Module } from '@nestjs/common';
import { CallLogsController } from './call-logs.controller';
import { OmicallWebhookController } from './omicall-webhook.controller';
import { CallFeedbacksController } from './call-feedbacks.controller';
import { CallLogsService } from './call-logs.service';
import { CallFeedbacksService } from './call-feedbacks.service';
import { AiSummaryModule } from '../ai-summary/ai-summary.module';
import { CustomersModule } from '../customers/customers.module';
import { UserPhonesModule } from '../user-phones/user-phones.module';
import { UsersModule } from '../users/users.module';
import { WebhookEndpointsModule } from '../webhook-endpoints/webhook-endpoints.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    AiSummaryModule, CustomersModule, UserPhonesModule, UsersModule,
    WebhookEndpointsModule, // DynamicWebhookGuard
    NotificationsModule, // CallFeedbacks notify sale
  ],
  controllers: [CallLogsController, OmicallWebhookController, CallFeedbacksController],
  providers: [CallLogsService, CallFeedbacksService],
  exports: [CallLogsService],
})
export class CallLogsModule {}
