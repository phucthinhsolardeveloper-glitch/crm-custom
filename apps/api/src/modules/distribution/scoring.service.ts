import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

interface UserScore {
  userId: bigint;
  score: number;
  breakdown: { workload: number; level: number; performance: number };
}

/**
 * Weighted scoring algorithm for auto lead distribution.
 * Factors: workload (30%), employee level (30%), conversion rate (40%).
 */
@Injectable()
export class ScoringService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Score all active users in a department for lead assignment. */
  async scoreUsers(departmentId: bigint, weights?: { workload: number; level: number; performance: number }): Promise<UserScore[]> {
    const w = weights || { workload: 30, level: 30, performance: 40 };

    // Get active users in department
    const users = await this.prisma.user.findMany({
      where: { departmentId, status: 'ACTIVE', deletedAt: null, role: 'USER' },
      select: { id: true, employeeLevelId: true },
    });

    if (users.length === 0) return [];
    const userIds = users.map(u => u.id);

    // Batch: employee levels for rank
    const levels = await this.prisma.employeeLevel.findMany({ select: { id: true, rank: true } });
    const levelMap = new Map(levels.map((l) => [l.id.toString(), l.rank]));
    const maxRank = Math.max(...levels.map((l) => l.rank), 1);

    // Batch: workload counts (single groupBy instead of N queries)
    const workloadGroups = await this.prisma.lead.groupBy({
      by: ['assignedUserId'],
      where: { assignedUserId: { in: userIds }, status: { in: ['ASSIGNED', 'IN_PROGRESS'] }, deletedAt: null },
      _count: true,
    });
    const workloadMap = new Map(workloadGroups.map(g => [g.assignedUserId!.toString(), g._count]));
    const maxWorkload = Math.max(...workloadGroups.map(g => g._count), 1);

    // Batch: conversion rates (last 90 days) - 2 queries total instead of 2-3 per user
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Count distinct leads assigned to each user via history
    const historyGroups = await this.prisma.assignmentHistory.groupBy({
      by: ['toUserId'],
      where: { toUserId: { in: userIds }, entityType: 'LEAD', createdAt: { gte: since } },
      _count: { entityId: true },
    });
    const historyCountMap = new Map(historyGroups.map(g => [g.toUserId!.toString(), g._count.entityId]));

    // Get all assignment history entity IDs for converted lead count
    const allHistoryLeads = await this.prisma.assignmentHistory.findMany({
      where: { toUserId: { in: userIds }, entityType: 'LEAD', createdAt: { gte: since } },
      select: { toUserId: true, entityId: true },
      distinct: ['toUserId', 'entityId'],
    });

    // Group by user and check conversion status in batch
    const userLeadIds = new Map<string, bigint[]>();
    for (const h of allHistoryLeads) {
      const key = h.toUserId!.toString();
      if (!userLeadIds.has(key)) userLeadIds.set(key, []);
      userLeadIds.get(key)!.push(h.entityId);
    }

    // Count converted leads for all users in one query
    const allLeadIds = allHistoryLeads.map(h => h.entityId);
    const convertedLeads = allLeadIds.length > 0
      ? await this.prisma.lead.findMany({
          where: { id: { in: allLeadIds }, status: 'CONVERTED', deletedAt: null },
          select: { id: true },
        })
      : [];
    const convertedSet = new Set(convertedLeads.map(l => l.id.toString()));

    // Calculate scores using Maps (O(1) lookup instead of Array.find O(n))
    return users.map((u) => {
      const uid = u.id.toString();
      const workloadCount = workloadMap.get(uid) || 0;
      const levelRank = u.employeeLevelId ? (levelMap.get(u.employeeLevelId.toString()) || 1) : 1;

      // Conversion rate from history
      const assignedLeadIds = userLeadIds.get(uid) || [];
      const totalAssigned = assignedLeadIds.length || (historyCountMap.get(uid) || 0);
      const convertedCount = assignedLeadIds.filter(id => convertedSet.has(id.toString())).length;
      const conversionRate = totalAssigned > 0 ? convertedCount / totalAssigned : 0;

      // Normalize: higher = better
      const workloadScore = (1 - workloadCount / maxWorkload) * w.workload;
      const levelScore = (levelRank / maxRank) * w.level;
      const perfScore = conversionRate * w.performance;
      const total = workloadScore + levelScore + perfScore;

      return {
        userId: u.id,
        score: Math.round(total * 100) / 100,
        breakdown: { workload: workloadScore, level: levelScore, performance: perfScore },
      };
    }).sort((a, b) => b.score - a.score);
  }

  /** Pick best user for assignment. */
  async pickBestUser(departmentId: bigint): Promise<bigint | null> {
    // Load config
    const config = await this.prisma.aiDistributionConfig.findUnique({
      where: { departmentId },
    });
    if (!config?.isActive) return null;

    const weights = config.weightConfig as any;
    const scores = await this.scoreUsers(departmentId, weights);
    return scores.length > 0 ? scores[0].userId : null;
  }
}
