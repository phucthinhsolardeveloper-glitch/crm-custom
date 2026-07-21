import {
  Controller, Get, Post, Body, Param, Query, Res,
  HttpCode, BadRequestException, UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { IsOptional, IsString } from 'class-validator';
import { UserRole } from '@prisma/client';
import { BankTransactionsService } from './bank-transactions.service';
import { BankTransactionImportService } from './bank-transaction-import.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { Public } from '../auth/decorators/public-route.decorator';
import { ApiKeyAuth } from '../auth/decorators/api-key-auth.decorator';
import { WebhookSignatureGuard } from '../auth/guards/webhook-signature.guard';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

class BankTransactionListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  matchStatus?: string;
}

@Controller()
export class BankTransactionsController {
  constructor(
    private readonly service: BankTransactionsService,
    private readonly importService: BankTransactionImportService,
  ) {}

  /** Webhook endpoint for bank transaction ingestion - requires x-api-key + HMAC signature. */
  @Public()
  @ApiKeyAuth()
  @UseGuards(WebhookSignatureGuard)
  @Post('webhooks/bank-transactions')
  async ingest(@Body() body: {
    externalId: string; amount: number; content: string;
    bankAccount?: string; senderName?: string; senderAccount?: string;
    transactionTime?: string; rawData?: Record<string, unknown>;
  }) {
    return { data: await this.service.ingest(body) };
  }

  @Get('bank-transactions/import/template')
  @Roles(UserRole.SUPER_ADMIN)
  downloadTemplate(@Res() res: Response) {
    const buffer = this.importService.generateTemplate();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="bank-transaction-template.csv"');
    res.send(buffer);
  }

  @Post('bank-transactions/import')
  @Roles(UserRole.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req: any, file: any, cb: any) => {
      const okMime = [
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/octet-stream',
        'text/plain',
      ].includes(file.mimetype);
      const okExt = /\.(csv|xlsx)$/i.test(file.originalname);
      if (!okMime && !okExt) return cb(new BadRequestException('Chỉ chấp nhận file CSV (.csv) hoặc Excel (.xlsx)'), false);
      cb(null, true);
    },
  }))
  async importCsv(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { headerRow?: string },
  ) {
    if (!file) throw new BadRequestException('Vui lòng upload file CSV hoặc Excel');
    // headerRow tuỳ chọn (1-based): để trống -> tự dò dòng tiêu đề.
    const headerRow = body?.headerRow ? parseInt(body.headerRow, 10) : undefined;
    const validHeaderRow = headerRow && headerRow > 0 ? headerRow : undefined;
    return {
      data: await this.importService.importStatement(file.buffer, file.originalname, validHeaderRow),
    };
  }

  @Get('bank-transactions')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async list(@Query() query: BankTransactionListQueryDto) {
    return this.service.list(query);
  }

  @Get('bank-transactions/unmatched')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async listUnmatched(@Query('limit') limit?: number, @Query('cursor') cursor?: string) {
    return this.service.listUnmatched(limit ?? 20, cursor);
  }

  @Post('bank-transactions/:id/match')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN)
  async manualMatch(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { paymentId: string },
    @CurrentUser() user: any,
  ) {
    if (!body.paymentId) throw new BadRequestException('paymentId là bắt buộc');
    return { data: await this.service.manualMatch(id, BigInt(body.paymentId), user.id) };
  }

  /** Huy ghep 1 giao dich da ghep nham: bank tx -> UNMATCHED, payment -> PENDING. */
  @Post('bank-transactions/:id/unmatch')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN)
  async unmatch(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: any,
  ) {
    return { data: await this.service.unmatch(id, user.id) };
  }

  /** Bulk mark bank tx UNMATCHED -> IGNORED (soft cleanup). */
  @Post('bank-transactions/bulk-ignore')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN)
  async bulkIgnore(@Body() body: { ids: string[] }) {
    if (!body.ids?.length) throw new BadRequestException('ids là bắt buộc');
    if (body.ids.length > 500) throw new BadRequestException('Tối đa 500 giao dịch mỗi lần');
    return { data: await this.service.bulkMarkIgnored(body.ids.map((id) => BigInt(id))) };
  }

  /** Bulk hard delete UNMATCHED hoac IGNORED bank tx. */
  @Post('bank-transactions/bulk-delete')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN)
  async bulkDelete(@Body() body: { ids: string[] }) {
    if (!body.ids?.length) throw new BadRequestException('ids là bắt buộc');
    if (body.ids.length > 500) throw new BadRequestException('Tối đa 500 giao dịch mỗi lần');
    return { data: await this.service.bulkDelete(body.ids.map((id) => BigInt(id))) };
  }

  /** Restore IGNORED -> UNMATCHED. */
  @Post('bank-transactions/bulk-restore')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN)
  async bulkRestore(@Body() body: { ids: string[] }) {
    if (!body.ids?.length) throw new BadRequestException('ids là bắt buộc');
    if (body.ids.length > 500) throw new BadRequestException('Tối đa 500 giao dịch mỗi lần');
    return { data: await this.service.bulkRestore(body.ids.map((id) => BigInt(id))) };
  }

  /** Danh dau 1 giao dich bank la tien du -> chuyen sang bang surplus_transactions. */
  @Post('bank-transactions/:id/mark-surplus')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN)
  async markSurplus(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { note?: string },
    @CurrentUser() user: any,
  ) {
    return { data: await this.service.markSurplus(id, body?.note, user.id) };
  }

  /** List tien du (bang rieng, tach CRM). */
  @Get('surplus-transactions')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async listSurplus(@Query('limit') limit?: number, @Query('cursor') cursor?: string) {
    return this.service.listSurplus(limit ? Number(limit) : 20, cursor);
  }

  /** Bo danh dau tien du (undo): tra bank tx ve UNMATCHED de doi soat lai. */
  @Post('surplus-transactions/:id/unmark')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN)
  async unmarkSurplus(@Param('id', ParseBigIntPipe) id: bigint) {
    return { data: await this.service.unmarkSurplus(id) };
  }
}
