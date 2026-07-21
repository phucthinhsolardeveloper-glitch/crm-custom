import { describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { OrdersService } from '../orders.service';

/**
 * Order giờ chỉ 2 status: PENDING -> COMPLETED. Không cascade order -> payment nữa.
 * Huỷ/hoàn tiền nay là hành động trên từng Payment (cancel/refund).
 */
function makeService(currentStatus: string) {
  const tx = {
    order: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirstOrThrow: vi.fn().mockResolvedValue({ id: 1n, status: currentStatus, customerId: 5n }),
    },
  };
  const prisma = {
    order: {
      findFirst: vi.fn().mockResolvedValue({ id: 1n, status: currentStatus, customerId: 5n }),
    },
    $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  const cache = { del: vi.fn() };
  const tierRecalc = { recalcForCustomer: vi.fn() };
  const service = new OrdersService(prisma as never, cache as never, tierRecalc as never);
  return { service, prisma, tx, tierRecalc };
}

describe('OrdersService.updateStatus', () => {
  it('PENDING -> COMPLETED: transition hợp lệ, không cascade payment', async () => {
    const { service, tx } = makeService('PENDING');
    const result = await service.updateStatus(1n, 'COMPLETED');

    // Guard predicate: updateMany với status: 'PENDING' để chống concurrent double-transition
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 1n, status: 'PENDING', deletedAt: null },
      data: { status: 'COMPLETED' },
    });
    expect(result).toEqual({ id: 1n, status: 'PENDING', customerId: 5n });
  });

  it('status bị đổi bởi request khác (guard count=0) -> Conflict', async () => {
    const { service, tx } = makeService('PENDING');
    tx.order.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.updateStatus(1n, 'COMPLETED')).rejects.toBeInstanceOf(ConflictException);
  });

  it('transition không hợp lệ (COMPLETED -> PENDING) -> Conflict trước tx', async () => {
    const { service, prisma } = makeService('COMPLETED');
    await expect(service.updateStatus(1n, 'PENDING')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('transition không hợp lệ (COMPLETED -> COMPLETED) -> Conflict', async () => {
    const { service, prisma } = makeService('COMPLETED');
    await expect(service.updateStatus(1n, 'COMPLETED')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
