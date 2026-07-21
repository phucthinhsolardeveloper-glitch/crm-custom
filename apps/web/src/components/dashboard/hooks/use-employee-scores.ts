'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api-client';
import { type DashboardRange, rangeToApiQuery } from '../constants';

export interface EmployeeScoreRaw {
  userId: string;
  name: string;
  deptName: string;
  deptId: string | null;
  leadsAssigned: number;
  leadsConverted: number;
  revenue: number;
  overdueTasks: number;
  agingLeads7d: number;
  tasksTotal: number;
  tasksCompleted: number;
  /** Số đơn user tạo trong kỳ */
  ordersCount: number;
  /** Số sản phẩm (count orders có product_id) */
  productsCount: number;
  /** Lead assigned chưa có activity nào (note/call/order) */
  untouchedLeads: number;
  /** Lượt tương tác: 1 lead × 1 ngày có note hoặc đổi nhãn = 1 lượt */
  interactions: number;
  /** Doanh thu thuần = revenue - VAT (tính trong SQL vì mỗi order có vatRate khác nhau) */
  netRevenue: number;
}

export interface EmployeeScorecard extends EmployeeScoreRaw {
  /** Weighted score 0-100 */
  score: number;
  /** Conversion rate % */
  conversionRate: number;
  /** Task completion rate % */
  taskCompletionRate: number;
  /** Difference vs department average score */
  vsDeptAvg: number;
}

// Score weights - adjustable without deploy
const WEIGHTS = {
  conversion: 0.4,
  revenue: 0.3,
  aging: 0.2,
  tasks: 0.1,
};

/** Compute weighted score (0-100) from raw metrics */
function computeScore(emp: EmployeeScoreRaw, maxRevenue: number): number {
  // Conversion score: conversion rate * 100 (capped at 100)
  const convRate = emp.leadsAssigned > 0 ? emp.leadsConverted / emp.leadsAssigned : 0;
  const convScore = Math.min(convRate * 200, 100); // 50% conv = 100 score

  // Revenue score: relative to max performer
  const revScore = maxRevenue > 0 ? (emp.revenue / maxRevenue) * 100 : 0;

  // Aging score: penalize for aging leads (inverse - 0 aging = 100)
  const totalActive = emp.leadsAssigned - emp.leadsConverted;
  const agingRatio = totalActive > 0 ? emp.agingLeads7d / totalActive : 0;
  const agingScore = Math.max(0, (1 - agingRatio) * 100);

  // Task completion score
  const taskScore = emp.tasksTotal > 0 ? (emp.tasksCompleted / emp.tasksTotal) * 100 : 100;

  return Math.round(
    convScore * WEIGHTS.conversion +
    revScore * WEIGHTS.revenue +
    agingScore * WEIGHTS.aging +
    taskScore * WEIGHTS.tasks,
  );
}

export function useEmployeeScores(range: DashboardRange, deptIds?: string[], enabled: boolean = true) {
  const [employees, setEmployees] = useState<EmployeeScorecard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      const { from, to } = rangeToApiQuery(range);
      const deptParam = deptIds?.length ? `&deptIds=${deptIds.join(',')}` : '';

      try {
        const res = await api.get<{ data: EmployeeScoreRaw[] }>(
          `/dashboard/employee-scores?from=${from}&to=${to}${deptParam}`,
          { signal: controller.signal },
        );

        if (controller.signal.aborted) return;
        const raw = res.data || [];
        const maxRevenue = Math.max(...raw.map(e => e.revenue), 1);

        // Compute scores
        const scored: EmployeeScorecard[] = raw.map(emp => {
          const score = computeScore(emp, maxRevenue);
          const conversionRate = emp.leadsAssigned > 0
            ? Math.round((emp.leadsConverted / emp.leadsAssigned) * 100)
            : 0;
          const taskCompletionRate = emp.tasksTotal > 0
            ? Math.round((emp.tasksCompleted / emp.tasksTotal) * 100)
            : 100;
          return { ...emp, score, conversionRate, taskCompletionRate, vsDeptAvg: 0 };
        });

        // Compute dept averages and vs-dept comparison
        const deptAvgs = new Map<string, number>();
        const deptCounts = new Map<string, number>();
        for (const e of scored) {
          const key = e.deptId || '_none';
          deptAvgs.set(key, (deptAvgs.get(key) || 0) + e.score);
          deptCounts.set(key, (deptCounts.get(key) || 0) + 1);
        }
        for (const e of scored) {
          const key = e.deptId || '_none';
          const avg = (deptAvgs.get(key) || 0) / (deptCounts.get(key) || 1);
          e.vsDeptAvg = Math.round(e.score - avg);
        }

        // Sort by score DESC
        scored.sort((a, b) => b.score - a.score);
        setEmployees(scored);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu nhân viên');
      }
      setLoading(false);
    };

    fetchData();
    return () => controller.abort();
    // range object - depend primitive fields.
  }, [range.from, range.to, range.preset, deptIds?.join(','), enabled]);

  return { employees, loading, error };
}
