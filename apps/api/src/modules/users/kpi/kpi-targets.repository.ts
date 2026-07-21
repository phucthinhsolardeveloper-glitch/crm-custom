import { Injectable } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { UpsertKpiTargetsDto } from './dto/upsert-kpi-targets.dto';

const KPI_FIELDS = [
  'targetYearly',
  'targetJan', 'targetFeb', 'targetMar', 'targetApr',
  'targetMay', 'targetJun', 'targetJul', 'targetAug',
  'targetSep', 'targetOct', 'targetNov', 'targetDec',
] as const;

/**
 * Thin wrapper trên prisma.userKpiTarget - không chứa business logic.
 * Service gọi vào đây cho 4 op: findOne / findByUser / upsert / remove.
 */
@Injectable()
export class KpiTargetsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findOne(userId: bigint, year: number) {
    return this.prisma.userKpiTarget.findUnique({
      where: { userId_year: { userId, year } },
    });
  }

  findByUser(userId: bigint) {
    return this.prisma.userKpiTarget.findMany({
      where: { userId },
      select: { year: true, targetYearly: true },
      orderBy: { year: 'desc' },
    });
  }

  upsert(userId: bigint, year: number, dto: UpsertKpiTargetsDto, createdBy: bigint) {
    const data: Prisma.UserKpiTargetUncheckedCreateInput = {
      userId,
      year,
      createdBy,
    };
    // Chỉ copy field client gửi - undefined giữ NULL (chưa set).
    for (const field of KPI_FIELDS) {
      const value = dto[field];
      if (value !== undefined) {
        data[field] = new Prisma.Decimal(value);
      }
    }

    const updateData: Prisma.UserKpiTargetUncheckedUpdateInput = {};
    for (const field of KPI_FIELDS) {
      const value = dto[field];
      if (value !== undefined) {
        updateData[field] = new Prisma.Decimal(value);
      }
    }

    return this.prisma.userKpiTarget.upsert({
      where: { userId_year: { userId, year } },
      create: data,
      update: updateData,
    });
  }

  remove(userId: bigint, year: number) {
    return this.prisma.userKpiTarget.delete({
      where: { userId_year: { userId, year } },
    });
  }
}
