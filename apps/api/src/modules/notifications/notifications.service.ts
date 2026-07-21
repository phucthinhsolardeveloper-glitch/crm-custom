import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaClient, Prisma, EntityType } from '@prisma/client';
import { CronRunService } from '../cron-run/cron-run.service';
import { WebPushSenderService } from './push/web-push-sender.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly cronRunService: CronRunService,
    private readonly webPushSender: WebPushSenderService,
  ) {}

  /**
   * Suy ra link deep-link cho push từ type/entity (mirror logic getNotificationUrl phía web).
   * Giữ map tối giản: thiếu thì về '/' (mở app, user bấm chuông xem chi tiết).
   */
  private buildPushUrl(type: string, entityType?: EntityType | null, entityId?: bigint | null): string {
    if (type === 'CALL_FEEDBACK' && entityId) return `/call-logs?callId=${entityId}`;
    if (!entityType || !entityId) return '/';
    switch (entityType) {
      case 'LEAD': return `/leads/${entityId}`;
      case 'CUSTOMER': return `/customers/${entityId}`;
      case 'ORDER': return `/orders/${entityId}`;
      default: return '/';
    }
  }

  async list(userId: bigint, limit = 20, cursor?: string) {
    const take = limit + 1;
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
      ...(cursor ? { skip: 1, cursor: { id: BigInt(cursor) } } : {}),
    });

    const hasMore = notifications.length > limit;
    const data = hasMore ? notifications.slice(0, limit) : notifications;
    return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
  }

  async unreadCount(userId: bigint) {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }

  async markAsRead(id: bigint, userId: bigint) {
    const notification = await this.prisma.notification.findFirst({ where: { id } });
    if (!notification) throw new NotFoundException('Không tìm thấy thông báo');
    if (notification.userId !== userId) throw new ForbiddenException('Không có quyền đọc thông báo này');
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: bigint) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  /** Xoá tất cả thông báo đã đọc của user (hard delete). */
  async deleteRead(userId: bigint) {
    return this.prisma.notification.deleteMany({
      where: { userId, isRead: true },
    });
  }

  /** Create notification (called by other services). */
  async create(userId: bigint, title: string, content?: string, type = 'SYSTEM', entityType?: EntityType, entityId?: bigint) {
    const notification = await this.prisma.notification.create({
      data: { userId, title, content, type, entityType, entityId },
    });
    // Đẩy Web Push (fire-and-forget): KHÔNG await chặn, lỗi push không làm hỏng tạo notification.
    void this.webPushSender
      .sendToUser(userId, { title, body: content, url: this.buildPushUrl(type, entityType, entityId) })
      .catch((err) => this.logger.warn(`Đẩy push thất bại (notification ${notification.id}): ${err}`));
    return notification;
  }

  /**
   * Broadcast 1 thông báo tới mọi user đang hoạt động (status ACTIVE, chưa xoá).
   * Dùng cho sự kiện toàn hệ thống (vd: sản phẩm mới, dừng/mở bán).
   * entityType bỏ qua khi enum chưa có loại tương ứng - chỉ lưu entityId tham chiếu.
   */
  async createForAllUsers(title: string, content?: string, type = 'SYSTEM', entityId?: bigint) {
    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    if (users.length === 0) return { count: 0 };
    const result = await this.prisma.notification.createMany({
      data: users.map((u) => ({ userId: u.id, title, content, type, entityId })),
    });
    // Đẩy Web Push broadcast (fire-and-forget, 1 query đọc subscription). entityType không có -> url '/'.
    const url = this.buildPushUrl(type, null, entityId);
    void this.webPushSender
      .sendToUsers(users.map((u) => u.id), { title, body: content, url })
      .catch((err) => this.logger.warn(`Đẩy push broadcast thất bại: ${err}`));
    return result;
  }

  /** Cron: delete notifications older than 90 days. Runs daily at 3 AM. */
  @Cron('0 3 * * *')
  async cleanupOldNotifications() {
    try {
      await this.cronRunService.track('notification-cleanup', async (ctx) => {
        const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const result = await this.prisma.notification.deleteMany({
          where: { createdAt: { lt: cutoff } },
        });
        ctx.affected = result.count;
        ctx.metadata = { cutoff: cutoff.toISOString(), retentionDays: 90 };
        if (result.count > 0) {
          this.logger.log(`Đã xóa ${result.count} thông báo cũ (>90 ngày)`);
        }
      });
    } catch (error) {
      this.logger.error('Lỗi cleanup thông báo:', error);
    }
  }
}
