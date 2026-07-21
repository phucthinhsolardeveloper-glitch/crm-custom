import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { EmployeeLevelsService } from './employee-levels.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

@Controller('employee-levels')
export class EmployeeLevelsController {
  constructor(private readonly service: EmployeeLevelsService) {}

  @Get()
  async list() {
    return this.service.list();
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  async create(@Body() body: { name: string; rank: number }) {
    const data = await this.service.create(body);
    return { data };
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { name?: string; rank?: number },
  ) {
    const data = await this.service.update(id, body);
    return { data };
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async delete(@Param('id', ParseBigIntPipe) id: bigint) {
    await this.service.delete(id);
    return { data: { message: 'Đã xóa cấp bậc' } };
  }
}
