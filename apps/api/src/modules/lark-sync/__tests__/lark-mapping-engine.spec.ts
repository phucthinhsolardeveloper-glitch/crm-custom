import { describe, expect, it, vi } from 'vitest';
import { LarkMappingEngine } from '../lark-mapping-engine';
import { LARK_SYNC_PRESETS } from '../lark-sync.presets';
import { CRM_FIELD_CATALOG } from '../lark-field-catalog';
import type { LarkSyncContext } from '../lark-field-catalog';

/** Context day du moi nhanh - dung chung cho cac test preset. */
function fullContext(): LarkSyncContext {
  return {
    payment: {
      id: '42',
      amount: 5_000_000,
      transferDate: new Date('2026-06-10T03:00:00Z'),
      createdAt: new Date('2026-06-10T04:00:00Z'),
      transferContent: 'CK GD123',
      status: 'VERIFIED',
    },
    order: {
      totalAmount: 10_000_000,
      vatRate: 8,
      courseCode: 'K15',
      stt: '12',
      customerName: 'Nguyen Van A',
      customerPhone: '0901234567',
      address: 'Ha Noi',
      notes: 'ghi chu don',
      companyName: 'Cty ABC',
      taxCode: '0312345678',
      vatEmail: 'kt@abc.vn',
    },
    customer: { name: 'Khach Goc', phone: '0907654321' },
    product: { name: 'Khoa Zoom', price: 12_000_000 },
    productGroup: { name: 'Online' },
    orderFormat: { name: 'Zoom Live' },
    leadSource: { name: 'Facebook' },
    creator: { name: 'Sale 01' },
    team: { name: 'Team 1' },
    paymentType: { name: 'Chuyen khoan' },
    bankAccount: { name: 'VCB 999' },
    installment: { name: 'CK lan 1' },
    agg: { sequence: 1, paidTotal: 5_000_000 },
  };
}

// Engine khong cham prisma trong applyMapping -> fake rong du dung
const engine = new LarkMappingEngine({} as never);

describe('CRM_FIELD_CATALOG resolvers', () => {
  const ctx = fullContext();

  it('soTien = payment.amount (tien lan TT nay, khong phai tong don)', () => {
    expect(CRM_FIELD_CATALOG.soTien.resolve(ctx)).toBe(5_000_000);
  });

  it('soLanTT dang chu "Lần N"', () => {
    expect(CRM_FIELD_CATALOG.soLanTT.resolve(ctx)).toBe('Lần 1');
  });

  it('sttNgay them tien to "NGÀY " (cot ZOOM); null khi order.stt rong', () => {
    expect(CRM_FIELD_CATALOG.sttNgay.resolve(ctx)).toBe('NGÀY 12');
    const noStt = { ...ctx, order: { ...ctx.order, stt: null } };
    expect(CRM_FIELD_CATALOG.sttNgay.resolve(noStt)).toBeNull();
  });

  it('trangThaiPayment map nhan tieng Viet theo status payment', () => {
    expect(CRM_FIELD_CATALOG.trangThaiPayment.resolve(ctx)).toBe('Đã thanh toán');
    const pending = { ...ctx, payment: { ...ctx.payment, status: 'PENDING' as const } };
    expect(CRM_FIELD_CATALOG.trangThaiPayment.resolve(pending)).toBe('Chờ duyệt');
  });

  it('maPayment = payment.id dang chuoi (audit/chong trung)', () => {
    expect(CRM_FIELD_CATALOG.maPayment.resolve(ctx)).toBe('42');
  });

  it('tinhTrangTT cố định "Chưa thanh toán" (kế toán xác nhận qua cột riêng)', () => {
    expect(CRM_FIELD_CATALOG.tinhTrangTT.resolve(ctx)).toBe('Chưa thanh toán');
    const paid = { ...ctx, agg: { sequence: 2, paidTotal: 10_000_000 } };
    expect(CRM_FIELD_CATALOG.tinhTrangTT.resolve(paid)).toBe('Chưa thanh toán');
  });

  it('tenKhach/sdt uu tien snapshot tren order, fallback customer', () => {
    expect(CRM_FIELD_CATALOG.tenKhach.resolve(ctx)).toBe('Nguyen Van A');
    const noSnapshot = {
      ...ctx,
      order: { ...ctx.order, customerName: null, customerPhone: null },
    };
    expect(CRM_FIELD_CATALOG.tenKhach.resolve(noSnapshot)).toBe('Khach Goc');
    expect(CRM_FIELD_CATALOG.sdt.resolve(noSnapshot)).toBe('0907654321');
  });

  it('ngay/ngayTT uu tien transferDate, fallback createdAt', () => {
    expect(CRM_FIELD_CATALOG.ngay.resolve(ctx)).toEqual(new Date('2026-06-10T03:00:00Z'));
    const noTransfer = {
      ...ctx,
      payment: { ...ctx.payment, transferDate: null },
    };
    expect(CRM_FIELD_CATALOG.ngayTT.resolve(noTransfer)).toEqual(new Date('2026-06-10T04:00:00Z'));
  });
});

