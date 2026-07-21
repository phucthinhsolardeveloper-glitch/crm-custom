import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ProductGroupsService } from './product-groups.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

@Controller('product-groups')
export class ProductGroupsController {
  constructor(private readonly service: ProductGroupsService) {}

  @Get()
  async list() { return this.service.list(); }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  async create(@Body() body: { name: string }) {
    return { data: await this.service.create(body) };
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async update(@Param('id', ParseBigIntPipe) id: bigint, @Body() body: { name?: string }) {
    return { data: await this.service.update(id, body) };
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async deactivate(@Param('id', ParseBigIntPipe) id: bigint) {
    await this.service.deactivate(id);
    return { data: { message: 'Đã vô hiệu hóa nhóm sản phẩm' } };
  }
}
