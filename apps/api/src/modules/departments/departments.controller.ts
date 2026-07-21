import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { DepartmentsService } from './departments.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  async list(@Query() query: PaginationQueryDto) {
    return this.departmentsService.list(query);
  }

  @Get(':id')
  async findById(@Param('id', ParseBigIntPipe) id: bigint) {
    const data = await this.departmentsService.findById(id);
    return { data };
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  async create(@Body() body: { name: string }) {
    const data = await this.departmentsService.create(body);
    return { data };
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async update(@Param('id', ParseBigIntPipe) id: bigint, @Body() body: { name?: string }) {
    const data = await this.departmentsService.update(id, body);
    return { data };
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async delete(@Param('id', ParseBigIntPipe) id: bigint) {
    await this.departmentsService.delete(id);
    return { data: { message: 'Đã xóa phòng ban' } };
  }
}
