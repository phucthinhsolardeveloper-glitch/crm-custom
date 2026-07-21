import { Controller, Get, Post, Delete, Param, Query, Body, Req, HttpCode } from '@nestjs/common';
import type { Request } from 'express';
import { NotificationsService } from './notifications.service';
import { PushSubscriptionsService } from './push/push-subscriptions.service';
import { WebPushSenderService } from './push/web-push-sender.service';
import { SubscribePushDto, UnsubscribePushDto } from './push/dto/push-subscription.dto';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly service: NotificationsService,
    private readonly pushSubscriptions: PushSubscriptionsService,
    private readonly webPushSender: WebPushSenderService,
  ) {}

  // ─── Web Push: mọi user đã đăng nhập tự đăng ký push cho thiết bị của mình ───

  /** Trả khoá VAPID public để frontend tạo subscription. */
  @Get('push/vapid-public-key')
  getVapidPublicKey() {
    return { data: { publicKey: this.webPushSender.vapidPublicKey } };
  }

  /** Lưu subscription của thiết bị hiện tại (userId lấy từ JWT, KHÔNG từ body). */
  @Post('push/subscribe')
  @HttpCode(200)
  async subscribePush(@CurrentUser() user: any, @Body() dto: SubscribePushDto, @Req() req: Request) {
    const userAgent = req.headers['user-agent']?.slice(0, 255);
    await this.pushSubscriptions.subscribe(user.id, dto, userAgent);
    return { data: { message: 'Đã bật thông báo đẩy' } };
  }

  /** Xoá subscription của thiết bị hiện tại. */
  @Post('push/unsubscribe')
  @HttpCode(200)
  async unsubscribePush(@CurrentUser() user: any, @Body() dto: UnsubscribePushDto) {
    await this.pushSubscriptions.unsubscribe(user.id, dto.endpoint);
    return { data: { message: 'Đã tắt thông báo đẩy' } };
  }

  @Get()
  async list(@CurrentUser() user: any, @Query('limit') limit?: number, @Query('cursor') cursor?: string) {
    return this.service.list(user.id, limit ?? 20, cursor);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: any) {
    const count = await this.service.unreadCount(user.id);
    return { data: { count } };
  }

  @Post(':id/read')
  @HttpCode(200)
  async markAsRead(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    await this.service.markAsRead(id, user.id);
    return { data: { message: 'Đã đọc' } };
  }

  @Post('read-all')
  @HttpCode(200)
  async markAllAsRead(@CurrentUser() user: any) {
    await this.service.markAllAsRead(user.id);
    return { data: { message: 'Đã đọc tất cả' } };
  }

  @Delete('read')
  @HttpCode(200)
  async deleteRead(@CurrentUser() user: any) {
    const result = await this.service.deleteRead(user.id);
    return { data: { deleted: result.count, message: 'Đã xoá thông báo đã đọc' } };
  }
}
