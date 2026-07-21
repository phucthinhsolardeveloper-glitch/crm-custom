import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { AuditLogService } from './audit-log.service';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

@Controller('audit-logs')
@Roles(UserRole.SUPER_ADMIN)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  async list(@Query() query: QueryAuditLogDto) {
    return this.auditLogService.query(query);
  }

  @Get('actions')
  async listActions() {
    const data = await this.auditLogService.listDistinctActions();
    return { data };
  }

  @Get(':id')
  async findOne(@Param('id', ParseBigIntPipe) id: bigint) {
    const row = await this.auditLogService.findById(id);
    if (!row) throw new NotFoundException('Không tìm thấy audit log');
    return { data: row };
  }
}
