import { Controller, Get, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { LarkSyncHistoryService } from './lark-sync-history.service';
import { ListLarkSyncHistoryQueryDto } from './dto/list-lark-sync-history-query.dto';

/**
 * Lich su dong bo payment -> Lark Base (audit). SUPER_ADMIN only - cung pham vi
 * voi cau hinh Lark Sync. Phan trang offset (page/limit) + loc trang thai/duong ong/tu khoa.
 */
@Controller('lark-sync')
@Roles(UserRole.SUPER_ADMIN)
export class LarkSyncHistoryController {
  constructor(private readonly service: LarkSyncHistoryService) {}

  @Get('history')
  list(@Query() query: ListLarkSyncHistoryQueryDto) {
    return this.service.list(query);
  }
}