describe('buildContext - attribution nhan vien theo nguoi tao payment', () => {
  // Order do "Sale A" (id 1) tao; the hien tren order.creator.
  // Payment lan 2 do "Sale B" (id 2) tao; the hien tren payment.createdBy.
  function makePrisma(paymentCreatedBy: bigint | null, paymentUser: { name: string; team: { name: string } | null } | null) {
    return {
      payment: {
        findUnique: vi.fn().mockResolvedValue({
          id: 99n,
          orderId: 5n,
          createdBy: paymentCreatedBy,
          amount: 5_000_000,
          transferDate: null,
          createdAt: new Date('2026-06-10T04:00:00Z'),
          transferContent: null,
          status: 'PENDING',
          paymentType: null,
          bankAccount: null,
          installment: null,
          order: {
            totalAmount: 10_000_000, vatRate: 8, courseCode: null, stt: null,
            customerName: 'Khach', customerPhone: null, address: null, notes: null,
            companyName: null, taxCode: null, vatEmail: null,
            customer: null, product: null, productGroup: null, orderFormat: null,
            lead: null, larkSyncId: 7n,
            creator: { name: 'Sale A', team: { name: 'Team 1' } },
          },
        }),
        findMany: vi.fn().mockResolvedValue([{ id: 99n, amount: 5_000_000, status: 'PENDING' }]),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue(paymentUser),
      },
    };
  }

  it('payment.createdBy null (import/webhook) -> fallback nguoi tao don', async () => {
    const prisma = makePrisma(null, null);
    const eng = new LarkMappingEngine(prisma as never);
    const result = await eng.buildContext(99n);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(result?.ctx.creator?.name).toBe('Sale A');
    expect(result?.ctx.team?.name).toBe('Team 1');
  });

  it('payment do nguoi khac nguoi tao don tao -> hien ten nguoi tao payment', async () => {
    const prisma = makePrisma(2n, { name: 'Sale B', team: { name: 'Team 2' } });
    const eng = new LarkMappingEngine(prisma as never);
    const result = await eng.buildContext(99n);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 2n },
      select: { name: true, team: { select: { name: true } } },
    });
    expect(result?.ctx.creator?.name).toBe('Sale B');
    expect(result?.ctx.team?.name).toBe('Team 2');
  });
});

