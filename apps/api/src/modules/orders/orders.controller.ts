import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, BadRequestException } from '@nestjs/common';
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { UserRole, OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

class OrderListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  leadId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  createdBy?: string;

  @IsOptional()
  @IsString()
  format?: string;

  @IsOptional()
  @IsString()
  groupType?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  formatId?: string;

  @IsOptional()
  @IsString()
  productGroupId?: string;
}

@Controller('orders')
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Get()
  async list(@Query() query: OrderListQueryDto, @CurrentUser() user: any) {
    // USER role: only see own orders (override createdBy filter)
    const createdByFilter = user.role === UserRole.USER ? BigInt(user.id) : (query.createdBy ? BigInt(query.createdBy) : undefined);
    const formatId = query.formatId ? BigInt(query.formatId) : undefined;
    const productGroupId = query.productGroupId ? BigInt(query.productGroupId) : undefined;
    return this.service.list({ ...query, createdByFilter, formatId, productGroupId }, user);
  }

  // Đọc thuần, KHÔNG scope theo role: mọi sale check được đơn tồn của khách trước khi tạo đơn mới
  // (tránh USER tạo trùng vì không thấy đơn của người khác). Đặt trước :id để không khớp nhầm route.
  @Get('customer/:customerId/unpaid-check')
  async unpaidCheck(@Param('customerId', ParseBigIntPipe) customerId: bigint) {
    return { data: await this.service.findUnpaidOrderForCustomer(customerId) };
  }

  // Đọc chi tiết đơn: USER/LEADER xem được đơn "liên quan" tới mình (tạo đơn / giữ lead-khách /
  // đã tạo payment thuộc đơn); MANAGER+ xem tất cả. Chặn IDOR: không xem được đơn hoàn toàn
  // không liên quan. GHI/mutation vẫn scope riêng + @Roles(MANAGER+).
  @Get(':id')
  async findById(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    return { data: await this.service.findByIdForRead(id, user) };
  }

  @Post()
  async create(
    @Body() body: {
      leadId?: string; customerId: string; productId?: string; amount: number; quantity?: number; notes?: string;
      companyName?: string; taxCode?: string; contactPerson?: string;
      customerName?: string; customerPhone?: string; address?: string;
      format?: string; groupType?: string; stt?: string; courseCode?: string;
      vatEmail?: string; formatId?: string; productGroupId?: string; larkSyncId?: string;
      // Payment tao cung don trong 1 transaction - fail thi rollback ca don.
      // Khong nhan vatAmount - server tu tinh tu vatRate cua don.
      payment?: {
        amount: number; transferDate: string;
        paymentTypeId?: string; bankAccountId?: string; transferContent?: string;
        installmentId?: string; notes?: string;
      };
    },
    @CurrentUser() user: any,
  ) {
    // Cho phep thieu customerId khi co leadId - service tu tao customer tu lead.
    if (!body.customerId && !body.leadId) throw new BadRequestException('customerId hoặc leadId là bắt buộc');
    if (body.amount === undefined || body.amount === null) throw new BadRequestException('amount là bắt buộc');
    if (typeof body.amount !== 'number' || body.amount <= 0) throw new BadRequestException('amount phải là số dương');
    if (body.payment) {
      if (typeof body.payment.amount !== 'number' || body.payment.amount <= 0) {
        throw new BadRequestException('Số tiền thanh toán phải là số dương');
      }
      if (!body.payment.transferDate) throw new BadRequestException('Vui lòng nhập Ngày CK');
      // Cung quy tac voi POST /payments: loai TT + dot TT + noi dung CK bat buoc.
      if (!body.payment.paymentTypeId) throw new BadRequestException('Vui lòng chọn Loại thanh toán');
      if (!body.payment.installmentId) throw new BadRequestException('Vui lòng chọn Đợt thanh toán');
      if (!body.payment.transferContent?.trim()) throw new BadRequestException('Vui lòng nhập Nội dung chuyển khoản');
    }
    const createData = {
      ...body,
      formatId: body.formatId ? BigInt(body.formatId) : undefined,
      productGroupId: body.productGroupId ? BigInt(body.productGroupId) : undefined,
      larkSyncId: body.larkSyncId ? BigInt(body.larkSyncId) : undefined,
      payment: body.payment ? {
        ...body.payment,
        transferDate: new Date(body.payment.transferDate),
        installmentId: body.payment.installmentId ? BigInt(body.payment.installmentId) : undefined,
      } : undefined,
    };
    return { data: await this.service.create(createData, user.id) };
  }

  @Patch(':id')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: {
      productId?: string; amount?: number; notes?: string;
      companyName?: string; taxCode?: string; contactPerson?: string;
      customerName?: string; customerPhone?: string; address?: string;
      stt?: string; courseCode?: string; vatEmail?: string;
      formatId?: string; productGroupId?: string;
    },
    @CurrentUser() user: any,
  ) {
    if (body.amount !== undefined && (typeof body.amount !== 'number' || body.amount <= 0)) {
      throw new BadRequestException('amount phải là số dương');
    }
    const updateData = {
      ...body,
      formatId: body.formatId ? BigInt(body.formatId) : undefined,
      productGroupId: body.productGroupId ? BigInt(body.productGroupId) : undefined,
    };
    return { data: await this.service.update(id, updateData, user) };
  }

  @Patch(':id/status')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async updateStatus(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { status: OrderStatus },
  ) {
    return { data: await this.service.updateStatus(id, body.status) };
  }

  @Post('bulk-delete')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN)
  async bulkDelete(@Body() body: { ids: string[] }) {
    if (!body.ids?.length) throw new BadRequestException('ids là bắt buộc');
    if (body.ids.length > 100) throw new BadRequestException('Tối đa 100 đơn hàng mỗi lần');
    const result = await this.service.bulkSoftDelete(body.ids.map(id => BigInt(id)));
    return { data: result };
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async delete(@Param('id', ParseBigIntPipe) id: bigint) {
    await this.service.softDelete(id);
    return { data: { message: 'Đã xóa đơn hàng' } };
  }
}
