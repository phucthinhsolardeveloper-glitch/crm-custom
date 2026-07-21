import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildAccessFilter, AccessFilterUser } from '../../common/filters/build-access-filter';
import { LarkSyncService } from '../lark-sync/lark-sync.service';

type CurrentUser = AccessFilterUser;

/** Field sale nhập tay khi tạo/sửa 1 dòng hoàn tiền. Mọi field optional trừ amount. */
export interface RefundInput {
  customerName?: string;
  customerPhone?: string;
  productId?: bigint;
  productName?: string;
  productPrice?: number;
  vatRate?: number;
  groupName?: string;
  teamName?: string;
  refundDate?: Date;
  amount: number;
  refundMethod?: string;
  refundBank?: string;
  billImage?: string;
  notes?: string;
  larkSyncId?: bigint;
}

const REFUND_SELECT = {
  id: true, customerName: true, customerPhone: true,
  productId: true, productName: true, productPrice: true, vatRate: true,
  groupName: true, teamName: true, refundDate: true, amount: true,
  refundMethod: true, refundBank: true, billImage: true, notes: true, createdBy: true,
  larkSyncId: true, larkSyncedAt: true,
  createdAt: true, updatedAt: true,
  creator: { select: { id: true, name: true, team: { select: { id: true, name: true } } } },
} satisfies Prisma.RefundSelect;

@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly larkSync: LarkSyncService,
  ) {}

  async list(query: PaginationQueryDto & { search?: string }, user: CurrentUser) {
    const limit = query.limit ?? 20;
    const where: Prisma.RefundWhereInput = {
      deletedAt: null,
      ...buildAccessFilter(user, 'refund'),
    };
    if (query.search) {
      where.OR = [
        { customerName: { contains: query.search, mode: 'insensitive' } },
        { customerPhone: { contains: query.search } },
        { productName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const page = query.page ?? 1;
    const [rows, total] = await Promise.all([
      this.prisma.refund.findMany({
        where, select: REFUND_SELECT, orderBy: { id: 'desc' },
        take: limit, skip: (page - 1) * limit,
      }),
      this.prisma.refund.count({ where }),
    ]);
    return { data: rows, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async create(input: RefundInput, userId: bigint) {
    const refund = await this.prisma.refund.create({
      data: {
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        productId: input.productId,
        productName: input.productName,
        productPrice: input.productPrice,
        vatRate: input.vatRate,
        groupName: input.groupName,
        teamName: input.teamName,
        refundDate: input.refundDate,
        amount: input.amount,
        refundMethod: input.refundMethod,
        refundBank: input.refundBank,
        billImage: input.billImage,
        notes: input.notes,
        larkSyncId: input.larkSyncId,
        createdBy: userId,
      },
      select: REFUND_SELECT,
    });

    // Da chon duong ong -> do dong sang Lark (best-effort, loi khong chan tao dong).
    if (input.larkSyncId) {
      void this.larkSync.enqueueRefundSync(refund.id.toString(), 'create');
    }
    return refund;
  }

  async update(id: bigint, input: Partial<RefundInput>, user: CurrentUser) {
    // Scope ghi: MANAGER+ sửa mọi dòng; USER/LEADER chỉ dòng mình tạo.
    await this.findOwnedOrThrow(id, user);
    const refund = await this.prisma.refund.update({
      where: { id },
      data: {
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        productId: input.productId,
        productName: input.productName,
        productPrice: input.productPrice,
        vatRate: input.vatRate,
        groupName: input.groupName,
        teamName: input.teamName,
        refundDate: input.refundDate,
        amount: input.amount,
        refundMethod: input.refundMethod,
        refundBank: input.refundBank,
        billImage: input.billImage,
        notes: input.notes,
        larkSyncId: input.larkSyncId,
      },
      select: REFUND_SELECT,
    });

    // Con chon duong ong -> do/cap nhat lai record Lark (upsert theo larkRecordId).
    if (refund.larkSyncId) {
      void this.larkSync.enqueueRefundSync(refund.id.toString(), 'update');
    }
    return refund;
  }

  async softDelete(id: bigint, user: CurrentUser) {
    await this.findOwnedOrThrow(id, user);
    await this.prisma.refund.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /** Chặn IDOR: USER/LEADER chỉ chạm dòng mình tạo; MANAGER+ mọi dòng (buildAccessFilter trả {}). */
  private async findOwnedOrThrow(id: bigint, user: CurrentUser) {
    const row = await this.prisma.refund.findFirst({
      where: { id, deletedAt: null, ...buildAccessFilter(user, 'refund') },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy dòng hoàn tiền');
    return row;
  }
}
