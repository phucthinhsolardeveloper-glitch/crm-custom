import { Controller, Get, Post, Patch, Delete, Body, Param, BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CustomerTiersService, CustomerTierInput } from './customer-tiers.service';
import { CustomerTierRecalcService } from './customer-tier-recalc.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

interface ReorderBody {
  updates: Array<{ id: string; sortOrder: number }>;
}

@Controller('customer-tiers')
export class CustomerTiersController {
  constructor(
    private readonly service: CustomerTiersService,
    private readonly recalcService: CustomerTierRecalcService,
  ) {}

  /** Public: tất cả role cần thấy tiers cho dropdown/badge lookup. */
  @Get()
  async list() {
    return this.service.list();
  }

  @Get(':id')
  async findOne(@Param('id', ParseBigIntPipe) id: bigint) {
    return { data: await this.service.findOne(id) };
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  async create(@Body() body: CustomerTierInput) {
    return { data: await this.service.create(body) };
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: CustomerTierInput,
  ) {
    const { tier, minSpendingChanged } = await this.service.update(id, body);
    // Đổi ngưỡng → recalc cho toàn bộ customer (chạy nền, không block response)
    if (minSpendingChanged) {
      this.recalcService.recalcAll().catch(() => {
        // Logged inside service - swallow để không kill request promise
      });
    }
    return { data: tier, recalcTriggered: minSpendingChanged };
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async deactivate(@Param('id', ParseBigIntPipe) id: bigint) {
    await this.service.deactivate(id);
    return { data: { message: 'Đã vô hiệu hóa tier' } };
  }

  /** Batch reorder qua DnD. */
  @Patch('reorder/batch')
  @Roles(UserRole.SUPER_ADMIN)
  async reorder(@Body() body: ReorderBody) {
    if (!Array.isArray(body?.updates) || body.updates.length === 0) {
      throw new BadRequestException('updates array bắt buộc');
    }
    const updates = body.updates.map((u) => ({
      id: BigInt(u.id),
      sortOrder: Number(u.sortOrder),
    }));
    return { data: await this.service.reorder(updates) };
  }

  /** Manual trigger bulk recalc (admin tool). */
  @Post('recalc-all')
  @Roles(UserRole.SUPER_ADMIN)
  async recalcAll() {
    const result = await this.recalcService.recalcAll();
    return { data: result };
  }
}
