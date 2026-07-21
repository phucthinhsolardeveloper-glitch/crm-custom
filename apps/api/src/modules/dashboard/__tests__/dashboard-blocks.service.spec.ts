import { describe, expect, it, vi } from 'vitest';
import { DashboardBlocksService } from '../dashboard-blocks.service';

const FROM = new Date('2026-06-01T00:00:00Z');
const TO = new Date('2026-06-30T23:59:59Z');

/** Cache pass-through (luôn miss) + prisma mock - test logic thuần của service. */
function makeService() {
  const prisma = {
    $queryRaw: vi.fn(),
    customerTier: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const cache = { getOrSet: vi.fn((_k: string, _ttl: number, fn: () => unknown) => fn()) };
  const service = new DashboardBlocksService(prisma as never, cache as never);
  return { service, prisma };
}

describe('DashboardBlocksService.getSourceQuality', () => {
  it('map lead + revenue theo source, tinh returningPct / cvRate / revenuePerOrder', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw
      .mockResolvedValueOnce([
        { source_id: 1n, source_name: 'Facebook', leads: 100n, converted: 6n, returning: 20n },
        { source_id: null, source_name: 'Không rõ', leads: 10n, converted: 0n, returning: 0n },
      ])
      .mockResolvedValueOnce([
        { source_id: 1n, no_lead: false, revenue: 60_000_000n, order_count: 6n },
        { source_id: null, no_lead: true, revenue: 5_000_000n, order_count: 2n },
      ]);

    const items = await service.getSourceQuality(FROM, TO);

    const fb = items.find(i => i.source === 'Facebook')!;
    expect(fb.leads).toBe(100);
    expect(fb.returningPct).toBe(20);
    expect(fb.cvRate).toBe(6);
    expect(fb.revenue).toBe(60_000_000);
    expect(fb.revenuePerOrder).toBe(10_000_000);

    // Đơn không gắn lead -> dòng cảnh báo riêng, leads=0
    const noLead = items.find(i => i.source === 'Không gắn nguồn')!;
    expect(noLead.leads).toBe(0);
    expect(noLead.revenue).toBe(5_000_000);
  });

  it('gop nguon ngoai top 10 thanh "Khác"', async () => {
    const { service, prisma } = makeService();
    const leadRows = Array.from({ length: 12 }, (_, i) => ({
      source_id: BigInt(i + 1), source_name: `S${i + 1}`,
      leads: BigInt(100 - i), converted: 2n, returning: 0n,
    }));
    prisma.$queryRaw.mockResolvedValueOnce(leadRows).mockResolvedValueOnce([]);

    const items = await service.getSourceQuality(FROM, TO);
    expect(items).toHaveLength(11); // top 10 + Khác
    const other = items[10];
    expect(other.source).toBe('Khác');
    expect(other.leads).toBe(89 + 90); // S11 + S12
  });

  it('khong co lead trong ky -> mang rong', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    expect(await service.getSourceQuality(FROM, TO)).toEqual([]);
  });

  it('nguon co doanh thu nhung khong co lead moi trong ky -> van hien dong leads=0', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw
      .mockResolvedValueOnce([
        { source_id: 1n, source_name: 'Facebook', leads: 10n, converted: 1n, returning: 0n },
      ])
      .mockResolvedValueOnce([
        // Zalo: lead tạo TRƯỚC kỳ nhưng tiền verify TRONG kỳ - không được rơi mất
        { source_id: 2n, source_name: 'Zalo', no_lead: false, revenue: 8_000_000n, order_count: 1n },
      ]);

    const items = await service.getSourceQuality(FROM, TO);
    const zalo = items.find(i => i.source === 'Zalo')!;
    expect(zalo).toBeDefined();
    expect(zalo.leads).toBe(0);
    expect(zalo.revenue).toBe(8_000_000);
    // Tổng cột DT khớp tổng verified trong kỳ
    expect(items.reduce((s, i) => s + i.revenue, 0)).toBe(8_000_000);
  });
});

