import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, BadRequestException, Res } from '@nestjs/common';
import { Response } from 'express';
import { UserRole, LeadStatus } from '@prisma/client';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadListQueryDto } from './dto/lead-list-query.dto';
import { PoolListQueryDto } from './dto/pool-list-query.dto';
import { AddCustomerPhoneDto, UpdateCustomerPhoneDto } from '../customers/dto/customer-phone.dto';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { LabelsService } from '../labels/labels.service';

@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly labelsService: LabelsService,
  ) {}

  @Get()
  async list(@Query() query: LeadListQueryDto, @CurrentUser() user: any) {
    return this.leadsService.list(query, user);
  }

  @Get('my-dept-pool')
  async myDeptPool(@CurrentUser() user: any, @Query() query: PoolListQueryDto) {
    return this.leadsService.myDeptPool(user, query);
  }

  // 4 Kho endpoints
  @Get('pool/new')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async poolNew(@Query() query: PoolListQueryDto, @CurrentUser() user: any) {
    return this.leadsService.poolNewFiltered(query, user);
  }

  @Get('pool/zoom')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async poolZoom(@Query() query: PoolListQueryDto, @CurrentUser() user: any) {
    return this.leadsService.poolZoom(query, user);
  }

  @Get('pool/department/:deptId')
  async poolDepartment(
    @Param('deptId', ParseBigIntPipe) deptId: bigint,
    @CurrentUser() user: any,
    @Query() query: PoolListQueryDto,
  ) {
    // USER can only see own department pool; MANAGER+ can see any
    if (user.role === 'USER' && user.departmentId?.toString() !== deptId.toString()) {
      throw new BadRequestException('Bạn chỉ có thể xem kho phòng ban của mình');
    }
    return this.leadsService.poolDepartment(deptId, query, user);
  }

  @Get('pool/floating')
  async poolFloating(@Query() query: PoolListQueryDto, @CurrentUser() user: any) {
    return this.leadsService.poolFloating(query, user);
  }

  // Lịch sử các lead trùng SĐT - dùng cho icon "trùng" trên UI Kho
  @Get('duplicates')
  async duplicates(@Query('phone') phone?: string) {
    if (!phone) throw new BadRequestException('phone là bắt buộc');
    return this.leadsService.findDuplicatesByPhone(phone);
  }

  // ── Label quick-filter chip counts (unified) ────────────────────────────
  // 1 endpoint duy nhất - scope qua query filter (status, assignment, ...).
  // Trước đây tách 4 route theo scope cố định (my/pool-new/pool-zoom/floating);
  // sau khi DTO mở rộng (status array + assignment), filter combo đủ biểu diễn
  // mọi scope cũ → không cần route riêng nữa.
  @Get('label-counts')
  async labelCounts(@Query() query: LeadListQueryDto, @CurrentUser() user: any) {
    const data = await this.leadsService.labelCounts(query, user);
    return { data };
  }

  // Xuất CSV theo bộ lọc hiện tại. ĐẶT TRƯỚC @Get(':id') để "export-csv" không bị
  // route param :id nuốt (ParseBigInt sẽ fail). Chỉ MANAGER+ - service tự scope qua user.
  @Get('export-csv')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async exportCsv(@Query() query: LeadListQueryDto, @CurrentUser() user: any, @Res() res: Response) {
    const csv = await this.leadsService.exportCsv(query, user);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="leads-export-${date}.csv"`);
    res.send('﻿' + csv); // BOM cho Excel UTF-8
  }

  @Get(':id')
  async findById(@Param('id', ParseBigIntPipe) id: bigint) {
    // Đọc chi tiết = open-trust: mọi role xem được mọi lead (kể cả lead kho/thả nổi
    // hoặc lead của nhân viên khác tìm thấy qua danh sách). Ghi/mutation vẫn scope
    // theo người sở hữu qua findById(id, user, 'write').
    const data = await this.leadsService.findById(id);
    return { data };
  }

  @Post()
  // Mọi role đăng nhập đều tạo được lead. USER/LEADER tự tạo -> lead auto-gán về mình
  // (IN_PROGRESS) + báo MANAGER; MANAGER+ tạo -> vào POOL/ZOOM như cũ. Phân nhánh ở service.
  async create(@Body() dto: CreateLeadDto, @CurrentUser() user: any) {
    const data = await this.leadsService.create(dto, user);
    return { data };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: any,
  ) {
    const data = await this.leadsService.update(id, body, user);
    return { data };
  }

  @Post('bulk-assign')
  @HttpCode(200)
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async bulkAssign(
    @Body() body: { leadIds: string[]; userId: string; labelId?: string },
    @CurrentUser() user: any,
  ) {
    if (!body.leadIds?.length) throw new BadRequestException('leadIds là bắt buộc');
    if (!body.userId) throw new BadRequestException('userId là bắt buộc');
    return this.leadsService.bulkAssign(
      body.leadIds.map(id => BigInt(id)),
      BigInt(body.userId),
      user,
      body.labelId ? BigInt(body.labelId) : undefined,
    );
  }

  @Post(':id/assign')
  @HttpCode(200)
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async assign(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { userId: string },
    @CurrentUser() user: any,
  ) {
    const data = await this.leadsService.assign(id, BigInt(body.userId), user);
    return { data };
  }

  @Post(':id/recall')
  @HttpCode(200)
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async recall(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    const data = await this.leadsService.recall(id, user);
    return { data };
  }

  @Post('bulk-recall')
  @HttpCode(200)
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async bulkRecall(
    @Body() body: { leadIds: string[] },
    @CurrentUser() user: any,
  ) {
    if (!body.leadIds?.length) throw new BadRequestException('leadIds là bắt buộc');
    return this.leadsService.bulkRecall(
      body.leadIds.map(id => BigInt(id)),
      user,
    );
  }

  @Post(':id/claim')
  @HttpCode(200)
  async claim(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    const data = await this.leadsService.claim(id, user);
    return { data };
  }

  @Post(':id/transfer')
  @HttpCode(200)
  async transfer(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { targetType: string; targetDeptId?: string },
    @CurrentUser() user: any,
  ) {
    const data = await this.leadsService.transfer(id, body.targetType, body.targetDeptId ?? null, user);
    return { data };
  }

  @Post(':id/status')
  @HttpCode(200)
  async changeStatus(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { status: LeadStatus },
    @CurrentUser() user: any,
  ) {
    const data = await this.leadsService.changeStatus(id, body.status, user);
    return { data };
  }

  @Post(':id/convert')
  @HttpCode(200)
  async convert(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    const data = await this.leadsService.convert(id, user);
    return { data };
  }

  @Post('bulk-delete')
  @HttpCode(200)
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async bulkDelete(@Body() body: { ids: string[] }) {
    if (!body.ids?.length) throw new BadRequestException('ids là bắt buộc');
    if (body.ids.length > 1000) throw new BadRequestException('Tối đa 1000 lead mỗi lần');
    const result = await this.leadsService.bulkSoftDelete(body.ids.map(id => BigInt(id)));
    return { data: result };
  }

  @Delete(':id')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async delete(@Param('id', ParseBigIntPipe) id: bigint) {
    await this.leadsService.softDelete(id);
    return { data: { message: 'Đã xóa lead' } };
  }

  // Set / clear single label - ownership verified via findById
  @Patch(':id/label')
  async setLabel(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { labelId: string | null },
    @CurrentUser() user: any,
  ) {
    await this.leadsService.findById(id, user, 'write'); // ownership check (mutation -> self-scope LEADER)
    const labelId = body.labelId ? BigInt(body.labelId) : null;
    await this.labelsService.setLeadLabel(id, labelId, user.id);
    return { data: { message: labelId ? 'Đã gắn nhãn' : 'Đã gỡ nhãn' } };
  }

  // ── Số điện thoại phụ trên hồ sơ lead ───────────────────────────────────
  // Không @Roles decorator: mọi role auth (USER/MANAGER/SUPER_ADMIN) đều được
  // thao tác. Ownership scoped qua findById -> buildAccessFilter.
  // Khác customer-phones endpoint (cũ chỉ MANAGER+): cho phép sale ghi SĐT
  // người thân ngay khi đang gọi điện mà không cần convert lead.

  @Get(':id/phones')
  async listSecondaryPhones(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: any,
  ) {
    const data = await this.leadsService.listSecondaryPhones(id, user);
    return { data };
  }

  @Post(':id/phones')
  async addSecondaryPhone(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: AddCustomerPhoneDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.leadsService.addSecondaryPhone(id, dto, user);
    return { data };
  }

  @Patch(':id/phones/:phoneId')
  async updateSecondaryPhone(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Param('phoneId', ParseBigIntPipe) phoneId: bigint,
    @Body() dto: UpdateCustomerPhoneDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.leadsService.updateSecondaryPhone(id, phoneId, dto, user);
    return { data };
  }

  @Delete(':id/phones/:phoneId')
  async deleteSecondaryPhone(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Param('phoneId', ParseBigIntPipe) phoneId: bigint,
    @CurrentUser() user: any,
  ) {
    await this.leadsService.softDeleteSecondaryPhone(id, phoneId, user);
    return { data: { message: 'Đã xóa số phụ' } };
  }
}
