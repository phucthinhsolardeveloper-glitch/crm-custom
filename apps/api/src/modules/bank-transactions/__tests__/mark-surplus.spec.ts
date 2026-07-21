import { describe, expect, it, vi } from 'vitest';
import { BankTransactionsService } from '../bank-transactions.service';

/**
 * Money path: danh dau tien du phai (1) tao surplus row copy dung field,
 * (2) chuyen bank tx UNMATCHED -> IGNORED, (3) chan khi race (claim count=0).
 */

const BANK_TX = {
  id: 5n,
  externalId: 'FT123',
  amount: '500000',
  content: 'ban be tra no',
  senderName: 'Nguyen Van A',
  senderAccount: '999',
  transactionTime: new Date('2026-07-01T03:00:00Z'),
  matchStatus: 'UNMATCHED',
};

function makeService(overrides: { claimCount?: number } = {}) {
  const tx = {
    bankTransaction: {
      updateMany: vi.fn().mockResolvedValue({ count: overrides.claimCount ?? 1 }),
    },
    surplusTransaction: {
      create: vi.fn().mockResolvedValue({ id: 42n }),
    },
  };
  const prisma = {
    bankTransaction: { findFirst: vi.fn().mockResolvedValue(BANK_TX) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const svc = new BankTransactionsService(prisma as never, {} as never);
  return { svc, prisma, tx };
}

describe('BankTransactionsService.markSurplus', () => {
  it('tao surplus row + chuyen bank tx sang IGNORED', async () => {
    const { svc, tx } = makeService();

    const res = await svc.markSurplus(5n, '  bạn bè trả nợ  ', 7n);

    expect(res).toEqual({ surplusId: 42n, bankTxId: 5n, status: 'SURPLUS' });
    // Bank tx UNMATCHED -> IGNORED
    expect(tx.bankTransaction.updateMany).toHaveBeenCalledWith({
      where: { id: 5n, matchStatus: 'UNMATCHED' },
      data: { matchStatus: 'IGNORED' },
    });
    // Surplus copy field + trim note + markedBy
    const created = tx.surplusTransaction.create.mock.calls[0][0].data;
    expect(created.externalId).toBe('FT123');
    expect(created.amount).toBe('500000');
    expect(created.note).toBe('bạn bè trả nợ');
    expect(created.markedBy).toBe(7n);
  });

  it('chan khi race: claim count = 0 -> khong tao surplus', async () => {
    const { svc, tx } = makeService({ claimCount: 0 });

    await expect(svc.markSurplus(5n, undefined, 7n)).rejects.toThrow();
    expect(tx.surplusTransaction.create).not.toHaveBeenCalled();
  });
});
