import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { LarkMappingService } from './lark-mapping.service';
import { UpsertLarkMappingDto } from './dto/upsert-lark-mapping.dto';
import { listCatalogEntries } from './lark-field-catalog';
import { LARK_SYNC_PRESETS } from './lark-sync.presets';

/**
 * Quan ly cau hinh dong bo payment -> Lark Base.
 * SUPER_ADMIN only: day la cau hinh he thong (routing doanh thu sang Lark).
 */
@Controller('lark-sync')
@Roles(UserRole.SUPER_ADMIN)
export class LarkMappingController {
  constructor(private readonly service: LarkMappingService) {}

  /** Danh sach CRM field xuat duoc - UI render dropdown chon catalogKey. */
  @Get('catalog')
  getCatalog() {
    return { data: listCatalogEntries() };
  }

  /** Preset field-map 5 kenh ban dau - UI nut "Tai mau". */
  @Get('presets')
  getPresets() {
    return { data: LARK_SYNC_PRESETS };
  }

  @Get('mappings')
  list() {
    return this.service.list();
  }

  /** Dropdown duong ong (id + name) cho form tao don - mo cho moi role. */
  @Get('options')
  @Roles(UserRole.MANAGER, UserRole.LEADER, UserRole.USER)
  options() {
    return this.service.listOptions();
  }

  /** Tao moi (khong id) hoac cap nhat duong ong Lark theo id. */
  @Post('mappings')
  upsert(@Body() body: UpsertLarkMappingDto) {
    return this.service.upsert(body);
  }

  @Delete('mappings/:id')
  remove(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.service.remove(id);
  }
}
