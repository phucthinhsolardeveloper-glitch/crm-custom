import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RecallConfigService, assertLabelConfigAction } from '../recall-config.service';

// Sentinel object standing in for prisma.lead.fields.labelAssignedAt (Prisma
// field reference). The service must pass it through verbatim in the where
// clause so the DB compares the two columns row-by-row.
const LABEL_ASSIGNED_AT_FIELD_REF = { __fieldRef: 'labelAssignedAt' };

function buildPrismaMock() {
  return {
    labelRecallConfig: { findMany: vi.fn() },
    lead: {
      findMany: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      fields: { labelAssignedAt: LABEL_ASSIGNED_AT_FIELD_REF },
    },
    notification: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
}

function buildService(prisma: ReturnType<typeof buildPrismaMock>) {
  const cronRunService = { track: vi.fn() };
  return new RecallConfigService(prisma as never, cronRunService as never);
}

const NOTIFY_CONFIG = {
  id: 1n,
  labelId: 10n,
  recallMinutes: 1440, // 1 day -> content should humanize to "1 ngày"
  action: 'NOTIFY',
  isActive: true,
  label: { name: 'VIP' },
};

describe('_notifyLeadsByLabel', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: RecallConfigService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = buildService(prisma);
  });

  it('returns 0 and skips lead queries when no NOTIFY config exists', async () => {
    prisma.labelRecallConfig.findMany.mockResolvedValue([]);

    const result = await (service as never as { _notifyLeadsByLabel: () => Promise<number> })._notifyLeadsByLabel();

    expect(result).toBe(0);
    expect(prisma.labelRecallConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ action: 'NOTIFY', isActive: true }),
      }),
    );
    expect(prisma.lead.findMany).not.toHaveBeenCalled();
  });

  it('notifies assigned users once and marks labelNotifiedAt', async () => {
    prisma.labelRecallConfig.findMany.mockResolvedValue([NOTIFY_CONFIG]);
    const overdueLeads = [
      { id: 100n, name: 'Lead A', assignedUserId: 7n },
      { id: 101n, name: 'Lead B', assignedUserId: 8n },
    ];
    // First page returns leads (< chunk size, so the loop ends after one pass).
    prisma.lead.findMany.mockResolvedValueOnce(overdueLeads);

    const result = await (service as never as { _notifyLeadsByLabel: () => Promise<number> })._notifyLeadsByLabel();

    expect(result).toBe(2);

    // Idempotency lives in the query: only never-notified leads OR leads whose
    // label was re-assigned after the last notification are picked up.
    const where = prisma.lead.findMany.mock.calls[0][0].where;
    expect(where.labelId).toBe(10n);
    expect(where.assignedUserId).toEqual({ not: null });
    expect(where.OR).toEqual([
      { labelNotifiedAt: null },
      { labelNotifiedAt: { lt: LABEL_ASSIGNED_AT_FIELD_REF } },
    ]);

    // One createMany per chunk - no N+1.
    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
    const rows = prisma.notification.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      userId: 7n,
      type: 'LABEL_OVERDUE',
      entityType: 'LEAD',
      entityId: 100n,
      title: 'Nhãn "VIP" quá hạn',
    });
    expect(rows[0].content).toContain('Lead "Lead A"');
    expect(rows[0].content).toContain('1 ngày');

    // Mark happens AFTER notify and flips the OR condition off for next tick.
    expect(prisma.lead.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.lead.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [100n, 101n] } },
      data: { labelNotifiedAt: expect.any(Date) },
    });
    const createOrder = prisma.notification.createMany.mock.invocationCallOrder[0];
    const markOrder = prisma.lead.updateMany.mock.invocationCallOrder[0];
    expect(createOrder).toBeLessThan(markOrder);
  });

  it('does not re-notify on a second run once leads are marked (DB filters them out)', async () => {
    prisma.labelRecallConfig.findMany.mockResolvedValue([NOTIFY_CONFIG]);
    // Second run: every overdue lead already has labelNotifiedAt >= labelAssignedAt,
    // so the WHERE clause matches nothing.
    prisma.lead.findMany.mockResolvedValue([]);

    const result = await (service as never as { _notifyLeadsByLabel: () => Promise<number> })._notifyLeadsByLabel();

    expect(result).toBe(0);
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
    expect(prisma.lead.updateMany).not.toHaveBeenCalled();
  });

  it('paginates full chunks until the page comes back short', async () => {
    prisma.labelRecallConfig.findMany.mockResolvedValue([NOTIFY_CONFIG]);
    const fullChunk = Array.from({ length: 500 }, (_, i) => ({
      id: BigInt(i),
      name: `Lead ${i}`,
      assignedUserId: 7n,
    }));
    prisma.lead.findMany.mockResolvedValueOnce(fullChunk).mockResolvedValueOnce([
      { id: 999n, name: 'Last', assignedUserId: 7n },
    ]);

    const result = await (service as never as { _notifyLeadsByLabel: () => Promise<number> })._notifyLeadsByLabel();

    expect(result).toBe(501);
    expect(prisma.notification.createMany).toHaveBeenCalledTimes(2);
    expect(prisma.lead.updateMany).toHaveBeenCalledTimes(2);
  });
});

describe('assertLabelConfigAction', () => {
  it('accepts RECALL and NOTIFY', () => {
    expect(() => assertLabelConfigAction('RECALL')).not.toThrow();
    expect(() => assertLabelConfigAction('NOTIFY')).not.toThrow();
  });

  it('rejects anything else', () => {
    expect(() => assertLabelConfigAction('DELETE')).toThrow();
    expect(() => assertLabelConfigAction('')).toThrow();
    expect(() => assertLabelConfigAction('recall')).toThrow();
  });
});
