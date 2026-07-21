import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushSubscriptionsService } from './push/push-subscriptions.service';
import { WebPushSenderService } from './push/web-push-sender.service';
import { CronRunModule } from '../cron-run/cron-run.module';

@Module({
  imports: [CronRunModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, PushSubscriptionsService, WebPushSenderService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
