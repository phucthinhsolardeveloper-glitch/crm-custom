import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RecallConfigService } from './recall-config.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

@Controller('recall-configs')
@Roles(UserRole.SUPER_ADMIN)
export class RecallConfigController {
  constructor(private readonly service: RecallConfigService) {}

  // ── Label Recall Config CRUD ─────────────────────────────────────────────
  // IMPORTANT: declare literal-path routes BEFORE ':id' routes so NestJS
  // doesn't match e.g. GET /recall-configs/labels against @Get(':id').

  @Get('labels')
  listLabelConfigs() {
    return this.service.listLabelConfigs();
  }

  @Post('labels')
  createLabelConfig(
    @Body() body: { labelId: string; recallMinutes: number; action?: string },
    @CurrentUser() user: { id: bigint },
  ) {
    return this.service.createLabelConfig(
      { labelId: BigInt(body.labelId), recallMinutes: body.recallMinutes, action: body.action },
      user.id,
    );
  }

  @Patch('labels/:id')
  updateLabelConfig(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { recallMinutes?: number; isActive?: boolean; action?: string },
  ) {
    return this.service.updateLabelConfig(id, {
      recallMinutes: body.recallMinutes,
      isActive: body.isActive,
      action: body.action,
    });
  }

  @Delete('labels/:id')
  removeLabelConfig(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.service.removeLabelConfig(id);
  }

  // ── Generic Recall Config CRUD (entity-level: LEAD/CUSTOMER pool expiry) ─

  @Get()
  list() {
    return this.service.list();
  }

  @Post('run-now')
  runNow() {
    return this.service.runAutoRecall();
  }

  @Get(':id')
  getById(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.service.getById(id);
  }

  @Post()
  create(
    @Body() body: { entityType: string; maxDaysInPool: number; autoLabelId?: string | null },
    @CurrentUser() user: { id: bigint },
  ) {
    const autoLabelId = body.autoLabelId ? BigInt(body.autoLabelId) : null;
    return this.service.create(
      { entityType: body.entityType, maxDaysInPool: body.maxDaysInPool, autoLabelId },
      user.id,
    );
  }

  @Patch(':id')
  update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: { maxDaysInPool?: number; autoLabelId?: string | null; isActive?: boolean },
  ) {
    const autoLabelId =
      body.autoLabelId === undefined ? undefined : body.autoLabelId === null ? null : BigInt(body.autoLabelId);
    return this.service.update(id, {
      maxDaysInPool: body.maxDaysInPool,
      autoLabelId,
      isActive: body.isActive,
    });
  }

  @Delete(':id')
  remove(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.service.remove(id);
  }
}