describe('applyMapping', () => {
  it('format dung kieu: date -> epoch ms, number -> number, string -> string', () => {
    const fields = engine.applyMapping(
      { 'NGÀY': 'ngay', 'DOANH THU': 'soTien', 'TÊN KHÁCH': 'tenKhach' },
      fullContext(),
    );
    expect(fields['NGÀY']).toBe(new Date('2026-06-10T03:00:00Z').getTime());
    expect(fields['DOANH THU']).toBe(5_000_000);
    expect(fields['TÊN KHÁCH']).toBe('Nguyen Van A');
  });

  it('bo cot khi gia tri null/undefined (Lark giu trong)', () => {
    const ctx = fullContext();
    ctx.productGroup = null;
    ctx.order.courseCode = null;
    const fields = engine.applyMapping({ 'NHÓM': 'nhomSP', 'KHOÁ': 'khoa' }, ctx);
    expect(fields).toEqual({});
  });

  it('bo qua catalogKey khong ton tai (khong throw)', () => {
    const fields = engine.applyMapping({ 'CỘT LẠ': 'khongTonTai', 'STT': 'stt' }, fullContext());
    expect(fields).toEqual({ 'STT': '12' });
  });

  describe('6 preset kenh: moi catalogKey hop le, output day du cot', () => {
    for (const preset of LARK_SYNC_PRESETS) {
      it(`preset "${preset.channelName}" (${preset.tableId})`, () => {
        // Moi value trong preset phai thuoc catalog
        for (const key of Object.values(preset.fieldMap)) {
          expect(CRM_FIELD_CATALOG[key], `catalogKey "${key}"`).toBeDefined();
        }
        // Context day du -> so cot output = so cot map
        const fields = engine.applyMapping(preset.fieldMap, fullContext());
        expect(Object.keys(fields)).toHaveLength(Object.keys(preset.fieldMap).length);
        // Cot doanh thu luon = payment.amount
        const revenueCol = Object.entries(preset.fieldMap).find(([, k]) => k === 'soTien')?.[0];
        expect(revenueCol).toBeDefined();
        expect(fields[revenueCol!]).toBe(5_000_000);
      });
    }
  });
});

describe('buildContextFromRefund', () => {
  const refundRow = {
    id: 7n,
    customerName: 'Khach Hoan',
    customerPhone: '0912000111',
    productName: 'Khoa X',
    productPrice: { toString: () => '9000000' }, // Decimal-like -> Number()
    vatRate: { toString: () => '8' },
    groupName: 'ZOOM PHỄU',
    teamName: 'TEAM TÂM',
    refundDate: new Date('2026-07-10T00:00:00Z'),
    amount: { toString: () => '3000000' },
    refundMethod: 'CK',
    refundBank: 'VIB 666 NTK',
    notes: 'ghi chu hoan',
    larkSyncId: 5n,
    creator: { name: 'Sale 09', team: { name: 'Team fallback' } },
  };

  function engineWith(row: unknown) {
    return new LarkMappingEngine({
      refund: { findUnique: vi.fn().mockResolvedValue(row) },
    } as never);
  }

  it('map field refund vao dung o context de tai dung catalog', async () => {
    const result = await engineWith(refundRow).buildContextFromRefund(7n);
    expect(result?.larkSyncId).toBe(5n);
    const c = result!.ctx;
    // Cac catalog key dung chung phai resolve dung tu refund.
    expect(CRM_FIELD_CATALOG.tenKhach.resolve(c)).toBe('Khach Hoan');
    expect(CRM_FIELD_CATALOG.soTien.resolve(c)).toBe(3_000_000);
    expect(CRM_FIELD_CATALOG.tenSP.resolve(c)).toBe('Khoa X');
    expect(CRM_FIELD_CATALOG.nhomSP.resolve(c)).toBe('ZOOM PHỄU');
    expect(CRM_FIELD_CATALOG.team.resolve(c)).toBe('TEAM TÂM');
    expect(CRM_FIELD_CATALOG.hinhThucTT.resolve(c)).toBe('CK');
    expect(CRM_FIELD_CATALOG.nganHang.resolve(c)).toBe('VIB 666 NTK');
  });

  it('team fallback ve team cua creator khi teamName rong', async () => {
    const result = await engineWith({ ...refundRow, teamName: null }).buildContextFromRefund(7n);
    expect(CRM_FIELD_CATALOG.team.resolve(result!.ctx)).toBe('Team fallback');
  });

  it('tra null khi refund khong ton tai', async () => {
    expect(await engineWith(null).buildContextFromRefund(7n)).toBeNull();
  });
});
