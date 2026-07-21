import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AssignmentTemplatesService } from './assignment-templates.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

@Controller('assignment-templates')
@Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
export class AssignmentTemplatesController {
  constructor(private readonly service: AssignmentTemplatesService) {}

  @Get()
  async list() {
    return { data: await this.service.list() };
  }

  @Get(':id')
  async getById(@Param('id', ParseBigIntPipe) id: bigint) {
    return { data: await this.service.getById(id) };
  }

  @Post()
  async create(
    @Body() body: { name: string; strategy?: string; memberUserIds: string[] },
    @CurrentUser() user: any,
  ) {
    const memberUserIds = body.memberUserIds.map((id) => BigInt(id));
    return { data: await this.service.create({ ...body, memberUserIds }, BigInt(user.id)) };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { name?: string; strategy?: string; isActive?: boolean; memberUserIds?: string[] },
  ) {
    const memberUserIds = body.memberUserIds?.map((id) => BigInt(id));
    return { data: await this.service.update(id, { ...body, memberUserIds }) };
  }

  @Delete(':id')
  async remove(@Param('id', ParseBigIntPipe) id: bigint) {
    return { data: await this.service.remove(id) };
  }

  @Post(':id/apply')
  async apply(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { leadIds: string[]; labelId?: string },
    @CurrentUser() user: any,
  ) {
    const leadIds = body.leadIds.map((lid) => BigInt(lid));
    const labelId = body.labelId ? BigInt(body.labelId) : undefined;
    return { data: await this.service.applyTemplate(id, leadIds, BigInt(user.id), labelId) };
  }
}
