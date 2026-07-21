import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as webpush from 'web-push';
import { PushSubscriptionsService } from './push-subscriptions.service';

/** Nội dung 1 lần đẩy push (service worker phía web đọc đúng các field này). */
export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
}

/**
 * Gửi Web Push qua thư viện web-push (chuẩn VAPID).
 * Bật/tắt theo env: thiếu VAPID keys -> tự disable, KHÔNG block CRM (chuông in-app vẫn chạy).
 */
@Injectable()
export class WebPushSenderService implements OnModuleInit {
  private readonly logger = new Logger(WebPushSenderService.name);
  private enabled = false;

  constructor(private readonly subscriptions: PushSubscriptionsService) {}

  onModuleInit() {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
    if (!publicKey || !privateKey) {
      this.logger.warn('VAPID keys chưa cấu hình -> Web Push tắt (chuông in-app vẫn hoạt động).');
      return;
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.enabled = true;
    this.logger.log('Web Push đã bật (VAPID configured).');
  }

  /** Khoá public cho frontend đăng ký (null nếu chưa cấu hình). */
  get vapidPublicKey(): string | null {
    return process.env.VAPID_PUBLIC_KEY || null;
  }

  /**
   * Đẩy push tới mọi thiết bị của 1 user.
   * Fire-and-forget: lỗi push KHÔNG được làm hỏng luồng tạo notification.
   * Subscription chết (404/410 Gone) -> tự dọn khỏi DB.
   */
  async sendToUser(userId: bigint, payload: PushPayload): Promise<void> {
    if (!this.enabled) return;
    let subs: Awaited<ReturnType<PushSubscriptionsService['findByUser']>>;
    try {
      subs = await this.subscriptions.findByUser(userId);
    } catch (err) {
      this.logger.error(`Lỗi đọc subscription user ${userId}: ${err}`);
      return;
    }
    await this.dispatch(subs, payload);
  }

  /**
   * Đẩy push tới nhiều user trong 1 lần đọc DB (broadcast). Tránh N+1 query khi user đông.
   * Vẫn fire-and-forget: lỗi không làm hỏng luồng nghiệp vụ.
   */
  async sendToUsers(userIds: bigint[], payload: PushPayload): Promise<void> {
    if (!this.enabled || userIds.length === 0) return;
    let subs: Awaited<ReturnType<PushSubscriptionsService['findByUsers']>>;
    try {
      subs = await this.subscriptions.findByUsers(userIds);
    } catch (err) {
      this.logger.error(`Lỗi đọc subscription broadcast (${userIds.length} user): ${err}`);
      return;
    }
    await this.dispatch(subs, payload);
  }

  /** Gửi payload tới danh sách subscription đã đọc sẵn. */
  private async dispatch(
    subs: Array<{ endpoint: string; p256dh: string; auth: string }>,
    payload: PushPayload,
  ): Promise<void> {
    if (subs.length === 0) return;
    const data = JSON.stringify({
      title: payload.title,
      body: payload.body ?? '',
      url: payload.url ?? '/',
    });
    await Promise.all(subs.map((s) => this.sendOne(s, data)));
  }

  private async sendOne(
    sub: { endpoint: string; p256dh: string; auth: string },
    data: string,
  ): Promise<void> {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        data,
      );
    } catch (err) {
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        // Subscription chết -> dọn dẹp, không log ồn ào
        await this.subscriptions.deleteByEndpoint(sub.endpoint).catch(() => {});
        this.logger.debug(`Đã xoá subscription chết: ${sub.endpoint}`);
      } else {
        const msg = (err as { message?: string })?.message ?? String(err);
        this.logger.warn(`Lỗi gửi push (${status ?? 'unknown'}): ${msg}`);
      }
    }
  }
}
