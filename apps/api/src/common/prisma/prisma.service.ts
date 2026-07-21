import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/** Lifecycle-only provider: not exported, but NestJS calls hooks on all providers */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly prisma: PrismaClient) {}

  async onModuleInit() {
    await (this.prisma as any).$connect();
  }

  async onModuleDestroy() {
    await (this.prisma as any).$disconnect();
  }
}
