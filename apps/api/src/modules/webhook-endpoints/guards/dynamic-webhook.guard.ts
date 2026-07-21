import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { WebhookEndpointsService } from '../webhook-endpoints.service';

/**
 * Verify dynamic webhook qua header `x-webhook-secret` + URL param `slug`.
 * - Lookup endpoint by slug
 * - Timing-safe verify secret hash
 * - Update audit (lastTriggeredAt + triggerCount) fire-and-forget
 *
 * Attach endpoint info vao request.webhookEndpoint cho downstream use.
 */
@Injectable()
export class DynamicWebhookGuard implements CanActivate {
  constructor(private readonly service: WebhookEndpointsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const slug = request.params?.slug as string | undefined;
    const secret = request.headers['x-webhook-secret'] as string | undefined;

    if (!slug) {
      throw new UnauthorizedException('Webhook slug missing');
    }
    if (!secret) {
      throw new UnauthorizedException('Webhook secret bat buoc (header x-webhook-secret)');
    }

    const endpoint = await this.service.findAndVerify(slug, secret);
    if (!endpoint) {
      throw new UnauthorizedException('Webhook slug hoac secret khong hop le');
    }

    // Attach + audit (fire-and-forget)
    request.webhookEndpoint = endpoint;
    this.service.recordTrigger(endpoint.id);

    return true;
  }
}
