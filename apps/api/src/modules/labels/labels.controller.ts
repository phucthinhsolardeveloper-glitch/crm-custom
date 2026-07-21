import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { LabelsService } from './labels.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

interface LabelBody {
  name?: string;
  color?: string;
  textColor?: string;
  category?: string;
  isActive?: boolean;
  triggersOrder?: boolean;
  /** Auto-recall window in MINUTES. null = remove config, number = upsert. SUPER_ADMIN only. */
  recallMinutes?: number | null;
  /** Automation mode when window expires: RECALL | NOTIFY. SUPER_ADMIN only. */
  action?: string;
}

@Controller('labels')
export class LabelsController {
  constructor(private readonly service: LabelsService) {}

  @Get()
  async list(@Query('category') category?: string) {
    return this.service.list(category);
  }

  // Nhãn hiển thị theo phòng ban - chỉ áp cho chip quick-filter, không áp picker.
  @Get('department-config')
  @Roles(UserRole.SUPER_ADMIN)
  async getDepartmentConfig() {
    return this.service.getDepartmentLabelConfig();
  }

  @Put('department-config/:departmentId')
  @Roles(UserRole.SUPER_ADMIN)
  async setDepartmentConfig(
    @Param('departmentId', ParseBigIntPipe) departmentId: bigint,
    @Body() body: { labelIds?: string[] },
  ) {
    if (!Array.isArray(body?.labelIds) || body.labelIds.some((id) => typeof id !== 'string')) {
      throw new BadRequestException('labelIds phải là mảng chuỗi');
    }
    const data = await this.service.setDepartmentLabelConfig(departmentId, body.labelIds);
    return { data };
  }

  @Post()
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async create(
    @Body() body: LabelBody & { name: string },
    @CurrentUser() user: { id: bigint; role: UserRole },
  ) {
    const data = await this.service.create(body, user);
    return { data };
  }

  @Patch(':id')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: LabelBody,
    @CurrentUser() user: { id: bigint; role: UserRole },
  ) {
    const data = await this.service.update(id, body, user);
    return { data };
  }

  @Delete(':id')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async deactivate(@Param('id', ParseBigIntPipe) id: bigint) {
    await this.service.deactivate(id);
    return { data: { message: 'Đã vô hiệu hóa nhãn' } };
  }
}
