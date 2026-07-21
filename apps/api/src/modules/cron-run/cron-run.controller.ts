import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { CronRunService } from './cron-run.service';
import { QueryCronRunDto } from './dto/query-cron-run.dto';

@Controller('cron-runs')
@Roles(UserRole.SUPER_ADMIN)
export class CronRunController {
  constructor(private readonly cronRunService: CronRunService) {}

  @Get()
  async list(@Query() query: QueryCronRunDto) {
    return this.cronRunService.query(query);
  }

  @Get('jobs')
  async listJobs() {
    const data = await this.cronRunService.listDistinctJobNames();
    return { data };
  }

  @Get(':id')
  async findOne(@Param('id', ParseBigIntPipe) id: bigint) {
    const row = await this.cronRunService.findById(id);
    if (!row) throw new NotFoundException('Không tìm thấy cron run');
    return { data: row };
  }
}
