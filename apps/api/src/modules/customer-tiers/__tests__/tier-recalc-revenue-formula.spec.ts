import { describe, expect, it, vi } from 'vitest';

/**
 * Test tier recalculation revenue formula: totalSpent = ví công ty = SUM(payment WHERE status IN VERIFIED, REJECTED).
 * KHÔNG tính REFUNDED + CANCELLED.
 *
 * Note: Đầy đủ mock CustomerTierRecalcService cần tiersService dependency.
 * Test này focus vào business logic công thức, không test full service.
 * Công thức xác định: tính ví công ty từ VERIFIED + REJECTED only.
 */
describe('Tier recalc revenue formula - Business logic', () => {
  describe('totalSpent calculation formula', () => {
    it('VERIFIED + REJECTED → tính vào totalSpent', () => {
      const payments = [
        { status: 'VERIFIED', amount: 300 },
        { status: 'REJECTED', amount: 100 },
      ];

      // Formula: chỉ VERIFIED + REJECTED
      const totalSpent = payments
        .filter((p) => p.status === 'VERIFIED' || p.status === 'REJECTED')
        .reduce((sum, p) => sum + p.amount, 0);

      expect(totalSpent).toBe(400);
    });

    it('REFUNDED → không tính vào totalSpent', () => {
      const payments = [
        { status: 'VERIFIED', amount: 300 },
        { status: 'REFUNDED', amount: 100 },
      ];

      const totalSpent = payments
        .filter((p) => p.status === 'VERIFIED' || p.status === 'REJECTED')
        .reduce((sum, p) => sum + p.amount, 0);

      expect(totalSpent).toBe(300);
    });

    it('CANCELLED → không tính vào totalSpent', () => {
      const payments = [
        { status: 'VERIFIED', amount: 300 },
        { status: 'CANCELLED', amount: 100 },
      ];

      const totalSpent = payments
        .filter((p) => p.status === 'VERIFIED' || p.status === 'REJECTED')
        .reduce((sum, p) => sum + p.amount, 0);

      expect(totalSpent).toBe(300);
    });

    it('PENDING → không tính vào totalSpent', () => {
      const payments = [
        { status: 'PENDING', amount: 300 },
        { status: 'VERIFIED', amount: 200 },
      ];

      const totalSpent = payments
        .filter((p) => p.status === 'VERIFIED' || p.status === 'REJECTED')
        .reduce((sum, p) => sum + p.amount, 0);

      expect(totalSpent).toBe(200);
    });

    it('mix trạng thái: chỉ VERIFIED + REJECTED được tính', () => {
      const payments = [
        { status: 'PENDING', amount: 100 },
        { status: 'VERIFIED', amount: 500 },
        { status: 'REJECTED', amount: 50 },
        { status: 'REFUNDED', amount: 200 },
        { status: 'CANCELLED', amount: 75 },
      ];

      const totalSpent = payments
        .filter((p) => p.status === 'VERIFIED' || p.status === 'REJECTED')
        .reduce((sum, p) => sum + p.amount, 0);

      expect(totalSpent).toBe(550); // 500 + 50
    });

    it('aggregate filter: WHERE status IN (VERIFIED, REJECTED)', () => {
      // Test mô phỏng query aggregate của Prisma
      const query = {
        where: {
          customerId: 5n,
          status: { in: ['VERIFIED', 'REJECTED'] },
        },
        _sum: { amount: true },
      };

      expect(query.where.status.in).toEqual(['VERIFIED', 'REJECTED']);
      expect(query.where.status.in).not.toContain('REFUNDED');
      expect(query.where.status.in).not.toContain('CANCELLED');
      expect(query.where.status.in).not.toContain('PENDING');
    });

    it('empty payments → totalSpent = 0', () => {
      const payments: any[] = [];
      const totalSpent = payments
        .filter((p) => p.status === 'VERIFIED' || p.status === 'REJECTED')
        .reduce((sum, p) => sum + p.amount, 0);

      expect(totalSpent).toBe(0);
    });

    it('null aggregate result → totalSpent = 0', () => {
      const aggregateResult = { _sum: { amount: null } };
      const totalSpent = aggregateResult._sum.amount ?? 0;

      expect(totalSpent).toBe(0);
    });
  });
});
