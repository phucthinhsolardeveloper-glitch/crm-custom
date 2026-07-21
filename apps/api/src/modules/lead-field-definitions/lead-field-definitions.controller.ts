import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { LeadFieldDefinitionsService } from './lead-field-definitions.service';

interface CreateFieldBody {
  key: string;
  label: string;
  sortOrder?: number;
}

interface UpdateFieldBody {
  label?: string;
  isActive?: boolean;
  sortOrder?: number;
}

@Controller('lead-field-definitions')
export class LeadFieldDefinitionsController {
  constructor(private readonly service: LeadFieldDefinitionsService) {}

  /** Mọi role authed đọc được - form/table cần render trường động. */
  @Get()
  async list(@Query('includeInactive') includeInactive?: string) {
    return { data: await this.service.list(includeInactive === 'true') };
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  async create(@Body() body: CreateFieldBody) {
    return { data: await this.service.create(body) };
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async update(@Param('id', ParseBigIntPipe) id: bigint, @Body() body: UpdateFieldBody) {
    return { data: await this.service.update(id, body) };
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async deactivate(@Param('id', ParseBigIntPipe) id: bigint) {
    await this.service.deactivate(id);
    return { data: { message: 'Đã vô hiệu hóa trường tùy chỉnh' } };
  }
}
