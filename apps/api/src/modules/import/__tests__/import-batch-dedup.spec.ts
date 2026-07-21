import { describe, expect, it, vi } from 'vitest';
import { CustomerPhonesService } from '../../customers/customer-phones.service';
import {
  ImportValidationService,
  LookupMaps,
  LeadPrefetch,
  leadComboKey,
} from '../import-validation.service';

/**
 * Test phần dedup theo lô (batch) thay cho N+1 query:
 * - findCustomersByPhones: gom tra SĐT bằng 2 query IN, số chính ưu tiên số phụ.
 * - validateLeadRow / validateCustomerRow: tra prefetch in-memory, không query DB.
 * - buildLeadPrefetch: dựng tập combo lead đã tồn tại.
 */

const PHONE_A = '0901234567';
const PHONE_B = '0902234567';
const PHONE_C = '0903234567';

const emptyLookups: LookupMaps = {
  groupMap: new Map(),
  productMap: new Map(),
  labelMap: new Map(),
};

describe('CustomerPhonesService.findCustomersByPhones (batch)', () => {
  it('gom số chính + số phụ, dedup, số chính uu tien', async () => {
    const prisma = {
      customer: { findMany: vi.fn().mockResolvedValue([{ id: 1n, phone: PHONE_A }]) },
      customerPhone: { findMany: vi.fn().mockResolvedValue([{ customerId: 2n, phone: PHONE_B }]) },
    };
    const svc = new CustomerPhonesService(prisma as never);

    const map = await svc.findCustomersByPhones([PHONE_A, PHONE_B, PHONE_C]);

    expect(map.get(PHONE_A)).toBe(1n);
    expect(map.get(PHONE_B)).toBe(2n);
    expect(map.has(PHONE_C)).toBe(false);
    // Số phụ chỉ tra phần CHƯA khớp số chính (PHONE_A đã khớp -> loại khỏi query 2).
    const altWhere = prisma.customerPhone.findMany.mock.calls[0][0].where.phone.in;
    expect(altWhere).not.toContain(PHONE_A);
    expect(altWhere).toContain(PHONE_B);
  });

  it('mảng rỗng -> không query DB', async () => {
    const prisma = {
      customer: { findMany: vi.fn() },
      customerPhone: { findMany: vi.fn() },
    };
    const svc = new CustomerPhonesService(prisma as never);
    const map = await svc.findCustomersByPhones([]);
    expect(map.size).toBe(0);
    expect(prisma.customer.findMany).not.toHaveBeenCalled();
  });
});

describe('ImportValidationService.validateLeadRow (prefetch in-memory)', () => {
  const svc = new ImportValidationService({} as never, {} as never);
  const blankPrefetch = (): LeadPrefetch => ({
    customerByPhone: new Map(),
    existingLeadCombos: new Set(),
  });

  it('không trùng -> valid', () => {
    const res = svc.validateLeadRow(
      { 'Số điện thoại': PHONE_A, 'Họ tên': 'A' },
      1,
      emptyLookups,
      blankPrefetch(),
    );
    expect(res.valid).toBe(true);
  });

  it('combo đã tồn tại trong tập prefetch -> báo trùng, không query DB', () => {
    const prefetch = blankPrefetch();
    prefetch.existingLeadCombos.add(leadComboKey(PHONE_A, null, null));
    const res = svc.validateLeadRow(
      { 'Số điện thoại': PHONE_A, 'Họ tên': 'A' },
      1,
      emptyLookups,
      prefetch,
    );
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.error).toContain('Trùng lead');
  });

  it('SĐT lỗi -> báo lỗi định dạng', () => {
    const res = svc.validateLeadRow({ 'Số điện thoại': 'abc' }, 1, emptyLookups, blankPrefetch());
    expect(res.valid).toBe(false);
  });

  it('có ghi nhóm nhưng không khớp -> valid kèm cảnh báo (vàng)', () => {
    const res = svc.validateLeadRow(
      { 'Số điện thoại': PHONE_A, 'Họ tên': 'A', 'Nhóm': 'Nguồn lạ XYZ' },
      1,
      emptyLookups,
      blankPrefetch(),
    );
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.warnings.some((w) => w.includes('Không tìm thấy nhóm'))).toBe(true);
    }
  });
});

describe('ImportValidationService.validateCustomerRow (prefetch in-memory)', () => {
  const svc = new ImportValidationService({} as never, {} as never);

  it('SĐT đã có trong tập existingPhones -> báo trùng', () => {
    const res = svc.validateCustomerRow(
      { 'Số điện thoại': PHONE_A, 'Họ tên': 'A' },
      1,
      emptyLookups,
      new Set([PHONE_A]),
    );
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.error).toContain('Trùng khách hàng');
  });

  it('SĐT chưa có -> valid', () => {
    const res = svc.validateCustomerRow(
      { 'Số điện thoại': PHONE_A, 'Họ tên': 'A' },
      1,
      emptyLookups,
      new Set(),
    );
    expect(res.valid).toBe(true);
  });
});

describe('ImportValidationService.buildLeadPrefetch (batch)', () => {
  it('dựng customerByPhone + tập combo lead đã tồn tại', async () => {
    const prisma = {
      lead: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ phone: PHONE_A, groupId: null, productId: null }]),
      },
    };
    const customerPhones = {
      findCustomersByPhones: vi.fn().mockResolvedValue(new Map([[PHONE_A, 5n]])),
    };
    const svc = new ImportValidationService(prisma as never, customerPhones as never);

    const pf = await svc.buildLeadPrefetch([PHONE_A, PHONE_B]);

    expect(pf.customerByPhone.get(PHONE_A)).toBe(5n);
    expect(pf.existingLeadCombos.has(leadComboKey(PHONE_A, null, null))).toBe(true);
    // query lead 1 lần với IN list (không per-row).
    expect(prisma.lead.findMany).toHaveBeenCalledTimes(1);
  });
});