describe('DashboardBlocksService.getRevenueByProductCategory', () => {
  it('bucket null "Chưa gắn danh mục" giu rieng, khong gop vao "Khác"', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw.mockResolvedValueOnce([
      ...Array.from({ length: 7 }, (_, i) => ({
        id: BigInt(i + 1), name: `Cat ${i + 1}`, revenue: BigInt((10 - i) * 1_000_000), order_count: 2n,
      })),
      { id: null, name: null, revenue: 3_000_000n, order_count: 1n },
    ]);

    const res = await service.getRevenueByProductCategory(FROM, TO);

    // Top 5 named + Khác (2 named) + Chưa gắn danh mục
    expect(res.items).toHaveLength(7);
    expect(res.items[5].name).toBe('Khác');
    expect(res.items[6].name).toBe('Chưa gắn danh mục');
    expect(res.other?.count).toBe(2);
    expect(res.totalGroups).toBe(8);
    // pct tính trên tổng bao gồm cả bucket null
    const total = res.total;
    expect(total).toBe(10_000_000 + 9_000_000 + 8_000_000 + 7_000_000 + 6_000_000 + 5_000_000 + 4_000_000 + 3_000_000);
    expect(res.items[6].pct).toBeCloseTo(Math.round((3_000_000 / total) * 1000) / 10, 5);
  });

  it('khong co doanh thu -> response rong', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    expect(await service.getRevenueByProductCategory(FROM, TO)).toEqual({
      items: [], other: null, total: 0, totalGroups: 0,
    });
  });
});

describe('DashboardBlocksService.getTierDistribution', () => {
  it('map tier + avgSpend; tier null -> "Chưa xếp hạng"', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw.mockResolvedValueOnce([
      { id: 1n, name: 'Vàng', color: '#f59e0b', emoji: '🥇', icon_key: null, customer_count: 4n, total_spend: 40_000_000n },
      { id: null, name: null, color: null, emoji: null, icon_key: null, customer_count: 10n, total_spend: 0n },
    ]);

    const items = await service.getTierDistribution();
    expect(items[0]).toMatchObject({ tierId: '1', name: 'Vàng', customerCount: 4, avgSpend: 10_000_000 });
    expect(items[1]).toMatchObject({ tierId: null, name: 'Chưa xếp hạng', customerCount: 10, avgSpend: 0 });
  });
});

describe('DashboardBlocksService.getTierMovement', () => {
  it('resolve ten tier tu metadata id, null -> "Chưa xếp hạng"', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw.mockResolvedValueOnce([
      { from_id: null, to_id: '1', count: 3n },
      { from_id: '1', to_id: '2', count: 2n },
    ]);
    prisma.customerTier.findMany.mockResolvedValueOnce([
      { id: 1n, name: 'Bạc' },
      { id: 2n, name: 'Vàng' },
    ]);

    const res = await service.getTierMovement(FROM, TO);
    expect(res.total).toBe(5);
    expect(res.items[0]).toMatchObject({ from: 'Chưa xếp hạng', to: 'Bạc', count: 3 });
    expect(res.items[1]).toMatchObject({ from: 'Bạc', to: 'Vàng', count: 2 });
  });

  it('khong co event trong ky -> total 0, items rong', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    expect(await service.getTierMovement(FROM, TO)).toEqual({ total: 0, items: [] });
  });
});

describe('DashboardBlocksService.getConversionByHour', () => {
  it('fill du 5 bucket theo thu tu co dinh, bucket thieu = 0', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw.mockResolvedValueOnce([
      { bucket: '8-11h', leads: 50n, converted: 5n },
      { bucket: 'Khác', leads: 10n, converted: 0n },
    ]);

    const res = await service.getConversionByHour(FROM, TO);
    expect(res.map(r => r.bucket)).toEqual(['8-11h', '11-14h', '14-18h', '18-22h', 'Khác']);
    expect(res[0]).toMatchObject({ leads: 50, converted: 5, cvRate: 10 });
    expect(res[1]).toMatchObject({ leads: 0, converted: 0, cvRate: 0 });
  });
});

describe('DashboardBlocksService.getReceivables', () => {
  it('tra cong no + verified/pending tu 2 aggregate row', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ order_count: 3n, debt_amount: 12_500_000n }])
      .mockResolvedValueOnce([{ verified_amount: 30_000_000n, pending_amount: 5_000_000n }]);
    expect(await service.getReceivables(FROM, TO)).toEqual({
      debtOrderCount: 3, debtAmount: 12_500_000, verifiedAmount: 30_000_000, pendingAmount: 5_000_000,
    });
  });

  it('khong co row -> zeros', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    expect(await service.getReceivables(FROM, TO)).toEqual({
      debtOrderCount: 0, debtAmount: 0, verifiedAmount: 0, pendingAmount: 0,
    });
  });
});
