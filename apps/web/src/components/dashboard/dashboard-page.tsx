'use client';

import { useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { type DashboardRange, getDefaultRange } from './constants';
import { useDashboardStats } from './hooks/use-dashboard-stats';
import { useNewVsReturning } from './hooks/use-new-vs-returning';
import { useSourceQuality } from './hooks/use-source-quality';
import { useProductPaymentBlocks } from './hooks/use-product-payment-blocks';
import { useTierBlock } from './hooks/use-tier-block';
import { useExtensionBlock } from './hooks/use-extension-block';
import { useEmployeeScores } from './hooks/use-employee-scores';
import { DashboardHeader } from './dashboard-header';
import { DashboardKpiSection } from './dashboard-kpi-section';
import { DashboardMainCharts } from './dashboard-main-charts';
import { BlockSectionLabel } from './blocks/block-section-label';
import { SourceQualityTable } from './widgets/source-quality-table';
import { ProductBlock } from './blocks/product-block';
import { PaymentBlock } from './blocks/payment-block';
import { TierBlock } from './blocks/tier-block';
import { ExtensionBlock } from './blocks/extension-block';

/**
 * Dashboard "Tổng quát" - Layout:
 *  1. Header (range picker)
 *  2. KPI row 5 cards + tooltip giải thích chỉ số
 *  3. Revenue area chart + funnel phân bố leads
 *  4. (admin) 5 analytics blocks: Nguồn lead / Sản phẩm / Thanh toán / Hạng khách / Lát cắt mở rộng
 *
 *  USER role: chỉ thấy 1-3.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'MANAGER';

  const [range, setRange] = useState<DashboardRange>(getDefaultRange);
  const { stats, prevStats, funnel, revenue, loading, error } = useDashboardStats(range);
  const newVsReturning = useNewVsReturning(range);
  const sourceQuality = useSourceQuality(range, isAdmin);
  const blocks = useProductPaymentBlocks(range, isAdmin);
  const tierBlock = useTierBlock(range, isAdmin);
  const extension = useExtensionBlock(range, isAdmin);
  const employeeScores = useEmployeeScores(range, undefined, isAdmin);

  return (
    <div className="space-y-6">
      <DashboardHeader
        isAdmin={isAdmin}
        range={range}
        onRangeChange={setRange}
        title={isAdmin ? 'Tổng quát + Cash Flow' : 'Tổng quát'}
        subtitle={isAdmin ? 'Tổng hợp hiệu suất + phân tích theo khối' : 'Thống kê cá nhân'}
        gradient={isAdmin}
      />
      <DashboardKpiSection
        stats={stats}
        prevStats={prevStats}
        newVsReturning={newVsReturning.data}
        loading={loading}
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <DashboardMainCharts revenue={revenue} funnel={funnel} loading={loading} />

      {isAdmin && (
        <>
          <section className="space-y-3">
            <BlockSectionLabel index={1} title="Nguồn lead" question="Camp nào ra số, camp nào đốt tiền?" />
            <SourceQualityTable items={sourceQuality.items} loading={sourceQuality.loading} />
          </section>

          <ProductBlock
            byProduct={blocks.byProduct}
            byProductGroup={blocks.byProductGroup}
            byOrderFormat={blocks.byOrderFormat}
            loading={blocks.loading}
          />

          <PaymentBlock
            byPaymentType={blocks.byPaymentType}
            byBankAccount={blocks.byBankAccount}
            receivables={blocks.receivables}
            loading={blocks.loading}
          />

          <TierBlock
            distribution={tierBlock.distribution}
            movement={tierBlock.movement}
            loading={tierBlock.loading}
          />

          <ExtensionBlock
            employees={employeeScores.employees}
            employeesLoading={employeeScores.loading}
            byHour={extension.byHour}
            aging={extension.aging}
            loading={extension.loading}
          />
        </>
      )}
    </div>
  );
}
