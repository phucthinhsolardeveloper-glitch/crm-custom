'use client';

import { DeptComparisonCard } from './dept-comparison-card';
import { ChartCard } from '../widgets/chart-card';
import type { DeptComparisonItem } from '../constants';

interface DeptComparisonGridProps {
  data: DeptComparisonItem[];
  loading: boolean;
}

export function DeptComparisonGrid({ data, loading }: DeptComparisonGridProps) {
  if (loading) {
    return (
      <ChartCard title="So sánh phòng ban">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-[220px] animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      </ChartCard>
    );
  }

  if (data.length === 0) {
    return (
      <ChartCard title="So sánh phòng ban">
        <p className="py-12 text-center text-sm text-slate-400">Chưa có dữ liệu phòng ban</p>
      </ChartCard>
    );
  }

  // Đã sort revenue DESC từ backend - phòng đầu tiên là winner
  const winnerId = data[0]?.deptId;

  return (
    <ChartCard title="So sánh phòng ban">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.map(dept => (
          <DeptComparisonCard key={dept.deptId} dept={dept} isWinner={dept.deptId === winnerId} />
        ))}
      </div>
    </ChartCard>
  );
}
