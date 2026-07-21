import { Controller, Get, Post, Delete, Patch, Body, Param } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiKeysService } from './api-keys.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

@Controller('api-keys')
@Roles(UserRole.SUPER_ADMIN)
export class ApiKeysController {
  constructor(private readonly service: ApiKeysService) {}

  @Get()
  async list() {
    return { data: await this.service.list() };
  }

  @Post()
  async create(
    @Body() body: { name: string; permissions?: string[]; expiresAt?: string },
    @CurrentUser() user: any,
  ) {
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : undefined;
    const result = await this.service.create(body.name, user.id, body.permissions, expiresAt);
    return { data: result };
  }

  @Patch(':id/deactivate')
  async deactivate(@Param('id', ParseBigIntPipe) id: bigint) {
    await this.service.deactivate(id);
    return { data: { message: 'Đã vô hiệu API key' } };
  }

  @Patch(':id/activate')
  async activate(@Param('id', ParseBigIntPipe) id: bigint) {
    await this.service.activate(id);
    return { data: { message: 'Đã kích hoạt API key' } };
  }

  @Delete(':id')
  async remove(@Param('id', ParseBigIntPipe) id: bigint) {
    await this.service.remove(id);
    return { data: { message: 'Đã xóa API key' } };
  }
}
