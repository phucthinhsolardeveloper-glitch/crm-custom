import {
  Controller, Get, Put, Delete, Body, Param, ParseIntPipe, BadRequestException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { KpiTargetsService } from './kpi-targets.service';
import { UpsertKpiTargetsDto } from './dto/upsert-kpi-targets.dto';
import { Roles } from '../../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../../common/pipes/parse-bigint.pipe';

/**
 * KPI doanh số (target + actual) cho từng user.
 * - PUT / DELETE: chỉ SUPER_ADMIN.
 * - GET: USER chỉ xem chính mình (enforce trong service); MANAGER+ xem mọi user.
 *
 * Nested dưới /users/:id/kpi-* theo pattern SIP Config.
 */
@Controller('users/:id')
export class KpiTargetsController {
  constructor(private readonly service: KpiTargetsService) {}

  /** Danh sách năm đã set KPI cho user (để FE render year selector). */
  @Get('kpi-targets')
  async listYears(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() actor: { id: bigint; role: UserRole },
  ) {
    const data = await this.service.listYears(actor, id);
    return { data };
  }

  /** Lấy KPI target 1 năm. Trả null nếu chưa set (FE hiển thị placeholder). */
  @Get('kpi-targets/:year')
  async getOne(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Param('year', ParseIntPipe) year: number,
    @CurrentUser() actor: { id: bigint; role: UserRole },
  ) {
    this.assertYearInRange(year);
    const data = await this.service.getOne(actor, id, year);
    return { data };
  }

  @Put('kpi-targets/:year')
  @Roles(UserRole.SUPER_ADMIN)
  async upsert(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Param('year', ParseIntPipe) year: number,
    @Body() dto: UpsertKpiTargetsDto,
    @CurrentUser() actor: { id: bigint; role: UserRole },
  ) {
    this.assertYearInRange(year);
    const data = await this.service.upsert(actor, id, year, dto);
    return { data };
  }

  @Delete('kpi-targets/:year')
  @Roles(UserRole.SUPER_ADMIN)
  async remove(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Param('year', ParseIntPipe) year: number,
  ) {
    this.assertYearInRange(year);
    return this.service.remove(id, year);
  }

  /** Actual revenue user theo năm (group by month, timezone VN). */
  @Get('kpi-actual/:year')
  async getActual(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Param('year', ParseIntPipe) year: number,
    @CurrentUser() actor: { id: bigint; role: UserRole },
  ) {
    this.assertYearInRange(year);
    const data = await this.service.getActual(actor, id, year);
    return { data };
  }

  private assertYearInRange(year: number) {
    if (year < 2020 || year > 2100) {
      throw new BadRequestException('Năm không hợp lệ (2020-2100)');
    }
  }
}
