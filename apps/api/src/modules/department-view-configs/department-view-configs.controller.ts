import { Controller, Get, Put, Delete, Param, Body } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import {
  DepartmentViewConfigsService,
  type DeptViewConfigShape,
} from './department-view-configs.service';

@Controller('department-view-configs')
export class DepartmentViewConfigsController {
  constructor(private readonly service: DepartmentViewConfigsService) {}

  /** Config của phòng ban user hiện tại - mọi role gọi được (null nếu không có). */
  @Get('my')
  async getMine(@CurrentUser() user: { departmentId: bigint | null }) {
    const config = await this.service.getMine(user.departmentId);
    return { data: config };
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  async listAll() {
    return { data: await this.service.listAll() };
  }

  @Put(':departmentId')
  @Roles(UserRole.SUPER_ADMIN)
  async upsert(
    @Param('departmentId', ParseBigIntPipe) departmentId: bigint,
    @Body() body: { config?: DeptViewConfigShape },
  ) {
    const data = await this.service.upsert(departmentId, body?.config as DeptViewConfigShape);
    return { data };
  }

  @Delete(':departmentId')
  @Roles(UserRole.SUPER_ADMIN)
  async remove(@Param('departmentId', ParseBigIntPipe) departmentId: bigint) {
    return { data: await this.service.remove(departmentId) };
  }
}
