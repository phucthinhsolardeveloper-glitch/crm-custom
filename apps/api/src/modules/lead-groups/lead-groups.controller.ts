import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { LeadGroupsService } from './lead-groups.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

@Controller('lead-groups')
export class LeadGroupsController {
  constructor(private readonly service: LeadGroupsService) {}

  @Get()
  async list(@Query('sourceId') sourceId?: string) {
    return this.service.list(sourceId);
  }

  // Nhóm (cấp con) MANAGER+ được CRUD (khác Nguồn cha chỉ SUPER_ADMIN).
  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  async create(
    @Body() body: { name: string; sourceId: string; description?: string; skipPool?: boolean | null },
  ) {
    const data = await this.service.create(body);
    return { data };
  }

  // Đổi nguồn cha cho nhiều nhóm cùng lúc (kèm đồng bộ source_id của lead). MANAGER+.
  // Đặt trước @Patch(':id')/@Delete(':id') để route literal không bị nuốt bởi param.
  @Post('bulk-move')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  async bulkMove(@Body() body: { groupIds: string[]; targetSourceId: string }) {
    const data = await this.service.bulkMove(body.groupIds, body.targetSourceId);
    return { data };
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  async update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body()
    body: {
      name?: string;
      description?: string;
      isActive?: boolean;
      sourceId?: string;
      skipPool?: boolean | null;
    },
  ) {
    const data = await this.service.update(id, body);
    return { data };
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  async deactivate(@Param('id', ParseBigIntPipe) id: bigint) {
    await this.service.deactivate(id);
    return { data: { message: 'Đã vô hiệu hóa nhóm nguồn' } };
  }
}
