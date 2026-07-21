import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  CRM_FIELD_CATALOG,
  LarkSyncAgg,
  LarkSyncContext,
} from './lark-field-catalog';

/** Ket qua buildContext: context + larkSyncId (duong ong don da chon) de processor tra mapping. */
export interface LarkSyncContextResult {
  ctx: LarkSyncContext;
  larkSyncId: bigint | null;
}

/**
 * Engine anh xa generic: build context tu DB roi ap fieldMap (config DB)
 * de ra object fields gui sang Lark. KHONG hardcode theo bang nao.
 */
@Injectable()
export class LarkMappingEngine {
  private readonly logger = new Logger(LarkMappingEngine.name);

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Load fresh payment + toan bo quan he can cho catalog resolvers.
   * Tra null khi payment khong ton tai.
   */
  async buildContext(paymentId: bigint): Promise<LarkSyncContextResult | null> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        paymentType: { select: { name: true } },
        bankAccount: { select: { name: true } },
        installment: { select: { name: true } },
        order: {
          include: {
            customer: { select: { name: true, phone: true } },
            product: { select: { name: true, price: true } },
            productGroup: { select: { name: true } },
            orderFormat: { select: { name: true } },
            lead: { select: { source: { select: { name: true } } } },
            creator: { select: { name: true, team: { select: { name: true } } } },
          },
        },
      },
    });
    if (!payment) return null;

    const order = payment.order;
    const agg = await this.buildAgg(payment.orderId, paymentId);

    // Nguoi tao payment (nguoi bam CK lan nay) - co the khac nguoi tao don.
    // Null khi payment cu / import / webhook -> resolver fallback ve nguoi tao don.
    const paymentCreator =
      payment.createdBy != null
        ? await this.prisma.user.findUnique({
            where: { id: payment.createdBy },
            select: { name: true, team: { select: { name: true } } },
          })
        : null;

    const ctx: LarkSyncContext = {
      payment: {
        id: payment.id.toString(),
        amount: Number(payment.amount),
        transferDate: payment.transferDate,
        createdAt: payment.createdAt,
        transferContent: payment.transferContent,
        status: payment.status,
      },
      order: {
        totalAmount: Number(order.totalAmount),
        vatRate: Number(order.vatRate),
        courseCode: order.courseCode,
        stt: order.stt,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        address: order.address,
        notes: order.notes,
        companyName: order.companyName,
        taxCode: order.taxCode,
        vatEmail: order.vatEmail,
      },
      customer: order.customer,
      product: order.product
        ? { name: order.product.name, price: Number(order.product.price) }
        : null,
      productGroup: order.productGroup,
      orderFormat: order.orderFormat,
      leadSource: order.lead?.source ?? null,
      // Uu tien nguoi tao payment (nguoi bam CK lan nay); fallback nguoi tao don
      // cho payment cu/import/webhook khong co createdBy.
      creator: paymentCreator
        ? { name: paymentCreator.name }
        : order.creator
          ? { name: order.creator.name }
          : null,
      team: paymentCreator?.team ?? order.creator?.team ?? null,
      paymentType: payment.paymentType,
      bankAccount: payment.bankAccount,
      installment: payment.installment,
      agg,
    };

    // Uu tien bang cua payment (neu chon rieng), khong thi fallback bang cua don.
    return { ctx, larkSyncId: payment.larkSyncId ?? order.larkSyncId ?? null };
  }

  /**
   * Build context tu 1 dong Refund (dien tay) de tai dung nguyen catalog + fieldMap.
   * Map field refund vao dung cac o context ma catalog key da resolve (tenKhach, sdt,
   * soTien, ngay, team, nhomSP, hinhThucTT, nganHang, ghiChu...). Cot payment-only
   * (soLanTT, maGD, phanLoaiTT...) khong co du lieu -> resolver tra null -> Lark bo trong.
   * Tra null khi refund khong ton tai.
   */
  async buildContextFromRefund(refundId: bigint): Promise<LarkSyncContextResult | null> {
    const refund = await this.prisma.refund.findUnique({
      where: { id: refundId },
      include: { creator: { select: { name: true, team: { select: { name: true } } } } },
    });
    if (!refund) return null;

    const ctx: LarkSyncContext = {
      payment: {
        id: refund.id.toString(),
        amount: Number(refund.amount),
        transferDate: refund.refundDate,
        createdAt: refund.createdAt,
        transferContent: null,
        status: 'REFUNDED',
      },
      order: {
        totalAmount: Number(refund.amount),
        vatRate: refund.vatRate != null ? Number(refund.vatRate) : 0,
        courseCode: null,
        stt: null,
        customerName: refund.customerName,
        customerPhone: refund.customerPhone,
        address: null,
        notes: refund.notes,
        companyName: null,
        taxCode: null,
        vatEmail: null,
      },
      customer: refund.customerName
        ? { name: refund.customerName, phone: refund.customerPhone ?? '' }
        : null,
      product:
        refund.productName != null
          ? { name: refund.productName, price: refund.productPrice != null ? Number(refund.productPrice) : 0 }
          : null,
      // groupName/teamName la chuoi tu do -> nhet vao o productGroup/team de khop catalog nhomSP/team.
      productGroup: refund.groupName ? { name: refund.groupName } : null,
      orderFormat: null,
      leadSource: null,
      creator: refund.creator ? { name: refund.creator.name } : null,
      team: refund.teamName ? { name: refund.teamName } : (refund.creator?.team ?? null),
      // refundMethod/refundBank -> hinhThucTT/nganHang.
      paymentType: refund.refundMethod ? { name: refund.refundMethod } : null,
      bankAccount: refund.refundBank ? { name: refund.refundBank } : null,
      installment: null,
      agg: { sequence: 1, paidTotal: Number(refund.amount) },
    };

    return { ctx, larkSyncId: refund.larkSyncId };
  }

  /**
   * Ap fieldMap config { "Cot Lark": "catalogKey" } len context.
   * - catalogKey khong ton tai -> warn + bo qua (da validate o DTO, day la lop chot).
   * - Gia tri null/undefined -> khong gui cot do (Lark giu trong).
   * - Format theo type: date -> epoch ms, number -> number, string -> string.
   */
  applyMapping(
    fieldMap: Record<string, string>,
    ctx: LarkSyncContext,
  ): Record<string, unknown> {
    const fields: Record<string, unknown> = {};
    for (const [larkCol, catalogKey] of Object.entries(fieldMap)) {
      const entry = CRM_FIELD_CATALOG[catalogKey];
      if (!entry) {
        this.logger.warn(`Bo qua catalogKey khong ton tai: ${catalogKey} (cot "${larkCol}")`);
        continue;
      }
      const raw = entry.resolve(ctx);
      if (raw === null || raw === undefined) continue;

      if (entry.type === 'date') {
        const date = raw instanceof Date ? raw : new Date(raw as string);
        if (Number.isNaN(date.getTime())) continue;
        fields[larkCol] = date.getTime();
      } else if (entry.type === 'number') {
        const num = Number(raw);
        if (Number.isNaN(num)) continue;
        fields[larkCol] = num;
      } else {
        fields[larkCol] = String(raw);
      }
    }
    return fields;
  }

  /**
   * Aggregate cac lan thanh toan cua order:
   * - sequence: vi tri payment nay theo thu tu tao (1-based) -> "Lần N".
   *   Dem ca PENDING (gom REFUNDED/CANCELLED bo ra) de payment vua tao (PENDING)
   *   van co mat trong list -> sequence dung. enqueuePaymentSync goi luc create (PENDING).
   * - paidTotal: tong tien thuc thu = chi VERIFIED + REJECTED (tien co ve).
   *   Loai PENDING (chua duyet), REFUNDED + CANCELLED (tra lai / khong ve).
   */
  private async buildAgg(orderId: bigint, paymentId: bigint): Promise<LarkSyncAgg> {
    const payments = await this.prisma.payment.findMany({
      where: { orderId, status: { notIn: ['REFUNDED', 'CANCELLED'] } },
      select: { id: true, amount: true, status: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const index = payments.findIndex((p) => p.id === paymentId);
    const paidTotal = payments
      .filter((p) => p.status === 'VERIFIED' || p.status === 'REJECTED')
      .reduce((sum, p) => sum + Number(p.amount), 0);
    return { sequence: index >= 0 ? index + 1 : payments.length + 1, paidTotal };
  }
}
