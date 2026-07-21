import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaClient, Prisma, UserRole } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { CallLogsService, CallScopeActor } from './call-logs.service';

/** Select shape tra ve cho UI: feedback + author (id + name). */
const FEEDBACK_SELECT = {
  id: true,
  callLogId: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true } },
} satisfies Prisma.CallFeedbackSelect;

@Injectable()
export class CallFeedbacksService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notifications: NotificationsService,
    private readonly callLogs: CallLogsService,
  ) {}

  /**
   * Kiem tra actor co quyen truy cap (xem/feedback) 1 cuoc goi khong - tra ve call neu OK.
   * Tai dung resolveCallScope (DRY voi list call-logs):
   * - MANAGER+ (scope undefined): moi cuoc.
   * - LEADER (scope {in}): cuoc cua member team.
   * - USER (scope bigint): chi cuoc cua minh.
   */
  private async assertCanAccessCall(callId: bigint, actor: CallScopeActor) {
    const call = await this.prisma.callLog.findFirst({
      where: { id: callId, deletedAt: null },
      select: { id: true, matchedUserId: true, matchedEntityType: true, matchedEntityId: true },
    });
    if (!call) throw new NotFoundException('Cuộc gọi không tồn tại');

    const scope = await this.callLogs.resolveCallScope(actor);
    if (scope === undefined) return call; // MANAGER+ / SUPER_ADMIN

    const allowed =
      typeof scope === 'bigint'
        ? call.matchedUserId === scope
        : !!call.matchedUserId && scope.in.some((id) => id === call.matchedUserId);
    if (!allowed) throw new ForbiddenException('Không có quyền với cuộc gọi này');
    return call;
  }

  /** Tao feedback. Controller da chan USER qua @Roles. LEADER chi cuoc team (assertCanAccessCall). */
  async create(dto: { callLogId: string; content: string }, actor: CallScopeActor) {
    const call = await this.assertCanAccessCall(BigInt(dto.callLogId), actor);

    const feedback = await this.prisma.callFeedback.create({
      data: { callLogId: call.id, authorId: actor.id, content: dto.content },
      select: FEEDBACK_SELECT,
    });

    // Thong bao cho sale phu trach (khong tu gui cho chinh nguoi feedback).
    if (call.matchedUserId && call.matchedUserId !== actor.id) {
      const author = await this.prisma.user.findUnique({
        where: { id: actor.id },
        select: { name: true },
      });
      const snippet = dto.content.length > 100 ? `${dto.content.slice(0, 100)}...` : dto.content;
      // entityId = call.id -> UI deep-link /call-logs?callId= mo dung cuoc goi.
      // entityType bo trong (khong phai LEAD/CUSTOMER) de notification-bell route theo type CALL_FEEDBACK.
      await this.notifications
        .create(
          call.matchedUserId,
          `${author?.name ?? 'Quản lý'} vừa feedback cuộc gọi của bạn`,
          `"${snippet}"`,
          'CALL_FEEDBACK',
          undefined,
          call.id,
        )
        .catch(() => {});
    }

    return feedback;
  }

  /** List feedback cua 1 cuoc goi. USER chi xem duoc feedback cuoc cua minh (assertCanAccessCall). */
  async list(callId: bigint, actor: CallScopeActor) {
    await this.assertCanAccessCall(callId, actor);
    return this.prisma.callFeedback.findMany({
      where: { callLogId: callId, deletedAt: null },
      select: FEEDBACK_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Sua feedback - chi tac gia. */
  async update(feedbackId: bigint, content: string, actor: CallScopeActor) {
    const fb = await this.prisma.callFeedback.findFirst({
      where: { id: feedbackId, deletedAt: null },
      select: { id: true, authorId: true },
    });
    if (!fb) throw new NotFoundException('Feedback không tồn tại');
    if (fb.authorId !== actor.id) throw new ForbiddenException('Chỉ tác giả được sửa feedback');

    return this.prisma.callFeedback.update({
      where: { id: feedbackId },
      data: { content },
      select: FEEDBACK_SELECT,
    });
  }

  /** Xoa feedback (soft delete) - tac gia hoac MANAGER+. */
  async remove(feedbackId: bigint, actor: CallScopeActor) {
    const fb = await this.prisma.callFeedback.findFirst({
      where: { id: feedbackId, deletedAt: null },
      select: { id: true, authorId: true },
    });
    if (!fb) throw new NotFoundException('Feedback không tồn tại');

    const isManager = actor.role === UserRole.MANAGER || actor.role === UserRole.SUPER_ADMIN;
    if (fb.authorId !== actor.id && !isManager) {
      throw new ForbiddenException('Không có quyền xoá feedback này');
    }

    await this.prisma.callFeedback.update({
      where: { id: feedbackId },
      data: { deletedAt: new Date() },
    });
    return { id: feedbackId.toString(), message: 'Đã xoá feedback' };
  }
}
