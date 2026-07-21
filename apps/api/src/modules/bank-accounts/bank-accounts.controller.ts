import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { UserRole, BankAccountDirection } from '@prisma/client';
import { BankAccountsService } from './bank-accounts.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

/** Body cấu hình tài khoản ngân hàng (create cần name; update mọi field optional). */
interface BankAccountBody {
  name?: string;
  accountNumber?: string;
  bankName?: string;
  accountHolder?: string;
  direction?: BankAccountDirection;
  label?: string;
  labelColor?: string;
  isActive?: boolean;
}

@Controller('bank-accounts')
export class BankAccountsController {
  constructor(private readonly service: BankAccountsService) {}

  // Active-only - dropdown tạo đơn/thanh toán, dashboard (public).
  @Get()
  async list() { return this.service.list(); }

  // Toàn bộ TK gồm DEACTIVE - trang settings quản lý, chỉ SUPER_ADMIN.
  @Get('all')
  @Roles(UserRole.SUPER_ADMIN)
  async listAll() { return this.service.listAll(); }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  async create(@Body() body: BankAccountBody) {
    return { data: await this.service.create({ ...body, name: body.name ?? '' }) };
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async update(@Param('id', ParseBigIntPipe) id: bigint, @Body() body: BankAccountBody) {
    return { data: await this.service.update(id, body) };
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async deactivate(@Param('id', ParseBigIntPipe) id: bigint) {
    await this.service.deactivate(id);
    return { data: { message: 'Đã vô hiệu hóa tài khoản ngân hàng' } };
  }
}
