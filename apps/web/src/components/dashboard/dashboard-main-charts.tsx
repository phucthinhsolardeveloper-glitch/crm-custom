'use client';

import { RevenueAreaCard } from './widgets/revenue-area-card';
import { LeadFunnelCard } from './widgets/lead-funnel-card';
import type { FunnelItem, RevenueDayItem } from './constants';

interface DashboardMainChartsProps {
  revenue: RevenueDayItem[];
  funnel: FunnelItem[];
  loading: boolean;
}

/**
 * Row 1: Revenue area (full-width)
 * Row 2: Funnel phân bố leads theo trạng thái (full-width).
 * Bảng "Nguồn lead" đã chuyển xuống Block 1 của chuỗi analytics blocks (admin).
 */
export function DashboardMainCharts({ revenue, funnel, loading }: DashboardMainChartsProps) {
  return (
    <div className="space-y-4">
      <RevenueAreaCard revenue={revenue} loading={loading} />
      <LeadFunnelCard funnel={funnel} loading={loading} />
    </div>
  );
}
