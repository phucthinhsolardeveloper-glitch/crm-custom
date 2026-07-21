import { describe, expect, it, vi } from 'vitest';

/**
 * Test 2 công thức doanh thu:
 * - Doanh thu TỔNG (ví công ty) = VERIFIED + REJECTED (tiền thật đã về)
 * - Doanh số SALE (KPI) = VERIFIED only (tiền đúng, không phạt)
 * - REFUNDED + CANCELLED không tính ví nào
 *
 * Một order có mix status: VERIFIED + REJECTED -> tổng > sale (chênh = REJECTED)
 */
describe('Revenue split - Tổng vs Sale', () => {
  describe('Order với VERIFIED payments', () => {
    it('2 payment VERIFIED 100 + 200 -> tổng = 300, sale = 300', () => {
      const payments = [
        { status: 'VERIFIED', amount: 100 },
        { status: 'VERIFIED', amount: 200 },
      ];

      const totalRevenue = payments
        .filter((p) => p.status === 'VERIFIED' || p.status === 'REJECTED')
        .reduce((sum, p) => sum + p.amount, 0);
      const saleRevenue = payments
        .filter((p) => p.status === 'VERIFIED')
        .reduce((sum, p) => sum + p.amount, 0);

      expect(totalRevenue).toBe(300);
      expect(saleRevenue).toBe(300);
      expect(totalRevenue).toBe(saleRevenue);
    });
  });

  describe('Order với VERIFIED + REJECTED', () => {
    it('VERIFIED 300 + REJECTED 50 -> tổng = 350, sale = 300 (chênh = 50)', () => {
      const payments = [
        { status: 'VERIFIED', amount: 300 },
        { status: 'REJECTED', amount: 50 },
      ];

      const totalRevenue = payments
        .filter((p) => p.status === 'VERIFIED' || p.status === 'REJECTED')
        .reduce((sum, p) => sum + p.amount, 0);
      const saleRevenue = payments
        .filter((p) => p.status === 'VERIFIED')
        .reduce((sum, p) => sum + p.amount, 0);

      expect(totalRevenue).toBe(350);
      expect(saleRevenue).toBe(300);
      expect(totalRevenue - saleRevenue).toBe(50); // REJECTED
    });
  });

  describe('Order với VERIFIED + REFUNDED', () => {
    it('VERIFIED 200 + REFUNDED 100 -> tổng = 200, sale = 200 (REFUNDED không tính)', () => {
      const payments = [
        { status: 'VERIFIED', amount: 200 },
        { status: 'REFUNDED', amount: 100 },
      ];

      const totalRevenue = payments
        .filter((p) => p.status === 'VERIFIED' || p.status === 'REJECTED')
        .reduce((sum, p) => sum + p.amount, 0);
      const saleRevenue = payments
        .filter((p) => p.status === 'VERIFIED')
        .reduce((sum, p) => sum + p.amount, 0);

      expect(totalRevenue).toBe(200);
      expect(saleRevenue).toBe(200);
    });
  });

  describe('Order với VERIFIED + CANCELLED', () => {
    it('VERIFIED 200 + CANCELLED 100 -> tổng = 200, sale = 200 (CANCELLED không tính)', () => {
      const payments = [
        { status: 'VERIFIED', amount: 200 },
        { status: 'CANCELLED', amount: 100 },
      ];

      const totalRevenue = payments
        .filter((p) => p.status === 'VERIFIED' || p.status === 'REJECTED')
        .reduce((sum, p) => sum + p.amount, 0);
      const saleRevenue = payments
        .filter((p) => p.status === 'VERIFIED')
        .reduce((sum, p) => sum + p.amount, 0);

      expect(totalRevenue).toBe(200);
      expect(saleRevenue).toBe(200);
    });
  });

  describe('Order với nhiều trạng thái mix', () => {
    it('VERIFIED 500 + REJECTED 100 + REFUNDED 200 + CANCELLED 50 -> tổng = 600, sale = 500', () => {
      const payments = [
        { status: 'VERIFIED', amount: 500 },
        { status: 'REJECTED', amount: 100 },
        { status: 'REFUNDED', amount: 200 },
        { status: 'CANCELLED', amount: 50 },
      ];

      const totalRevenue = payments
        .filter((p) => p.status === 'VERIFIED' || p.status === 'REJECTED')
        .reduce((sum, p) => sum + p.amount, 0);
      const saleRevenue = payments
        .filter((p) => p.status === 'VERIFIED')
        .reduce((sum, p) => sum + p.amount, 0);

      expect(totalRevenue).toBe(600); // VERIFIED(500) + REJECTED(100)
      expect(saleRevenue).toBe(500); // VERIFIED only
      expect(totalRevenue - saleRevenue).toBe(100); // chênh = REJECTED
    });
  });

  describe('Order chỉ PENDING + REJECTED', () => {
    it('PENDING 300 + REJECTED 100 -> tổng = 100, sale = 0 (PENDING không đủ)', () => {
      const payments = [
        { status: 'PENDING', amount: 300 },
        { status: 'REJECTED', amount: 100 },
      ];

      const totalRevenue = payments
        .filter((p) => p.status === 'VERIFIED' || p.status === 'REJECTED')
        .reduce((sum, p) => sum + p.amount, 0);
      const saleRevenue = payments
        .filter((p) => p.status === 'VERIFIED')
        .reduce((sum, p) => sum + p.amount, 0);

      expect(totalRevenue).toBe(100);
      expect(saleRevenue).toBe(0);
    });
  });

  describe('Order không payment', () => {
    it('trống -> tổng = 0, sale = 0', () => {
      const payments: any[] = [];

      const totalRevenue = payments
        .filter((p) => p.status === 'VERIFIED' || p.status === 'REJECTED')
        .reduce((sum, p) => sum + p.amount, 0);
      const saleRevenue = payments
        .filter((p) => p.status === 'VERIFIED')
        .reduce((sum, p) => sum + p.amount, 0);

      expect(totalRevenue).toBe(0);
      expect(saleRevenue).toBe(0);
    });
  });
});
