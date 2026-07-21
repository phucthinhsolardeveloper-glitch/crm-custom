import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UserPhonesService } from './user-phones.service';
import { CreateUserPhoneDto } from './dto/create-user-phone.dto';
import { ListUserPhonesDto } from './dto/list-user-phones.dto';
import { TransferUserPhoneDto } from './dto/transfer-user-phone.dto';
import { BulkCreateUserPhoneDto } from './dto/bulk-create-user-phone.dto';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

@Controller('admin/user-phones')
@Roles(UserRole.SUPER_ADMIN)
export class UserPhonesController {
  constructor(private readonly service: UserPhonesService) {}

  @Get()
  async list(@Query() query: ListUserPhonesDto) {
    return this.service.list(query);
  }

  @Get('by-user/:userId')
  async listByUser(@Param('userId', ParseBigIntPipe) userId: bigint) {
    const data = await this.service.listByUser(userId);
    return { data };
  }

  @Get(':id/history')
  async getHistory(@Param('id', ParseBigIntPipe) id: bigint) {
    const data = await this.service.getHistory(id);
    return { data };
  }

  @Post()
  async create(@Body() dto: CreateUserPhoneDto, @CurrentUser() user: any) {
    const data = await this.service.create(dto, BigInt(user.id));
    return { data };
  }

  @Post('bulk')
  @HttpCode(200)
  async bulkCreate(@Body() dto: BulkCreateUserPhoneDto, @CurrentUser() user: any) {
    const data = await this.service.bulkCreate(dto, BigInt(user.id));
    return { data };
  }

  @Patch(':id/transfer')
  @HttpCode(200)
  async transfer(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: TransferUserPhoneDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.service.transfer(id, dto, BigInt(user.id));
    return { data };
  }

  @Delete(':id')
  async remove(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    const data = await this.service.remove(id, BigInt(user.id));
    return { data };
  }
}
