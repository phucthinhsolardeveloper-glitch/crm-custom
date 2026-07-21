import { describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PaymentsService } from '../payments.service';

/**
 * Test guard tiền của PaymentsService.create:
 * - amount <= 0 / NaN bị chặn trước khi chạm DB
 * - overpayment bị chặn trong transaction (aggregate + create cùng tx, order row lock)
 */
function makeService(opts: {
  order?: Record<string, unknown> | null;
  existingSum?: number;
} = {}) {
  const order = opts.order === undefined
    ? { id: 1n, amount: 10_000_000, totalAmount: 10_000_000, createdBy: 9n, leadId: null, deletedAt: null }
    : opts.order;

  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    order: { findFirst: vi.fn().mockResolvedValue(order) },
    payment: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: opts.existingSum ?? 0 } }),
      create: vi.fn().mockResolvedValue({ id: 100n }),
    },
  };

  const prisma = {
    $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    payment: { findFirst: vi.fn().mockResolvedValue({ id: 100n, amount: 1 }) },
    activity: { create: vi.fn() },
  };

  const matching = { tryMatchPayment: vi.fn() };
  const scoring = { scorePair: vi.fn() };
  const tierRecalc = { recalcForCustomer: vi.fn() };
  const larkSync = { enqueuePaymentSync: vi.fn() };

  const service = new PaymentsService(
    prisma as never, matching as never, scoring as never,
    tierRecalc as never, larkSync as never,
  );
  return { service, prisma, tx };
}

describe('PaymentsService.create - money guards', () => {
  it('amount = 0 -> Conflict, khong cham DB', async () => {
    const { service, prisma } = makeService();
    await expect(service.create({ orderId: '1', amount: 0 })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('amount am -> Conflict, khong cham DB', async () => {
    const { service, prisma } = makeService();
    await expect(service.create({ orderId: '1', amount: -100_000 })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('amount NaN -> Conflict, khong cham DB', async () => {
    const { service, prisma } = makeService();
    await expect(service.create({ orderId: '1', amount: NaN })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('order khong ton tai -> NotFound', async () => {
    const { service } = makeService({ order: null });
    await expect(service.create({ orderId: '1', amount: 1_000_000 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tong vuot 250% totalAmount -> Conflict, khong tao payment', async () => {
    // Đơn 10tr, đã có 8tr, thêm 18tr -> 26tr > trần 25tr (250%) -> chặn.
    const { service, tx } = makeService({ existingSum: 8_000_000 });
    await expect(service.create({ orderId: '1', amount: 18_000_000 })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('thu vuot trong nguong 250% -> cho phep tao payment', async () => {
    // Đơn 10tr, đã có 8tr, thêm 17tr -> 25tr = đúng trần 250% -> OK.
    const { service, tx } = makeService({ existingSum: 8_000_000 });
    await service.create({ orderId: '1', amount: 17_000_000 });
    expect(tx.payment.create).toHaveBeenCalledTimes(1);
  });

  it('don da thu du 250% -> Conflict', async () => {
    const { service, tx } = makeService({ existingSum: 25_000_000 });
    await expect(service.create({ orderId: '1', amount: 1 })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('hop le -> lock order row (FOR UPDATE) + aggregate + create cung transaction', async () => {
    const { service, prisma, tx } = makeService({ existingSum: 4_000_000 });
    await service.create({ orderId: '1', amount: 6_000_000 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalled(); // SELECT ... FOR UPDATE
    expect(tx.payment.aggregate).toHaveBeenCalled();
    expect(tx.payment.create).toHaveBeenCalledTimes(1);
    // completionRate snapshot: (4tr + 6tr) / 10tr = 100%
    const createArg = tx.payment.create.mock.calls[0][0] as { data: { completionRate: number } };
    expect(createArg.data.completionRate).toBe(100);
  });
});
