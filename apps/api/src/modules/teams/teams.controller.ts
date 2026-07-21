import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { TeamsService } from './teams.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  async list(@Query('departmentId') departmentId?: string) {
    return this.teamsService.list(departmentId);
  }

  @Get(':id')
  async findById(@Param('id', ParseBigIntPipe) id: bigint) {
    const data = await this.teamsService.findById(id);
    return { data };
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  async create(@Body() body: { name: string; departmentId: string; leaderId: string }) {
    const data = await this.teamsService.create(body);
    return { data };
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  async update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { name?: string; leaderId?: string },
  ) {
    const data = await this.teamsService.update(id, body);
    return { data };
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  async delete(@Param('id', ParseBigIntPipe) id: bigint) {
    await this.teamsService.delete(id);
    return { data: { message: 'Đã xóa team' } };
  }
}
