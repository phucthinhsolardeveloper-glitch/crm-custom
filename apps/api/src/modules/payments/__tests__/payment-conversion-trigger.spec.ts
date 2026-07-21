import { describe, expect, it, vi } from 'vitest';
import { PaymentMatchingService, ORDER_MATCHABLE_FILTER } from '../payment-matching.service';

/**
 * Test conversion trigger: order auto-COMPLETED khi SUM(payment WHERE status IN VERIFIED, REJECTED) >= order.totalAmount.
 * Điều kiện: order còn PENDING + chưa xoá + doanh thu tổng (ví công ty) >= totalAmount.
 */
describe('PaymentMatchingService - Conversion trigger', () => {
  function makeService() {
    const tx = {
      payment: {
        findUnique: vi.fn(),
        aggregate: vi.fn(),
      },
      order: { updateMany: vi.fn() },
      lead: { findFirst: vi.fn(), update: vi.fn() },
      activity: { create: vi.fn() },
      customer: { update: vi.fn() },
    };
    const prisma = {
      // prisma.payment.aggregate được dùng ngoài transaction
      payment: { aggregate: vi.fn() },
    };
    const tierRecalc = { recalcForCustomer: vi.fn() };
    const service = new PaymentMatchingService(prisma as never, tierRecalc as never);
    return { service, prisma, tx };
  }

  it('tổng VERIFIED + REJECTED đủ -> order chuyển PENDING -> COMPLETED', async () => {
    const { tx } = makeService();
    tx.payment.findUnique.mockResolvedValue({
      orderId: 1n,
      order: { id: 1n, totalAmount: 100, leadId: null },
    });
    tx.payment.aggregate.mockResolvedValue({
      _sum: { amount: 100 }, // VERIFIED (80) + REJECTED (20) = 100 >= 100
    });
    tx.order.updateMany.mockResolvedValue({ count: 1 });

    const service = new PaymentMatchingService({} as never, { recalcForCustomer: vi.fn() } as never);
    await service.checkConversionTrigger(tx, 10n);

    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: 1n,
        status: 'PENDING',
        deletedAt: null,
      },
      data: { status: 'COMPLETED' },
    });
  });

  it('thiếu tiền (tổng < totalAmount) -> order không updateMany (early exit)', async () => {
    const { tx } = makeService();
    tx.payment.findUnique.mockResolvedValue({
      orderId: 1n,
      order: { id: 1n, totalAmount: 100, leadId: null },
    });
    tx.payment.aggregate.mockResolvedValue({
      _sum: { amount: 50 }, // < 100
    });

    const service = new PaymentMatchingService({} as never, { recalcForCustomer: vi.fn() } as never);
    await service.checkConversionTrigger(tx, 10n);

    // Không đủ tiền -> không gọi updateMany
    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(tx.lead.update).not.toHaveBeenCalled();
  });

  it('order đã COMPLETED -> khôngConvert lại (guard status PENDING)', async () => {
    const { tx } = makeService();
    tx.payment.findUnique.mockResolvedValue({
      orderId: 1n,
      order: { id: 1n, totalAmount: 100, leadId: null },
    });
    tx.payment.aggregate.mockResolvedValue({
      _sum: { amount: 100 },
    });
    tx.order.updateMany.mockResolvedValue({ count: 0 }); // order khác status

    const service = new PaymentMatchingService({} as never, { recalcForCustomer: vi.fn() } as never);
    await service.checkConversionTrigger(tx, 10n);

    expect(tx.lead.findFirst).not.toHaveBeenCalled();
    expect(tx.lead.update).not.toHaveBeenCalled();
  });

  it('order đã xoá mềm -> không match (guard deletedAt null)', async () => {
    const { tx } = makeService();
    tx.payment.findUnique.mockResolvedValue({
      orderId: 1n,
      order: { id: 1n, totalAmount: 100, leadId: null, deletedAt: new Date() },
    });
    tx.payment.aggregate.mockResolvedValue({
      _sum: { amount: 100 },
    });
    tx.order.updateMany.mockResolvedValue({ count: 0 });

    const service = new PaymentMatchingService({} as never, { recalcForCustomer: vi.fn() } as never);
    await service.checkConversionTrigger(tx, 10n);

    expect(tx.order.updateMany).toHaveBeenCalled();
    expect(tx.lead.findFirst).not.toHaveBeenCalled();
  });

  it('order có lead -> convert lead sang CONVERTED + cập nhật customer', async () => {
    const { tx } = makeService();
    tx.payment.findUnique.mockResolvedValue({
      orderId: 1n,
      verifiedBy: 2n,
      order: { id: 1n, totalAmount: 100, leadId: 7n },
    });
    tx.payment.aggregate.mockResolvedValue({
      _sum: { amount: 100 },
    });
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    tx.lead.findFirst.mockResolvedValue({
      id: 7n,
      status: 'IN_PROGRESS',
      customerId: 3n,
      assignedUserId: 2n,
      departmentId: 4n,
    });

    const service = new PaymentMatchingService({} as never, { recalcForCustomer: vi.fn() } as never);
    await service.checkConversionTrigger(tx, 10n);

    expect(tx.lead.update).toHaveBeenCalledWith({
      where: { id: 7n },
      data: { status: 'CONVERTED' },
    });
    expect(tx.customer.update).toHaveBeenCalledWith({
      where: { id: 3n },
      data: expect.objectContaining({
        status: 'ACTIVE',
        assignedUserId: 2n,
        assignedDepartmentId: 4n,
      }),
    });
  });

  it('lead đã CONVERTED -> không update lại', async () => {
    const { tx } = makeService();
    tx.payment.findUnique.mockResolvedValue({
      orderId: 1n,
      order: { id: 1n, totalAmount: 100, leadId: 7n },
    });
    tx.payment.aggregate.mockResolvedValue({
      _sum: { amount: 100 },
    });
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    tx.lead.findFirst.mockResolvedValue({
      id: 7n,
      status: 'CONVERTED', // đã convert rồi
      customerId: 3n,
      assignedUserId: 2n,
    });

    const service = new PaymentMatchingService({} as never, { recalcForCustomer: vi.fn() } as never);
    await service.checkConversionTrigger(tx, 10n);

    expect(tx.lead.update).not.toHaveBeenCalled();
  });

  it('lead không tồn tại (leadId null) -> không convert', async () => {
    const { tx } = makeService();
    tx.payment.findUnique.mockResolvedValue({
      orderId: 1n,
      order: { id: 1n, totalAmount: 100, leadId: null },
    });
    tx.payment.aggregate.mockResolvedValue({
      _sum: { amount: 100 },
    });
    tx.order.updateMany.mockResolvedValue({ count: 1 });

    const service = new PaymentMatchingService({} as never, { recalcForCustomer: vi.fn() } as never);
    await service.checkConversionTrigger(tx, 10n);

    expect(tx.lead.findFirst).not.toHaveBeenCalled();
  });
});
