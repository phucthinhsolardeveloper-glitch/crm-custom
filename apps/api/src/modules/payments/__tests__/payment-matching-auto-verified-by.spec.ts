import { describe, expect, it, vi } from 'vitest';
import { PaymentMatchingService } from '../payment-matching.service';
import { SYSTEM_USER_ID } from '../../../common/constants/system-user';

/**
 * Test audit trail AUTO match: payment được verify tự động phải có verifiedBy
 * (SYSTEM_USER_ID) thay vì null - báo cáo "ai xác nhận" không còn lỗ hổng.
 */
describe('PaymentMatchingService - AUTO match verifiedBy', () => {
  it('executeMatch set verifiedBy = SYSTEM_USER_ID + verifiedSource AUTO', async () => {
    const tx = {
      bankTransaction: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn(),
      },
      payment: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue(null), // early-out conversion trigger + tier recalc
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
    };
    const prisma = {
      payment: {
        findFirst: vi.fn().mockResolvedValue({
          id: 10n, status: 'PENDING', amount: 1_000_000, transferContent: 'CK123',
        }),
      },
      bankTransaction: {
        findMany: vi.fn().mockResolvedValue([{ id: 20n, content: 'ck123 abc' }]),
      },
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    };
    const tierRecalc = { recalcForCustomer: vi.fn() };
    const service = new PaymentMatchingService(prisma as never, tierRecalc as never);

    const result = await service.tryMatchPayment(10n);

    expect(result).toMatchObject({ paymentId: 10n, bankTxId: 20n, status: 'AUTO_MATCHED' });
    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 10n, status: 'PENDING' },
      data: expect.objectContaining({
        status: 'VERIFIED',
        verifiedBy: SYSTEM_USER_ID,
        verifiedSource: 'AUTO',
      }),
    });
  });
});
