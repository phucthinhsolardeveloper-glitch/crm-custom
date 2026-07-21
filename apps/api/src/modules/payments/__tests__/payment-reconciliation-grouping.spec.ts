import { describe, expect, it, vi } from 'vitest';
import { PaymentReconciliationService } from '../payment-reconciliation.service';
import { PaymentScoringService } from '../payment-scoring.service';
import { parseVnDateTime, vnWallClockToDate } from '../../../common/utils/vn-timezone';

/**
 * Đối soát: gom theo mệnh giá + trạng thái ok/warn/err + biên timezone VN.
 * Rủi ro chính (theo plan): TZ sai làm rớt giao dịch biên, và gom/đếm sai status.
 */
describe('vn-timezone helper', () => {
  it('anchor wall-clock VN về UTC (trừ 7 giờ)', () => {
    // 01/07/2026 00:00 VN = 30/06/2026 17:00 UTC
    expect(vnWallClockToDate(2026, 7, 1, 0, 0, 0)?.toISOString()).toBe('2026-06-30T17:00:00.000Z');
    // 01/07/2026 02:17 VN (giao dịch sáng sớm) = 30/06 19:17 UTC - KHÔNG rớt khỏi ngày
    expect(vnWallClockToDate(2026, 7, 1, 2, 17, 0)?.toISOString()).toBe('2026-06-30T19:17:00.000Z');
  });

  it('parseVnDateTime: naive coi là giờ VN, có offset thì tôn trọng', () => {
    expect(parseVnDateTime('2026-07-01T00:00')?.toISOString()).toBe('2026-06-30T17:00:00.000Z');
    expect(parseVnDateTime('2026-07-01T00:00:00+07:00')?.toISOString()).toBe('2026-06-30T17:00:00.000Z');
    expect(parseVnDateTime('')).toBeUndefined();
  });

  it('parseVnDateTime: phục hồi offset "+" bị proxy đổi thành dấu cách', () => {
    // "+" trong query string bị decode thành space -> "...00:00:00 07:00".
    expect(parseVnDateTime('2026-07-01T00:00:00 07:00')?.toISOString()).toBe('2026-06-30T17:00:00.000Z');
  });
});

describe('PaymentReconciliationService - gom mệnh giá', () => {
  function makeService(payments: any[], bankTxs: any[]) {
    const prisma = {
      payment: { findMany: vi.fn().mockResolvedValue(payments) },
      bankTransaction: { findMany: vi.fn().mockResolvedValue(bankTxs) },
    };
    return new PaymentReconciliationService(prisma as never, new PaymentScoringService());
  }

  it('mệnh giá khớp SL + tiền + map được -> status ok', async () => {
    const svc = makeService(
      [{ id: 1n, amount: 2986000, status: 'PENDING', transferContent: 'CK NGUYEN VAN A', transferDate: new Date('2026-07-01T02:00:00Z'), createdAt: new Date(), order: { customerName: 'Nguyen Van A', customer: { name: 'Nguyen Van A' }, product: { name: 'X' } } }],
      [{ id: 10n, amount: 2986000, content: 'CK NGUYEN VAN A', senderName: 'NGUYEN VAN A', senderAccount: null, transactionTime: new Date('2026-07-01T02:00:00Z'), matchStatus: 'UNMATCHED', matchedPaymentId: null }],
    );
    const res = await svc.getReconciliation('2026-07-01T00:00', '2026-07-01T23:59');
    expect(res.denominations).toHaveLength(1);
    const d = res.denominations[0];
    expect(d.amount).toBe(2986000);
    expect(d.saleCount).toBe(1);
    expect(d.bankCount).toBe(1);
    expect(d.diff).toBe(0);
    expect(d.mappedCount).toBe(1);
    expect(d.status).toBe('ok');
  });

  it('lệch SL -> status err', async () => {
    const svc = makeService(
      [{ id: 1n, amount: 500000, status: 'PENDING', transferContent: 'A', transferDate: new Date('2026-07-01T02:00:00Z'), createdAt: new Date(), order: { customerName: 'A', customer: { name: 'A' }, product: null } }],
      [
        { id: 10n, amount: 500000, content: 'A', senderName: 'A', senderAccount: null, transactionTime: new Date('2026-07-01T02:00:00Z'), matchStatus: 'UNMATCHED', matchedPaymentId: null },
        { id: 11n, amount: 500000, content: 'B', senderName: 'B', senderAccount: null, transactionTime: new Date('2026-07-01T02:00:00Z'), matchStatus: 'UNMATCHED', matchedPaymentId: null },
      ],
    );
    const res = await svc.getReconciliation('2026-07-01T00:00', '2026-07-01T23:59');
    const d = res.denominations[0];
    expect(d.saleCount).toBe(1);
    expect(d.bankCount).toBe(2);
    expect(d.status).toBe('err');
    // summary tổng: 1 payment, 2 banktx, lệch tiền = +500000
    expect(res.summary.saleTxTotal).toBe(1);
    expect(res.summary.bankTxTotal).toBe(2);
    expect(res.summary.grandDiff).toBe(500000);
  });

  it('khớp SL+tiền nhưng không đủ tín hiệu map -> status warn', async () => {
    const svc = makeService(
      [{ id: 1n, amount: 700000, status: 'PENDING', transferContent: null, transferDate: new Date('2026-07-01T02:00:00Z'), createdAt: new Date(), order: { customerName: null, customer: null, product: null } }],
      [{ id: 10n, amount: 700000, content: 'KHONG RO', senderName: null, senderAccount: null, transactionTime: new Date('2026-07-01T02:00:00Z'), matchStatus: 'UNMATCHED', matchedPaymentId: null }],
    );
    const res = await svc.getReconciliation('2026-07-01T00:00', '2026-07-01T23:59');
    const d = res.denominations[0];
    expect(d.saleCount).toBe(1);
    expect(d.bankCount).toBe(1);
    expect(d.diff).toBe(0);
    expect(d.mappedCount).toBe(0); // no-signal -> điểm dưới ngưỡng
    expect(d.status).toBe('warn');
  });
});
