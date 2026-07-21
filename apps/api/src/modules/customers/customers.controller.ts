import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, BadRequestException, ForbiddenException, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { CustomersService } from './customers.service';
import { CustomerPhonesService } from './customer-phones.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerListQueryDto } from './dto/customer-list-query.dto';
import { AddCustomerPhoneDto, UpdateCustomerPhoneDto } from './dto/customer-phone.dto';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { LabelsService } from '../labels/labels.service';
import { AiSummaryService } from '../ai-summary/ai-summary.service';

// Avatar upload: 5MB max, multer reject sớm trước khi vào buffer
const AVATAR_MAX_SIZE = 5 * 1024 * 1024;

@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly customerPhonesService: CustomerPhonesService,
    private readonly labelsService: LabelsService,
    private readonly aiSummary: AiSummaryService,
  ) {}

  @Get()
  async list(@Query() query: CustomerListQueryDto, @CurrentUser() user: any) {
    return this.customersService.list(query, user);
  }

  @Get('search')
  async searchByPhone(@Query('phone') phone: string) {
    return this.customersService.searchByPhone(phone);
  }

  @Get(':id')
  async findById(@Param('id', ParseBigIntPipe) id: bigint) {
    // Đọc chi tiết = open-trust: mọi role xem được mọi khách hàng (kể cả KH thả nổi
    // hoặc của nhân viên khác tìm thấy qua tra SĐT). Ghi/mutation vẫn scope theo
    // người sở hữu qua findById(id, user, 'write').
    const data = await this.customersService.findById(id);
    return { data };
  }

  @Post()
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async create(@Body() dto: CreateCustomerDto, @CurrentUser() user: any) {
    const data = await this.customersService.create(dto, user);
    return { data };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: any,
  ) {
    const data = await this.customersService.update(id, body, user);
    return { data };
  }

  @Post(':id/claim')
  @HttpCode(200)
  async claim(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    const data = await this.customersService.claim(id, user);
    return { data };
  }

  @Post(':id/transfer')
  @HttpCode(200)
  async transfer(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { targetType: string; targetDeptId?: string },
    @CurrentUser() user: any,
  ) {
    const data = await this.customersService.transfer(id, body.targetType, body.targetDeptId ?? null, user);
    return { data };
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async reactivate(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    const data = await this.customersService.reactivate(id, user);
    return { data };
  }

  @Post('bulk-delete')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN)
  async bulkDelete(@Body() body: { ids: string[] }) {
    if (!body.ids?.length) throw new BadRequestException('ids là bắt buộc');
    if (body.ids.length > 1000) throw new BadRequestException('Tối đa 1000 khách hàng mỗi lần');
    const result = await this.customersService.bulkSoftDelete(body.ids.map(id => BigInt(id)));
    return { data: result };
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async delete(@Param('id', ParseBigIntPipe) id: bigint) {
    await this.customersService.softDelete(id);
    return { data: { message: 'Đã xóa khách hàng' } };
  }

  // Label attach/detach - ownership verified via findById
  @Post(':id/labels')
  async attachLabels(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { labelIds: string[] },
    @CurrentUser() user: any,
  ) {
    await this.customersService.findById(id, user, 'write'); // ownership check (mutation -> self-scope LEADER)
    await this.labelsService.attachToCustomer(id, body.labelIds.map(BigInt));
    return { data: { message: 'Đã gắn nhãn' } };
  }

  @Delete(':id/labels/:labelId')
  async detachLabel(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Param('labelId', ParseBigIntPipe) labelId: bigint,
    @CurrentUser() user: any,
  ) {
    await this.customersService.findById(id, user, 'write'); // ownership check (mutation -> self-scope LEADER)
    await this.labelsService.detachFromCustomer(id, labelId);
    return { data: { message: 'Đã gỡ nhãn' } };
  }

  /** Upload avatar khách hàng (JPG/PNG/WebP, 5MB max). */
  @Post(':id/avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: AVATAR_MAX_SIZE } }))
  async uploadAvatar(
    @Param('id', ParseBigIntPipe) id: bigint,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    const data = await this.customersService.uploadAvatar(id, file, user);
    return { data };
  }

  @Delete(':id/avatar')
  async removeAvatar(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: any,
  ) {
    const data = await this.customersService.removeAvatar(id, user);
    return { data };
  }

  /**
   * Trigger AI analysis for customer on demand.
   * Gate chống spam đốt quota AI: USER chỉ được phân tích lần đầu (chưa có kết quả);
   * re-analyze (đã có shortDescription/description) chỉ MANAGER/SUPER_ADMIN.
   */
  @Post(':id/analyze')
  @HttpCode(200)
  async analyze(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    // findById áp buildAccessFilter (mutation: re-analyze ghi aiSummary -> self-scope LEADER)
    const customer = await this.customersService.findById(id, user, 'write');

    const hasAnalysis = Boolean(
      customer.shortDescription?.trim() || customer.description?.trim(),
    );
    const isElevated = user.role === UserRole.MANAGER || user.role === UserRole.SUPER_ADMIN;
    if (hasAnalysis && !isElevated) {
      throw new ForbiddenException(
        'Khách hàng này đã có phân tích AI. Chỉ Quản lý trở lên mới được phân tích lại.',
      );
    }

    const result = await this.aiSummary.analyzeCustomer(id);
    if (!result) return { data: { message: 'Không thể phân tích (thiếu AI_API_KEY hoặc dữ liệu)' } };
    return { data: result };
  }

  // ── Customer Detail Hybrid endpoints ────────────────────────────────────

  @Get(':id/revenue-by-product')
  async revenueByProduct(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: any,
  ) {
    const data = await this.customersService.revenueByProduct(id, user);
    return { data };
  }

  @Get(':id/pinned-notes')
  async pinnedNotes(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: any,
  ) {
    const data = await this.customersService.pinnedNotes(id, user);
    return { data };
  }

  @Get(':id/recent-lead-notes')
  async recentLeadNotes(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: any,
  ) {
    const data = await this.customersService.recentLeadNotes(id, user, 3);
    return { data };
  }

  @Get(':id/next-actions')
  async nextActions(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: any,
  ) {
    const data = await this.customersService.nextActions(id, user);
    return { data };
  }

  @Post(':id/notes/:noteId/pin')
  @HttpCode(200)
  async pinNote(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Param('noteId', ParseBigIntPipe) noteId: bigint,
    @CurrentUser() user: any,
  ) {
    const data = await this.customersService.pinNote(id, noteId, user, true);
    return { data };
  }

  @Delete(':id/notes/:noteId/pin')
  async unpinNote(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Param('noteId', ParseBigIntPipe) noteId: bigint,
    @CurrentUser() user: any,
  ) {
    const data = await this.customersService.pinNote(id, noteId, user, false);
    return { data };
  }

  // ── Số điện thoại phụ (multi-phone) ─────────────────────────────────────
  // GET allowed cho mọi role có quyền xem customer (ownership check qua findById).
  // POST/PATCH/DELETE chỉ MANAGER+ - giống quyền sửa số chính.

  @Get(':id/phones')
  async listPhones(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: any,
  ) {
    await this.customersService.findById(id, user, 'write'); // ownership check (mutation -> self-scope LEADER)
    const data = await this.customerPhonesService.listPhones(id);
    return { data };
  }

  @Post(':id/phones')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async addPhone(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: AddCustomerPhoneDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.customerPhonesService.addPhone(id, dto, user.id);
    return { data };
  }

  @Patch(':id/phones/:phoneId')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async updatePhone(
    @Param('id', ParseBigIntPipe) _id: bigint,
    @Param('phoneId', ParseBigIntPipe) phoneId: bigint,
    @Body() dto: UpdateCustomerPhoneDto,
  ) {
    const data = await this.customerPhonesService.updatePhone(phoneId, dto);
    return { data };
  }

  @Delete(':id/phones/:phoneId')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async deletePhone(
    @Param('id', ParseBigIntPipe) _id: bigint,
    @Param('phoneId', ParseBigIntPipe) phoneId: bigint,
  ) {
    await this.customerPhonesService.softDeletePhone(phoneId);
    return { data: { message: 'Đã xóa số phụ' } };
  }
}
