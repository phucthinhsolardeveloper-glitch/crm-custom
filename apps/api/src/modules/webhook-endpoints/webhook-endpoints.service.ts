import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

/**
 * Quan ly webhook endpoints: tao slug + secret cho 3rd party (OmiCall, ...) gui webhook vao.
 * Secret chi tra ve 1 lan khi tao (luu hash SHA-256 trong DB).
 */
@Injectable()
export class WebhookEndpointsService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Tao endpoint moi. Tra ve plaintext secret 1 lan duy nhat. */
  async create(name: string, createdBy: bigint) {
    // Slug 8 ky tu hex - du chong brute (2^32 combinations) cho internal use
    const slug = randomBytes(4).toString('hex');
    const rawSecret = `wh_${randomBytes(24).toString('hex')}`;
    const secretHash = createHash('sha256').update(rawSecret).digest('hex');
    const secretPrefix = rawSecret.substring(0, 12);

    const endpoint = await this.prisma.webhookEndpoint.create({
      data: { name, slug, secretHash, secretPrefix, createdBy },
      select: {
        id: true, name: true, slug: true, secretPrefix: true,
        isActive: true, createdAt: true,
      },
    });

    return { ...endpoint, secret: rawSecret };
  }

  async list() {
    return this.prisma.webhookEndpoint.findMany({
      where: { deletedAt: null },
      select: {
        id: true, name: true, slug: true, secretPrefix: true,
        isActive: true, lastTriggeredAt: true, triggerCount: true,
        createdAt: true,
        creator: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deactivate(id: bigint) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({ where: { id, deletedAt: null } });
    if (!endpoint) throw new NotFoundException('Khong tim thay webhook');
    return this.prisma.webhookEndpoint.update({ where: { id }, data: { isActive: false } });
  }

  async activate(id: bigint) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({ where: { id, deletedAt: null } });
    if (!endpoint) throw new NotFoundException('Khong tim thay webhook');
    return this.prisma.webhookEndpoint.update({ where: { id }, data: { isActive: true } });
  }

  async remove(id: bigint) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({ where: { id, deletedAt: null } });
    if (!endpoint) throw new NotFoundException('Khong tim thay webhook');
    // Soft-delete + deactivate
    return this.prisma.webhookEndpoint.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  /**
   * Tim endpoint theo slug + verify secret (timing-safe).
   * Dung boi DynamicWebhookGuard.
   * Tra ve null neu khong khop hoac bi vo hieu.
   */
  async findAndVerify(slug: string, rawSecret: string): Promise<{ id: bigint } | null> {
    if (!slug || !rawSecret) return null;
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { slug, isActive: true, deletedAt: null },
      select: { id: true, secretHash: true },
    });
    if (!endpoint) return null;

    const incomingHash = createHash('sha256').update(rawSecret).digest('hex');
    // Timing-safe compare voi 2 buffer cung do dai (sha256 = 64 hex chars)
    if (incomingHash.length !== endpoint.secretHash.length) return null;
    let diff = 0;
    for (let i = 0; i < incomingHash.length; i++) {
      diff |= incomingHash.charCodeAt(i) ^ endpoint.secretHash.charCodeAt(i);
    }
    if (diff !== 0) return null;

    return { id: endpoint.id };
  }

  /** Update audit stats sau khi webhook trigger thanh cong (fire-and-forget). */
  async recordTrigger(id: bigint) {
    this.prisma.webhookEndpoint.update({
      where: { id },
      data: { lastTriggeredAt: new Date(), triggerCount: { increment: 1 } },
    }).catch(() => {});
  }
}
