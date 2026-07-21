import { Module } from '@nestjs/common';
import { WebhookEndpointsController } from './webhook-endpoints.controller';
import { WebhookEndpointsService } from './webhook-endpoints.service';
import { DynamicWebhookGuard } from './guards/dynamic-webhook.guard';

@Module({
  controllers: [WebhookEndpointsController],
  providers: [WebhookEndpointsService, DynamicWebhookGuard],
  exports: [WebhookEndpointsService, DynamicWebhookGuard],
})
export class WebhookEndpointsModule {}
