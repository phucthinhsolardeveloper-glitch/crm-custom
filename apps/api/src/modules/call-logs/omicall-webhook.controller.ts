import { Body, Controller, HttpCode, Logger, Param, Post, UseGuards } from '@nestjs/common';
import { Public } from '../auth/decorators/public-route.decorator';
import { DynamicWebhookGuard } from '../webhook-endpoints/guards/dynamic-webhook.guard';
import { CallLogsService } from './call-logs.service';
import { parseCdrPayload } from './helpers/omicall-cdr-mapper';
import type { OmicallCdrDto } from './dto/omicall-cdr.dto';

/**
 * Receiver cho dynamic webhook: POST /api/v1/webhooks/in/:slug
 *
 * Admin tao webhook trong Settings > Webhooks UI -> nhan slug + secret.
 * Dan URL day du + header x-webhook-secret vao OmiCall dashboard.
 *
 * Auth: DynamicWebhookGuard verify slug + secret + audit trigger.
 * Logic: parse payload, route den CallLogsService (upsert by call_uuid).
 * Idempotent: trung `call_uuid` -> UPDATE row hien co.
 *
 * State handling: chap nhan moi `state` (ringing/answered/hangup/cdr/early/create).
 * - State som (ringing/answered): thuong thieu transcript / bill_sec - upsert se la partial.
 * - State cuoi (cdr): co day du transcript + recording -> trigger AI analysis.
 * - Idempotency key call_uuid dam bao cac state cua cung 1 cuoc goi merge vao 1 row.
 *
 * NOTE: Body dung plain `Record<string, unknown>` thay vi DTO class.
 * Global ValidationPipe (forbidNonWhitelisted=true) reject 3rd party payload co
 * field thua. Method-level @UsePipes KHONG override duoc vi global pipe chay
 * truoc. Skip validation o tang controller, validate field can thiet trong
 * `parseCdrPayload()` (throw neu phone_number / call_uuid thieu).
 */
@Controller('webhooks/in')
export class OmicallWebhookController {
  private readonly logger = new Logger(OmicallWebhookController.name);

  constructor(private readonly callLogsService: CallLogsService) {}

  @Public()
  @UseGuards(DynamicWebhookGuard)
  @Post(':slug')
  @HttpCode(200)
  async receiveCdr(
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
  ) {
    const cdrBody = body as unknown as OmicallCdrDto;
    const state = cdrBody.state ?? 'unknown';

    try {
      const parsed = parseCdrPayload(cdrBody);
      const result = await this.callLogsService.upsertFromOmicallCdr(parsed);
      this.logger.log(
        `[wh:${slug}] state=${state} ${parsed.callUuid.slice(0, 8)} -> log#${result.id} ` +
        `type=${parsed.callType} created=${result.created} willAnalyze=${result.willAnalyze}`,
      );
      return {
        ok: true,
        state,
        callLogId: result.id.toString(),
        willAnalyze: result.willAnalyze,
        created: result.created,
      };
    } catch (err: any) {
      // KHONG re-throw - tra ve 200 voi error de OmiCall khong retry vo han neu payload xau
      this.logger.error(`[wh:${slug}] state=${state} parse fail: ${err.message}`);
      this.logger.debug(`Raw body: ${JSON.stringify(body)}`);
      return { ok: false, state, error: err.message };
    }
  }
}
