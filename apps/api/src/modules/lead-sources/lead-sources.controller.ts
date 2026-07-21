import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { LeadSourcesService } from './lead-sources.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

@Controller('lead-sources')
export class LeadSourcesController {
  constructor(private readonly service: LeadSourcesService) {}

  @Get()
  async list() {
    return this.service.list();
  }

  // Nguồn (cấp cha) chỉ SUPER_ADMIN được CRUD. MANAGER quản lý Nhóm con qua /lead-groups.
  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  async create(@Body() body: { name: string; description?: string; skipPool?: boolean }) {
    const data = await this.service.create(body);
    return { data };
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { name?: string; description?: string; isActive?: boolean; skipPool?: boolean },
  ) {
    const data = await this.service.update(id, body);
    return { data };
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async deactivate(@Param('id', ParseBigIntPipe) id: bigint) {
    await this.service.deactivate(id);
    return { data: { message: 'Đã vô hiệu hóa nguồn lead' } };
  }
}
