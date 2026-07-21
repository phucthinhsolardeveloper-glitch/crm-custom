import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaClient, EntityType } from '@prisma/client';
import { NotificationsService } from '../../notifications/notifications.service';

/**
 * Cron sinh nhật KH: 9h sáng UTC+7 mỗi ngày.
 * Gửi notification cho người phụ trách, thứ tự ưu tiên:
 *   1. customer.assigned_user_id
 *   2. assignment_history gần nhất (entity CUSTOMER)
 *   3. người giữ lead mới nhất liên kết customer (leads.customer_id) - nhiều
 *      customer tạo từ import/API không có assigned nhưng lead nguồn có chủ
 * khi customer có birthday rơi vào hôm nay hoặc sau 3 ngày.
 *
 * Idempotent trong ngày: dùng `metadata.birthdayNotifiedAt = YYYY-MM-DD` để cron chạy
 * 2 lần cùng ngày không gửi trùng.
 *
 * Edge cases handled:
 *  - Customer không có assigned + không có history → skip + log 'no_assignee'
 *  - 29/02 trong năm thường → không match (trade-off acceptable, có thể fix sau)
 *  - Recipient là user deactivated → vẫn tạo notification (không login sẽ không thấy)
 */
@Injectable()
export class CustomerBirthdayCron {
  private readonly logger = new Logger(CustomerBirthdayCron.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 9 * * *', { timeZone: 'Asia/Ho_Chi_Minh', name: 'customer-birthday-reminder' })
  async sendBirthdayReminders(): Promise<{ sent: number; skipped: number; total: number }> {
    const rows = await this.prisma.$queryRaw<Array<{
      customer_id: bigint;
      customer_name: string;
      birthday: Date;
      tier_name: string | null;
      recipient_user_id: bigint | null;
      days_until: number;
    }>>`
      SELECT
        c.id AS customer_id,
        c.name AS customer_name,
        c.birthday,
        t.name AS tier_name,
        COALESCE(c.assigned_user_id, latest.to_user_id, latest_lead.assigned_user_id) AS recipient_user_id,
        CASE
          WHEN EXTRACT(MONTH FROM c.birthday) = EXTRACT(MONTH FROM CURRENT_DATE)
           AND EXTRACT(DAY FROM c.birthday) = EXTRACT(DAY FROM CURRENT_DATE) THEN 0
          ELSE 3
        END AS days_until
      FROM customers c
      LEFT JOIN customer_tiers t ON t.id = c.current_tier_id
      LEFT JOIN LATERAL (
        SELECT to_user_id
        FROM assignment_history
        WHERE entity_type = 'CUSTOMER' AND entity_id = c.id AND to_user_id IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1
      ) latest ON true
      LEFT JOIN LATERAL (
        SELECT assigned_user_id
        FROM leads
        WHERE customer_id = c.id AND assigned_user_id IS NOT NULL AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      ) latest_lead ON true
      WHERE c.deleted_at IS NULL
        AND c.birthday IS NOT NULL
        AND (
          (EXTRACT(MONTH FROM c.birthday) = EXTRACT(MONTH FROM CURRENT_DATE)
           AND EXTRACT(DAY FROM c.birthday) = EXTRACT(DAY FROM CURRENT_DATE))
          OR
          (EXTRACT(MONTH FROM c.birthday) = EXTRACT(MONTH FROM CURRENT_DATE + INTERVAL '3 days')
           AND EXTRACT(DAY FROM c.birthday) = EXTRACT(DAY FROM CURRENT_DATE + INTERVAL '3 days'))
        )
        AND COALESCE(c.metadata->>'birthdayNotifiedAt', '') <> TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD');
    `;

    let sent = 0;
    let skipped = 0;

    for (const r of rows) {
      if (!r.recipient_user_id) {
        skipped++;
        this.logger.warn(
          { customerId: r.customer_id.toString() },
          'birthday-skip: no_assignee',
        );
        continue;
      }

      const title = Number(r.days_until) === 0
        ? 'Sinh nhật KH hôm nay'
        : 'Sinh nhật KH còn 3 ngày';
      const tierSuffix = r.tier_name ? ` (${r.tier_name})` : '';
      const bdayStr = r.birthday.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
      const content = `${r.customer_name}${tierSuffix} sinh nhật ${bdayStr}.`;

      await this.notifications.create(
        r.recipient_user_id,
        title,
        content,
        'CUSTOMER_BIRTHDAY',
        EntityType.CUSTOMER,
        r.customer_id,
      );

      // Idempotent trong ngày: mark đã gửi
      await this.prisma.$executeRaw`
        UPDATE customers
        SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{birthdayNotifiedAt}', to_jsonb(TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')))
        WHERE id = ${r.customer_id};
      `;
      sent++;
    }

    this.logger.log({ sent, skipped, total: rows.length }, 'birthday-cron-completed');
    return { sent, skipped, total: rows.length };
  }
}
