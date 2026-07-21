import { Controller, Get, Post, Patch, Delete, Body, Param, Query, BadRequestException } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { RefundsService } from './refunds.service';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

class RefundListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}

/** Body nhập tay 1 dòng hoàn tiền. Chỉ amount bắt buộc; còn lại optional. */
interface RefundBody {
  customerName?: string;
  customerPhone?: string;
  productId?: string;
  productName?: string;
  productPrice?: number;
  vatRate?: number;
  groupName?: string;
  teamName?: string;
  refundDate?: string;
  amount?: number;
  refundMethod?: string;
  refundBank?: string;
  billImage?: string;
  notes?: string;
  larkSyncId?: string;
}

@Controller('refunds')
export class RefundsController {
  constructor(private readonly service: RefundsService) {}

  // Self-service: USER/LEADER thấy dòng của mình, MANAGER+ thấy tất cả (buildAccessFilter).
  @Get()
  async list(@Query() query: RefundListQueryDto, @CurrentUser() user: any) {
    return this.service.list(query, user);
  }

  // Không @Roles: mọi sale tự tạo dòng hoàn tiền của mình (như tạo đơn/payment).
  @Post()
  async create(@Body() body: RefundBody, @CurrentUser() user: any) {
    const input = this.toInput(body);
    return { data: await this.service.create(input, BigInt(user.id)) };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: RefundBody,
    @CurrentUser() user: any,
  ) {
    // amount có thể bỏ trống khi sửa field khác - chỉ validate khi được gửi.
    if (body.amount !== undefined && (typeof body.amount !== 'number' || body.amount <= 0)) {
      throw new BadRequestException('Số tiền hoàn phải là số dương');
    }
    return { data: await this.service.update(id, this.mapBody(body), user) };
  }

  @Delete(':id')
  async delete(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    await this.service.softDelete(id, user);
    return { data: { message: 'Đã xóa dòng hoàn tiền' } };
  }

  private toInput(body: RefundBody) {
    if (body.amount === undefined || body.amount === null) throw new BadRequestException('Số tiền hoàn là bắt buộc');
    if (typeof body.amount !== 'number' || body.amount <= 0) throw new BadRequestException('Số tiền hoàn phải là số dương');
    return this.mapBody(body);
  }

  /** Map body -> input service. Product/price/vat là snapshot lúc tạo (chọn từ hệ thống). */
  private mapBody(body: RefundBody) {
    return {
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      productId: body.productId ? BigInt(body.productId) : undefined,
      productName: body.productName,
      productPrice: body.productPrice,
      vatRate: body.vatRate,
      groupName: body.groupName,
      teamName: body.teamName,
      refundDate: body.refundDate ? new Date(body.refundDate) : undefined,
      amount: body.amount as number,
      refundMethod: body.refundMethod,
      refundBank: body.refundBank,
      billImage: body.billImage,
      notes: body.notes,
      larkSyncId: body.larkSyncId ? BigInt(body.larkSyncId) : undefined,
    };
  }
}
