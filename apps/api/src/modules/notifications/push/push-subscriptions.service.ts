import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/** Dữ liệu subscription trình duyệt gửi lên khi user bật push. */
export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Host hợp lệ của các nhà cung cấp push (chống SSRF: server sẽ POST tới endpoint này).
 * Chỉ chấp nhận https + host khớp đúng hoặc là subdomain của 1 trong các suffix dưới đây.
 */
const ALLOWED_PUSH_HOST_SUFFIXES = [
  'fcm.googleapis.com', // Chrome / Android (FCM)
  'push.services.mozilla.com', // Firefox
  'notify.windows.com', // Edge / Windows (WNS)
  'push.apple.com', // Safari / iOS
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return ALLOWED_PUSH_HOST_SUFFIXES.some((s) => host === s || host.endsWith('.' + s));
}

/**
 * Lưu/xoá "địa chỉ hộp thư đẩy" của từng thiết bị.
 * Subscription luôn thuộc về userId của chính người đăng nhập (lấy từ JWT, KHÔNG nhận từ body).
 */
@Injectable()
export class PushSubscriptionsService {
  private readonly logger = new Logger(PushSubscriptionsService.name);

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Lưu (hoặc cập nhật) subscription. endpoint là duy nhất cho mỗi thiết bị+trình duyệt
   * -> upsert theo endpoint: nếu thiết bị đã đăng ký thì gán lại cho user đang đăng nhập.
   */
  async subscribe(userId: bigint, input: PushSubscriptionInput, userAgent?: string) {
    const { endpoint, keys } = input;
    // Chống SSRF: chỉ lưu endpoint trỏ tới nhà cung cấp push hợp lệ (https + host allowlist).
    if (!isAllowedPushEndpoint(endpoint)) {
      throw new BadRequestException('Endpoint thông báo đẩy không hợp lệ');
    }
    return this.prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
      update: { userId, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    });
  }

  /** Xoá subscription theo endpoint - chỉ xoá của chính user (chống xoá nhầm thiết bị người khác). */
  async unsubscribe(userId: bigint, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
    return { success: true };
  }

  /** Lấy mọi subscription của 1 user để gửi push tới tất cả thiết bị. */
  async findByUser(userId: bigint) {
    return this.prisma.pushSubscription.findMany({ where: { userId } });
  }

  /** Lấy subscription của nhiều user trong 1 query (dùng cho broadcast, tránh N+1). */
  async findByUsers(userIds: bigint[]) {
    if (userIds.length === 0) return [];
    return this.prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  }

  /** Xoá 1 subscription chết (provider trả 404/410 Gone). */
  async deleteByEndpoint(endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint } });
  }
}
