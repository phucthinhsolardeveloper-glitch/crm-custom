import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, BadRequestException, Res, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsOptional, IsEnum, IsString, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole, PaymentStatus } from '@prisma/client';
import { toOptionalStringArray } from '../leads/dto/lead-list-query.dto';
import { Response } from 'express';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { PaymentImportService } from './payment-import.service';
import { PaymentImportTemplateService } from './payment-import-template.service';
import { PaymentSuggestService } from './payment-suggest.service';
import { PaymentFuzzyCronService } from './payment-fuzzy-cron.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { ReconciliationQueryDto } from './dto/reconciliation-query.dto';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

class PaymentListQueryDto extends PaginationQueryDto {
  // Multi-select: accept single (?status=PENDING) hoặc multi (?status=PENDING&status=VERIFIED).
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return Array.isArray(value) ? value : [value];
  })
  @IsArray()
  @IsEnum(PaymentStatus, { each: true })
  status?: PaymentStatus[];

  @IsOptional()
  @IsString()
  orderId?: string;

  // Các filter đa chọn: accept single (?x=1) hoặc multi (?x=1&x=2). @Transform normalize -> string[].
  @IsOptional() @Transform(toOptionalStringArray) @IsArray() @IsString({ each: true })
  paymentTypeId?: string[];

  // Order-level filters (filter qua quan hệ payment.order)
  @IsOptional() @Transform(toOptionalStringArray) @IsArray() @IsString({ each: true })
  productId?: string[];

  @IsOptional() @Transform(toOptionalStringArray) @IsArray() @IsString({ each: true })
  productGroupId?: string[];

  @IsOptional() @Transform(toOptionalStringArray) @IsArray() @IsString({ each: true })
  createdBy?: string[];

  @IsOptional() @Transform(toOptionalStringArray) @IsArray() @IsString({ each: true })
  teamId?: string[];

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  // Chọn khuôn export CSV: 'accounting' = 22 cột kế toán, mặc định = 39 cột nội bộ.
  @IsOptional()
  @IsString()
  format?: string;
}

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly service: PaymentsService,
    private readonly importService: PaymentImportService,
    private readonly importTemplateService: PaymentImportTemplateService,
    private readonly suggestService: PaymentSuggestService,
    private readonly fuzzyCronService: PaymentFuzzyCronService,
    private readonly reconciliationService: PaymentReconciliationService,
  ) {}

  @Get()
  async list(@Query() query: PaymentListQueryDto, @CurrentUser() user: any) {
    return this.service.list(query, user);
  }

  @Get('pending')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async listPending(@Query('limit') limit?: number, @Query('cursor') cursor?: string) {
    return this.service.listPending(limit ?? 20, cursor);
  }

  @Get('stats')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getStats() {
    return { data: await this.suggestService.getStats() };
  }

  // Đối soát theo mệnh giá cho 1 khoảng thời gian VN (GMT+7). Chỉ MANAGER+ tới
  // được - cả hai role đều thấy toàn hệ thống nên không cần scope thêm.
  @Get('reconciliation')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getReconciliation(@Query() query: ReconciliationQueryDto) {
    return { data: await this.reconciliationService.getReconciliation(query.from, query.to, query.bankAccount) };
  }

  // Chay doi soat + luu 1 dong lich su. Dung khi bat dau 1 phien doi soat moi
  // (refetch sau khi duyet cap dung GET /reconciliation de khong tao run rac).
  @Post('reconciliation/runs')
  @HttpCode(200)
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async saveReconciliationRun(@Body() body: ReconciliationQueryDto, @CurrentUser() user: any) {
    return { data: await this.reconciliationService.saveRun(body.from, body.to, user.id, body.bankAccount) };
  }

  // Lich su cac lan doi soat (ban tom tat nhe). Bam 1 dong -> chay lai.
  @Get('reconciliation/runs')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async listReconciliationRuns(@Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    return this.reconciliationService.listRuns(limit ? +limit : 20, cursor);
  }

  @Get('fuzzy-queue')
  @Roles(UserRole.SUPER_ADMIN)
  async getFuzzyQueue(
    @Query('minScore') minScore?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.suggestService.listFuzzyQueue({
      minScore: minScore ? +minScore : undefined,
      limit: limit ? +limit : undefined,
      cursor,
    });
  }

  // Chạy quét fuzzy thủ công - chủ động thay vì đợi cron 2h.
  @Post('run-fuzzy-match')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN)
  async runFuzzyMatch() {
    return { data: await this.fuzzyCronService.runManual() };
  }

  @Post('bulk-confirm-fuzzy')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN)
  async bulkConfirmFuzzy(
    @Body() body: { bankTxIds: string[] },
    @CurrentUser() user: any,
  ) {
    if (!body.bankTxIds?.length) throw new BadRequestException('bankTxIds là bắt buộc');
    if (body.bankTxIds.length > 100) throw new BadRequestException('Tối đa 100 mỗi lần');
    const ids = body.bankTxIds.map((id) => BigInt(id));
    return { data: await this.suggestService.bulkConfirmFuzzy(ids, user.id) };
  }

  @Post('bulk-reject-fuzzy')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN)
  async bulkRejectFuzzy(@Body() body: { bankTxIds: string[] }) {
    if (!body.bankTxIds?.length) throw new BadRequestException('bankTxIds là bắt buộc');
    if (body.bankTxIds.length > 100) throw new BadRequestException('Tối đa 100 mỗi lần');
    const ids = body.bankTxIds.map((id) => BigInt(id));
    return { data: await this.suggestService.bulkRejectFuzzy(ids) };
  }

  @Get('export-csv')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async exportCsv(
    @Query() query: PaymentListQueryDto,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    // format=accounting -> khuôn kế toán 22 cột (file đối soát); mặc định 39 cột nội bộ.
    const accounting = query.format === 'accounting';
    const csv = accounting
      ? await this.service.exportAccountingCsv(query, user)
      : await this.service.exportFiltered(query, user);
    const date = new Date().toISOString().slice(0, 10);
    const name = accounting ? `orders-ketoan-${date}` : `orders-export-${date}`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
    res.send('﻿' + csv); // BOM cho Excel UTF-8
  }

  @Get('export')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async exportExcel(
    @CurrentUser() user: any,
    @Res() res: Response,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const buffer = await this.service.exportVerified(dateFrom, dateTo, user);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=payments-verified.xlsx');
    res.send(buffer);
  }

  @Get('import-template')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async downloadTemplate(@Res() res: Response) {
    const buffer = await this.importTemplateService.generateTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=payment-import-template.xlsx');
    res.send(buffer);
  }

  @Post('import')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req: any, file: any, cb: any) => {
      if (!file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
        return cb(new BadRequestException('Chỉ chấp nhận file Excel (.xlsx, .xls) hoặc CSV (.csv)'), false);
      }
      cb(null, true);
    },
  }))
  async importExcel(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
    @Query('dryRun') dryRun?: string,
  ) {
    if (!file) throw new BadRequestException('Vui lòng upload file Excel hoặc CSV');
    // dryRun=true -> chỉ validate + preview, không ghi DB. Mặc định false = ghi thật.
    const isDryRun = dryRun === 'true';
    // Route by extension: CSV goes through the CSV parser, Excel through ExcelJS.
    const isCsv = /\.csv$/i.test(file.originalname);
    // Multer giữ originalname dạng latin1 - decode lại UTF-8 cho tên file tiếng Việt.
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const result = isCsv
      ? await this.importService.importFromCsv(file.buffer, user.id, isDryRun, fileName)
      : await this.importService.importFromExcel(file.buffer, user.id, isDryRun, fileName);
    return { data: result };
  }

  /** Lịch sử các đợt import đơn hàng (mỗi lần bấm Xác nhận = 1 đợt). */
  @Get('import-history')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async importHistory(@Query() query: PaginationQueryDto) {
    return this.importService.listBatches(query);
  }

  /** Chi tiết 1 đợt import: số liệu + danh sách lỗi + payments đã tạo. */
  @Get('import-history/:id')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async importHistoryDetail(@Param('id', ParseBigIntPipe) id: bigint) {
    return { data: await this.importService.getBatchDetail(id) };
  }

  @Get(':id/match-candidates')
  @Roles(UserRole.SUPER_ADMIN)
  async getMatchCandidates(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? Math.min(+limit, 20) : 5;
    return { data: await this.suggestService.suggestCandidates(id, parsed) };
  }

  @Get(':id')
  async findById(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    return { data: await this.service.findById(id, user) };
  }

  @Post()
  async create(@Body() dto: CreatePaymentDto, @CurrentUser() user: any) {
    const createData = {
      ...dto,
      transferDate: dto.transferDate ? new Date(dto.transferDate) : undefined,
      installmentId: dto.installmentId ? BigInt(dto.installmentId) : undefined,
    };
    return { data: await this.service.create(createData, user) };
  }

  // Sửa field payment-level (ngân hàng, ngày CK, nội dung, hình thức, đợt, amount, VAT, notes).
  // KHÓA field verify (status/verifiedBy/...) - phải qua /verify /reject.
  // Không gắn @Roles - service tự enforce: USER/LEADER chỉ sửa payment DO MÌNH TẠO và
  // CÒN PENDING; MANAGER+ sửa mọi payment (trong phạm vi scope của họ).
  @Patch(':id')
  @HttpCode(200)
  async update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UpdatePaymentDto,
    @CurrentUser() user: any,
  ) {
    return { data: await this.service.update(id, dto, user) };
  }

  // Chỉ SUPER_ADMIN được xác nhận/từ chối payment. MANAGER + USER chỉ tạo payment.
  @Post(':id/verify')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN)
  async verify(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { bankTransactionId?: string },
    @CurrentUser() user: any,
  ) {
    return { data: await this.service.verifyManual(id, user.id, body.bankTransactionId) };
  }

  // Reject: tiền CÓ về nhưng sale nhập sai (phạt). SUPER_ADMIN only.
  @Post(':id/reject')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN)
  async reject(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { reason?: string },
    @CurrentUser() user: any,
  ) {
    return { data: await this.service.reject(id, user.id, body?.reason) };
  }

  // Cancel: tạo nhầm, tiền KHÔNG về. SUPER_ADMIN hoặc người tạo đơn (khi payment còn PENDING).
  // Không gắn @Roles - service tự enforce quyền owner-or-superadmin.
  // Huy thanh toan = xoa thang ban ghi PENDING. Nguoi tao don hoac SUPER_ADMIN.
  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: any,
  ) {
    return { data: await this.service.cancel(id, user) };
  }

  // Refund: tiền đã về rồi trả lại khách (VERIFIED -> REFUNDED). SUPER_ADMIN only.
  @Post(':id/refund')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN)
  async refund(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { reason?: string },
    @CurrentUser() user: any,
  ) {
    return { data: await this.service.refund(id, user.id, body?.reason) };
  }

  // Chỉ SUPER_ADMIN xoá payment. Side-effect: revert bank tx match (nếu có) + activity log.
  // Hard delete (Payment model không có deletedAt). Lead status KHÔNG revert.
  @Delete(':id')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN)
  async remove(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    return { data: await this.service.deleteById(id, user.id) };
  }

  // Bulk delete payments - SUPER_ADMIN only. Cap 500 IDs/lần để tránh long-running tx.
  @Post('bulk-delete')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN)
  async bulkDelete(@Body() body: { ids: string[] }, @CurrentUser() user: any) {
    if (!body.ids?.length) throw new BadRequestException('ids là bắt buộc');
    if (body.ids.length > 500) throw new BadRequestException('Tối đa 500 thanh toán mỗi lần');
    const result = await this.service.bulkDelete(body.ids.map((id) => BigInt(id)), user.id);
    return { data: result };
  }
}
