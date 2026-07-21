import { describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { PaymentMatchingService, ORDER_MATCHABLE_FILTER } from '../payment-matching.service';
import { PaymentsService } from '../payments.service';

/**
 * Guards chong "hoi sinh" don da huy: payment cua don CANCELLED/REFUNDED/xoa mem
 * khong duoc match/verify, va conversion trigger khong duoc set don huy thanh COMPLETED.
 */
describe('PaymentMatchingService - cancelled order guards', () => {
  it('tryMatchPayment loc payment theo order matchable (don huy -> khong tim thay -> null)', async () => {
    const prisma = {
      payment: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    };
    const service = new PaymentMatchingService(prisma as never, { recalcForCustomer: vi.fn() } as never);

    const result = await service.tryMatchPayment(10n);

    expect(result).toBeNull();
    expect(prisma.payment.findFirst).toHaveBeenCalledWith({
      where: { id: 10n, order: ORDER_MATCHABLE_FILTER },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('tryMatchBankTransaction chi quet payment cua don matchable', async () => {
    const prisma = {
      bankTransaction: {
        findUnique: vi.fn().mockResolvedValue({ id: 20n, matchStatus: 'UNMATCHED', amount: 500_000, content: 'ck' }),
      },
      payment: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(),
    };
    const service = new PaymentMatchingService(prisma as never, { recalcForCustomer: vi.fn() } as never);

    await service.tryMatchBankTransaction(20n);

    expect(prisma.payment.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ status: 'PENDING', order: ORDER_MATCHABLE_FILTER }),
    });
  });

  it('checkConversionTrigger: don da COMPLETED (guard count=0) -> khong convert lead', async () => {
    const tx = {
      payment: {
        findUnique: vi.fn().mockResolvedValue({
          orderId: 1n,
          order: { id: 1n, totalAmount: 100, leadId: 7n },
        }),
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 100 } }),
      },
      order: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      lead: { findFirst: vi.fn(), update: vi.fn() },
    };
    const service = new PaymentMatchingService({} as never, { recalcForCustomer: vi.fn() } as never);

    await service.checkConversionTrigger(tx, 10n);

    // Guard chỉ complete đơn còn PENDING (order mới có 2 status: PENDING, COMPLETED)
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: 1n,
        status: 'PENDING',
        deletedAt: null,
      },
      data: { status: 'COMPLETED' },
    });
    expect(tx.lead.findFirst).not.toHaveBeenCalled();
    expect(tx.lead.update).not.toHaveBeenCalled();
  });

  it('checkConversionTrigger: don CONFIRMED du tien -> van COMPLETED + convert lead (khong regression)', async () => {
    const tx = {
      payment: {
        findUnique: vi.fn().mockResolvedValue({
          orderId: 1n,
          verifiedBy: 2n,
          order: { id: 1n, totalAmount: 100, leadId: 7n },
        }),
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 100 } }),
      },
      order: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      lead: {
        findFirst: vi.fn().mockResolvedValue({ id: 7n, status: 'IN_PROGRESS', customerId: null, assignedUserId: 2n }),
        update: vi.fn(),
      },
      activity: { create: vi.fn() },
    };
    const service = new PaymentMatchingService({} as never, { recalcForCustomer: vi.fn() } as never);

    await service.checkConversionTrigger(tx, 10n);

    expect(tx.lead.update).toHaveBeenCalledWith({ where: { id: 7n }, data: { status: 'CONVERTED' } });
  });
});

describe('PaymentsService.verifyManual - deleted order guard', () => {
  function makeService(order: { status: string; deletedAt: Date | null } | null, claimCount = 1) {
    const tx = {
      payment: {
        findFirst: vi.fn().mockResolvedValue({ id: 10n, orderId: 1n, amount: 100, status: 'PENDING', order }),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: claimCount }),
      },
      order: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const prisma = {
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    };
    const service = new PaymentsService(
      prisma as never,
      { checkConversionTrigger: vi.fn() } as never,
      {} as never,
      { recalcForCustomer: vi.fn() } as never,
      { enqueuePaymentSync: vi.fn() } as never,
    );
    // findById được gọi sau commit - không thuộc phạm vi test guard
    service.findById = vi.fn().mockResolvedValue({ id: 10n, status: 'VERIFIED' }) as never;
    return { service, tx };
  }

  it('order xoá mềm (deletedAt IS NOT NULL) -> 409, không ghi payment', async () => {
    const { service, tx } = makeService({ status: 'PENDING', deletedAt: new Date() });
    await expect(service.verifyManual(10n, 1n)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.payment.updateMany).not.toHaveBeenCalled();
  });

  it('order hợp lệ (PENDING, còn sống) -> verify thành công, guard PENDING + ORDER_MATCHABLE_FILTER', async () => {
    const { service, tx } = makeService({ status: 'PENDING', deletedAt: null });
    await service.verifyManual(10n, 1n);
    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 10n, status: 'PENDING', order: ORDER_MATCHABLE_FILTER },
      data: expect.objectContaining({ status: 'VERIFIED', verifiedSource: 'MANUAL' }),
    });
  });

  it('order hợp lệ (COMPLETED, còn sống) -> verify thành công', async () => {
    const { service, tx } = makeService({ status: 'COMPLETED', deletedAt: null });
    await service.verifyManual(10n, 1n);
    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 10n, status: 'PENDING', order: ORDER_MATCHABLE_FILTER },
      data: expect.objectContaining({ status: 'VERIFIED', verifiedSource: 'MANUAL' }),
    });
  });

  it('race: payment không PENDING giữa đọc và ghi (count=0) -> 409', async () => {
    const { service } = makeService({ status: 'PENDING', deletedAt: null }, 0);
    await expect(service.verifyManual(10n, 1n)).rejects.toBeInstanceOf(ConflictException);
  });
});
