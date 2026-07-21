import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CallFeedbacksService } from './call-feedbacks.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { CreateCallFeedbackDto } from './dto/create-call-feedback.dto';
import { UpdateCallFeedbackDto } from './dto/update-call-feedback.dto';
import type { CallScopeActor } from './call-logs.service';

/**
 * Feedback (gop y) cho cuoc goi. Controller rieng (`call-feedbacks`) de tranh dung route `:id` cua call-logs.
 * - Tao: LEADER (chi cuoc team) + MANAGER+ (moi cuoc) - service check team qua resolveCallScope.
 * - Xem: moi user dang nhap, service tu chan (USER chi cuoc cua minh, LEADER chi team).
 */
@Controller('call-feedbacks')
export class CallFeedbacksController {
  constructor(private readonly service: CallFeedbacksService) {}

  private actor(user: any): CallScopeActor {
    return { id: user.id, role: user.role, teamId: user.teamId ?? null };
  }

  @Post()
  @Roles(UserRole.LEADER, UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async create(@Body() dto: CreateCallFeedbackDto, @CurrentUser() user: any) {
    return { data: await this.service.create(dto, this.actor(user)) };
  }

  @Get()
  async list(@Query('callLogId', ParseBigIntPipe) callLogId: bigint, @CurrentUser() user: any) {
    return { data: await this.service.list(callLogId, this.actor(user)) };
  }

  @Patch(':id')
  @Roles(UserRole.LEADER, UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UpdateCallFeedbackDto,
    @CurrentUser() user: any,
  ) {
    return { data: await this.service.update(id, dto.content, this.actor(user)) };
  }

  @Delete(':id')
  @HttpCode(200)
  @Roles(UserRole.LEADER, UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async remove(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    return { data: await this.service.remove(id, this.actor(user)) };
  }
}
