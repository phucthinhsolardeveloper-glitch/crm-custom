import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LarkSyncProcessor } from '../lark-sync.processor';
import { LARK_JOB_SYNC_PAYMENT } from '../lark-sync.constants';
import type { LarkSyncContext } from '../lark-field-catalog';

function makeContext(): LarkSyncContext {
  return {
    payment: { id: '1', amount: 1, transferDate: null, createdAt: new Date(), transferContent: null, status: 'PENDING' },
    order: {
      totalAmount: 1, vatRate: 0, courseCode: null, stt: null, customerName: 'A',
      customerPhone: null, address: null, notes: null, companyName: null, taxCode: null, vatEmail: null,
    },
    customer: null, product: null, productGroup: null, orderFormat: null, leadSource: null,
    creator: null, team: null, paymentType: null, bankAccount: null, installment: null,
    agg: { sequence: 1, paidTotal: 1 },
  };
}

function makeJob(paymentId = '1') {
  return { name: LARK_JOB_SYNC_PAYMENT, data: { paymentId } } as never;
}

describe('LarkSyncProcessor', () => {
  let prisma: { payment: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> } };
  let tokenService: {
    isEnabled: ReturnType<typeof vi.fn>;
    getDefaultBaseToken: ReturnType<typeof vi.fn>;
  };
  let client: { createRecord: ReturnType<typeof vi.fn>; updateRecord: ReturnType<typeof vi.fn> };
  let engine: { buildContext: ReturnType<typeof vi.fn>; applyMapping: ReturnType<typeof vi.fn> };
  let mappingService: { getEnabledById: ReturnType<typeof vi.fn> };
  let history: { recordResult: ReturnType<typeof vi.fn> };
  let processor: LarkSyncProcessor;

  beforeEach(() => {
    prisma = {
      payment: {
        findUnique: vi.fn().mockResolvedValue({ id: 1n, orderId: 5n, larkRecordId: null }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    tokenService = {
      isEnabled: vi.fn().mockReturnValue(true),
      getDefaultBaseToken: vi.fn().mockReturnValue('envBase'),
    };
    client = {
      createRecord: vi.fn().mockResolvedValue({ recordId: 'rec123' }),
      updateRecord: vi.fn().mockResolvedValue(undefined),
    };
    engine = {
      buildContext: vi.fn().mockResolvedValue({ ctx: makeContext(), larkSyncId: 7n }),
      applyMapping: vi.fn().mockReturnValue({ 'TÊN KHÁCH': 'A' }),
    };
    mappingService = {
      getEnabledById: vi.fn().mockResolvedValue({
        id: 1n, categoryId: 7n, baseToken: null, tableId: 'tblX',
        fieldMap: { 'TÊN KHÁCH': 'tenKhach' }, enabled: true,
      }),
    };
    history = { recordResult: vi.fn().mockResolvedValue(undefined) };
    processor = new LarkSyncProcessor(
      prisma as never, tokenService as never, client as never,
      engine as never, mappingService as never, history as never,
    );
  });

  it('skip khi Lark sync disabled', async () => {
    tokenService.isEnabled.mockReturnValue(false);
    await processor.process(makeJob());
    expect(prisma.payment.findUnique).not.toHaveBeenCalled();
    expect(client.createRecord).not.toHaveBeenCalled();
  });

  it('update record khi payment da co larkRecordId (khong tao record lan 2)', async () => {
    prisma.payment.findUnique.mockResolvedValue({ id: 1n, orderId: 5n, larkRecordId: 'rec123' });
    await processor.process(makeJob());
    expect(client.createRecord).not.toHaveBeenCalled();
    expect(client.updateRecord).toHaveBeenCalledWith('envBase', 'tblX', 'rec123', { 'TÊN KHÁCH': 'A' });
  });

  it('skip khi don khong chon Lark Sync (larkSyncId null)', async () => {
    engine.buildContext.mockResolvedValue({ ctx: makeContext(), larkSyncId: null });
    await processor.process(makeJob());
    expect(client.createRecord).not.toHaveBeenCalled();
  });

  it('skip khi khong co mapping enabled cho Lark Sync da chon', async () => {
    mappingService.getEnabledById.mockResolvedValue(null);
    await processor.process(makeJob());
    expect(client.createRecord).not.toHaveBeenCalled();
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it('thanh cong: createRecord voi baseToken env (mapping null) + luu synced', async () => {
    await processor.process(makeJob());
    expect(client.createRecord).toHaveBeenCalledWith('envBase', 'tblX', { 'TÊN KHÁCH': 'A' });
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: expect.objectContaining({ larkRecordId: 'rec123', larkSyncedAt: expect.any(Date) }),
    });
  });

  it('mapping co baseToken rieng -> dung baseToken cua mapping', async () => {
    mappingService.getEnabledById.mockResolvedValue({
      id: 1n, categoryId: 7n, baseToken: 'customBase', tableId: 'tblY',
      fieldMap: {}, enabled: true,
    });
    await processor.process(makeJob());
    expect(client.createRecord).toHaveBeenCalledWith('customBase', 'tblY', expect.anything());
  });

  it('loi Lark API -> throw de BullMQ retry, KHONG set synced', async () => {
    client.createRecord.mockRejectedValue(new Error('Lark create-record HTTP 500'));
    await expect(processor.process(makeJob())).rejects.toThrow('HTTP 500');
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });
});
