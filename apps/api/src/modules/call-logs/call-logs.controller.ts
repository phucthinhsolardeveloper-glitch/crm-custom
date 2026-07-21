import { Controller, Get, Post, Delete, Body, Param, Query, HttpCode } from '@nestjs/common';
import { UserRole, EntityType } from '@prisma/client';
import { CallLogsService } from './call-logs.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { Public } from '../auth/decorators/public-route.decorator';
import { ApiKeyAuth } from '../auth/decorators/api-key-auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ListCallLogsQueryDto } from './dto/list-call-logs-query.dto';
import { LogCallDto } from './dto/log-call.dto';
import { AiSummaryService } from '../ai-summary/ai-summary.service';

@Controller('call-logs')
export class CallLogsController {
  constructor(
    private readonly service: CallLogsService,
    private readonly aiSummary: AiSummaryService,
  ) {}

  /** Ingest call log from 3rd party integration (API key auth). */
  @Public()
  @ApiKeyAuth()
  @Post('ingest')
  async ingest(@Body() body: LogCallDto) {
    return { data: await this.service.ingest(body) };
  }

  /**
   * List call logs. Mo cho moi user dang nhap, scope theo role trong service:
   * - USER: chi cuoc goi cua minh (matchedUserId = self)
   * - LEADER: cuoc goi cua team (scope theo teamId); LEADER khong team -> self
   * - MANAGER+ / SUPER_ADMIN: tat ca
   * userId filter (optional): drill-down theo sale phu trach (chi co tac dung voi LEADER+).
   * Dung ListCallLogsQueryDto vi global ValidationPipe co forbidNonWhitelisted=true.
   */
  @Get()
  async list(@Query() query: ListCallLogsQueryDto, @CurrentUser() user: any) {
    const matchedUserFilter = query.userId ? BigInt(query.userId) : undefined;
    return this.service.list(
      { ...query, matchedUserFilter, hasAi: query.hasAi === 'true' },
      { id: user.id, role: user.role, teamId: user.teamId ?? null },
    );
  }

  /**
   * List unique sales co cuoc goi - dung cho dropdown filter o UI.
   * Tra ve [{ id, name, count }] sap xep theo count desc.
   * LEADER chi thay member team minh; MANAGER+ thay tat ca; USER bi loai (khong can dropdown).
   */
  @Get('sales')
  @Roles(UserRole.LEADER, UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async listSales(@CurrentUser() user: any) {
    return {
      data: await this.service.listSalesWithCalls({ id: user.id, role: user.role, teamId: user.teamId ?? null }),
    };
  }

  /** AI summarize calls in date range. Scope theo role giong list (tranh ro ri tag ngoai team/ngoai cuoc cua minh). */
  @Post('summarize')
  @HttpCode(200)
  @Roles(UserRole.LEADER, UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async summarize(@Body() body: { dateFrom: string; dateTo: string }, @CurrentUser() user: any) {
    const result = await this.aiSummary.summarizeCalls(body.dateFrom, body.dateTo, {
      id: user.id,
      role: user.role,
      teamId: user.teamId ?? null,
    });
    return { data: result || 'Không có cuộc gọi nào đã phân tích trong khoảng thời gian này.' };
  }

  /** @deprecated - UI moi khong dung match-status. Giu de tuong thich neu co integration cu. */
  @Get('unmatched')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async listUnmatched(
    @CurrentUser() user: any,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.service.listUnmatched(
      { id: user.id, role: user.role, teamId: user.teamId ?? null },
      limit ?? 20,
      cursor,
    );
  }

  // Removed (2026-06-04): POST /from-web - Web SDK khong log call nua.
  // OmiCall webhook (POST /webhooks/omicall/call) la nguon duy nhat tao call_logs row.

  @Post(':id/match')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async manualMatch(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { entityType: EntityType; entityId: string },
    @CurrentUser() user: any,
  ) {
    return { data: await this.service.manualMatch(id, body.entityType, BigInt(body.entityId), user.id) };
  }

  // Chỉ SUPER_ADMIN xoá call log (soft delete - set deletedAt).
  @Delete(':id')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN)
  async remove(@Param('id', ParseBigIntPipe) id: bigint) {
    return { data: await this.service.deleteById(id) };
  }
}
