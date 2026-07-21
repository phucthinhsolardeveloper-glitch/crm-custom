import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Create new API key. Returns plaintext key ONCE. */
  async create(name: string, createdBy: bigint, permissions: string[] = ['leads:create'], expiresAt?: Date) {
    const rawKey = `crm_${randomBytes(24).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 12);

    const apiKey = await this.prisma.apiKey.create({
      data: { name, keyHash, keyPrefix, permissions, createdBy, expiresAt },
      select: { id: true, name: true, keyPrefix: true, permissions: true, isActive: true, createdAt: true, expiresAt: true },
    });

    // Return plaintext key only on creation
    return { ...apiKey, key: rawKey };
  }

  async list() {
    return this.prisma.apiKey.findMany({
      select: {
        id: true, name: true, keyPrefix: true, permissions: true,
        isActive: true, lastUsedAt: true, createdAt: true, expiresAt: true,
        creator: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deactivate(id: bigint) {
    const key = await this.prisma.apiKey.findFirst({ where: { id } });
    if (!key) throw new NotFoundException('Không tìm thấy API key');
    return this.prisma.apiKey.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async activate(id: bigint) {
    return this.prisma.apiKey.update({ where: { id }, data: { isActive: true } });
  }

  async remove(id: bigint) {
    const key = await this.prisma.apiKey.findFirst({ where: { id } });
    if (!key) throw new NotFoundException('Không tìm thấy API key');
    return this.prisma.apiKey.delete({ where: { id } });
  }
}
