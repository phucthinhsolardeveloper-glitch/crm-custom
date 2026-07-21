import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaClient, Prisma, OrderStatus, UserRole } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildAccessFilter, AccessFilterUser } from '../../common/filters/build-access-filter';
import { parseVnDateTime } from '../../common/utils/vn-timezone';
import { CacheService } from '../../common/cache/cache.service';
import { CustomerTierRecalcService } from '../customer-tiers/customer-tier-recalc.service';
import { PaymentsService } from '../payments/payments.service';
import { CustomerPhonesService } from '../customers/customer-phones.service';

/** Payment lồng trong request tạo đơn - tạo atomic cùng transaction với order.
 *  Không có vatAmount: VAT fix cứng theo vatRate của đơn, server tự tính. */
export interface OrderNestedPaymentInput {
  amount: number;
  transferDate: Date;
  paymentTypeId?: string;
  bankAccountId?: string;
  transferContent?: string;
  installmentId?: bigint;
  notes?: string;
}

type CurrentUser = AccessFilterUser;

const CUSTOMER_REVENUE_CACHE_KEY = (customerId: bigint | string) =>
  `customer:revenue-by-product:${customerId.toString()}`;

// Order chỉ còn 2 status. Mọi trạng thái tiền (huỷ/hoàn) dồn xuống Payment.
const ALLOWED_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['COMPLETED'],
  COMPLETED: [],
};

const ORDER_SELECT = {
  id: true, leadId: true, customerId: true, productId: true,
  amount: true, quantity: true, vatRate: true, vatAmount: true, totalAmount: true,
  status: true, notes: true, createdBy: true,
  companyName: true, taxCode: true, contactPerson: true,
  customerName: true, customerPhone: true, address: true,
  format: true, groupType: true, stt: true, courseCode: true,
  vatEmail: true, formatId: true, productGroupId: true,
  createdAt: true, updatedAt: true,
  lead: {
    select: {
      id: true, name: true, phone: true, status: true,
      source: { select: { id: true, name: true } },
      group: { select: { id: true, name: true } },
    },
  },
  customer: { select: { id: true, name: true, phone: true } },
  product: { select: { id: true, name: true, price: true } },
  creator: {
    select: {
      id: true, name: true,
      team: { select: { id: true, name: true } },
    },
  },
  orderFormat: { select: { id: true, name: true } },
  productGroup: { select: { id: true, name: true } },
  payments: {
    select: {
      id: true, amount: true, status: true, transferContent: true,
      transferDate: true, verifiedSource: true, verifiedAt: true, createdAt: true,
      paymentType: { select: { id: true, name: true } },
      bankAccount: { select: { id: true, name: true } },
      installment: { select: { id: true, name: true } },
      verifier: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.OrderSelect;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache: CacheService,
    private readonly tierRecalcService: CustomerTierRecalcService,
    private readonly paymentsService: PaymentsService,
    private readonly customerPhonesService: CustomerPhonesService,
  ) {}

  /** Invalidate customer revenue-by-product cache. Called on order mutations. */
  private async invalidateCustomerRevenue(customerId: bigint | null | undefined): Promise<void> {
    if (!customerId) return;
    await this.cache.del(CUSTOMER_REVENUE_CACHE_KEY(customerId));
  }

  async list(query: PaginationQueryDto & {
    status?: OrderStatus; customerId?: string; leadId?: string; createdByFilter?: bigint;
    search?: string; productId?: string; format?: string; groupType?: string;
    dateFrom?: string; dateTo?: string; formatId?: bigint; productGroupId?: bigint;
  }, user?: CurrentUser) {
    const limit = query.limit ?? 20;
    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
      ...(user ? buildAccessFilter(user, 'order') : {}),
    };
    if (query.status) where.status = query.status;
    if (query.customerId) where.customerId = BigInt(query.customerId);
    if (query.leadId) where.leadId = BigInt(query.leadId);
    if (query.createdByFilter) where.createdBy = query.createdByFilter;
    if (query.productId) where.productId = BigInt(query.productId);
    if (query.format) where.format = query.format;
    if (query.groupType) where.groupType = query.groupType;
    if (query.formatId) where.formatId = query.formatId;
    if (query.productGroupId) where.productGroupId = query.productGroupId;
    if (query.search) {
      where.OR = [
        { customerName: { contains: query.search, mode: 'insensitive' } },
        { customerPhone: { contains: query.search } },
        { courseCode: { contains: query.search, mode: 'insensitive' } },
        { customer: { name: { contains: query.search, mode: 'insensitive' } } },
        { customer: { phone: { contains: query.search } } },
      ];
    }
    if (query.dateFrom || query.dateTo) {
      // Ho tro 2 format, deu anchor theo gio Viet Nam (UTC+7):
      // - YYYY-MM-DD (date-only): mo rong dateTo den 23:59:59.999 cuoi ngay
      // - YYYY-MM-DDTHH:mm (datetime-local): dung dung moc gio phut da chon
      const dateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
      const gte = query.dateFrom ? parseVnDateTime(query.dateFrom) : undefined;
      const to = query.dateTo
        ? (dateOnly(query.dateTo) ? parseVnDateTime(`${query.dateTo}T23:59:59.999`) : parseVnDateTime(query.dateTo))
        : undefined;
      where.createdAt = {
        ...(gte ? { gte } : {}),
        ...(to ? { lte: to } : {}),
      };
    }

    // ── Cursor-based (backward compat) ───────────────────────────────────────
    if (query.cursor) {
      const orders = await this.prisma.order.findMany({
        where, select: ORDER_SELECT, orderBy: { id: 'desc' },
        take: limit + 1, skip: 1, cursor: { id: BigInt(query.cursor) },
      });
      const hasMore = orders.length > limit;
      const data = hasMore ? orders.slice(0, limit) : orders;
      return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
    }

    // ── Offset-based with total count ────────────────────────────────────────
    const page = query.page ?? 1;
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where, select: ORDER_SELECT, orderBy: { id: 'desc' },
        take: limit, skip: (page - 1) * limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      data: orders,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Tìm đơn theo id cho GHI (sửa/xoá/đổi status). Scope chặt qua buildAccessFilter:
   * MANAGER/SUPER_ADMIN thấy tất cả; USER/LEADER chỉ đơn mình tạo. Endpoint ghi còn khoá
   * @Roles(MANAGER+) nên USER/LEADER không tới được.
   */
  async findById(id: bigint, user?: CurrentUser) {
    const where: Prisma.OrderWhereInput = {
      id, deletedAt: null,
      ...(user ? buildAccessFilter(user, 'order') : {}),
    };
    const order = await this.prisma.order.findFirst({
      where, select: ORDER_SELECT,
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    return order;
  }

  /**
   * Đọc chi tiết đơn (GET /orders/:id) kèm full payment. Quyền XEM = đơn "liên quan" tới user:
   * - SUPER_ADMIN / MANAGER: xem mọi đơn.
   * - USER / LEADER: xem đơn nếu mình tạo đơn HOẶC đang giữ lead/khách của đơn HOẶC đã tạo
   *   payment nào đó thuộc đơn (VD: A tạo đơn + payment rồi chuyển lead cho B -> cả A lẫn B đều xem được).
   * KHÁC với findById (ghi): read cho phép người liên quan xem, không chỉ người tạo đơn.
   */
  async findByIdForRead(id: bigint, user: CurrentUser) {
    const where: Prisma.OrderWhereInput = { id, deletedAt: null };
    if (user.role === UserRole.LEADER && user.teamId != null) {
      // LEADER co team: xem don do thanh vien cung team tao (nhat quan voi danh sach).
      where.OR = [
        { createdBy: user.id },
        { creator: { teamId: user.teamId } },
        { lead: { assignedUserId: user.id } },
        { customer: { assignedUserId: user.id } },
        { payments: { some: { createdBy: user.id } } },
      ];
    } else if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.MANAGER) {
      where.OR = [
        { createdBy: user.id },
        { lead: { assignedUserId: user.id } },
        { customer: { assignedUserId: user.id } },
        { payments: { some: { createdBy: user.id } } },
      ];
    }
    const order = await this.prisma.order.findFirst({ where, select: ORDER_SELECT });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    return order;
  }

  /**
   * Tìm đơn CHƯA thu đủ tiền của 1 khách - phục vụ flow "Tạo đơn hàng" (chọn thêm TT hay tạo mới).
   * KHÔNG scope theo role: mọi sale phải thấy đơn tồn của khách để tránh tạo trùng đơn (đọc thuần,
   * cùng nguyên tắc open-trust read của lead/customer detail). "Chưa đủ" = SUM(VERIFIED+REJECTED) < totalAmount.
   */
  async findUnpaidOrderForCustomer(customerId: bigint) {
    const orders = await this.prisma.order.findMany({
      where: { customerId, deletedAt: null },
      select: ORDER_SELECT, orderBy: { id: 'desc' }, take: 50,
    });
    const paidReal = (o: (typeof orders)[number]) => o.payments
      .filter(p => p.status === 'VERIFIED' || p.status === 'REJECTED')
      .reduce((sum, p) => sum + Number(p.amount), 0);
    return orders.find(o => paidReal(o) < Number(o.totalAmount)) ?? null;
  }

  /**
   * Chặn tạo đơn sản phẩm P cho khách C khi C còn đơn cùng P CHƯA thanh toán xong.
   * "Chưa xong" = tồn tại đơn (cùng productId, chưa xoá mềm) mà
   * SUM(payment amount WHERE status IN VERIFIED,REJECTED) < order.totalAmount.
   * REJECTED tính vào (tiền có về, khách vẫn trả); PENDING chưa chắc chắn nên KHÔNG tính.
   * Vẫn cho tạo đơn sản phẩm khác + tạo lại đơn cùng SP đã trả đủ (mua lại).
   */
  private async assertNoUnpaidDuplicateOrder(customerId: bigint, productId: bigint): Promise<void> {
    const orders = await this.prisma.order.findMany({
      where: { customerId, productId, deletedAt: null },
      select: { id: true, totalAmount: true, product: { select: { name: true } } },
    });
    if (orders.length === 0) return;

    for (const order of orders) {
      const paid = await this.prisma.payment.aggregate({
        where: { orderId: order.id, status: { in: ['VERIFIED', 'REJECTED'] } },
        _sum: { amount: true },
      });
      const totalRealPaid = Number(paid._sum.amount || 0);
      if (totalRealPaid < Number(order.totalAmount)) {
        const productName = order.product?.name || 'này';
        throw new ConflictException(
          `Khách đã có đơn "${productName}" chưa thanh toán xong (đơn #${order.id}), không thể tạo đơn trùng.`,
        );
      }
    }
  }

  async create(data: {
    leadId?: string; customerId?: string; productId?: string;
    amount: number; quantity?: number; notes?: string;
    companyName?: string; taxCode?: string; contactPerson?: string;
    customerName?: string; customerPhone?: string; address?: string;
    format?: string; groupType?: string; stt?: string; courseCode?: string;
    vatEmail?: string; formatId?: bigint; productGroupId?: bigint; larkSyncId?: bigint;
    /** Payment tạo cùng đơn trong 1 transaction - payment fail thì rollback cả đơn,
     *  tránh đơn "mồ côi" không có thanh toán khi bước 2 lỗi. */
    payment?: OrderNestedPaymentInput;
  }, userId: bigint) {
    // Get product VAT rate if productId provided
    let vatRate = 0;
    if (data.productId) {
      const product = await this.prisma.product.findFirst({
        where: { id: BigInt(data.productId), deletedAt: null, isActive: true },
      });
      if (!product) throw new NotFoundException('Sản phẩm không tồn tại');
      vatRate = Number(product.vatRate);
    }

    // Auto-create customer from lead if no customerId
    let customerId = data.customerId ? BigInt(data.customerId) : null;
    if (!customerId && data.leadId) {
      const lead = await this.prisma.lead.findFirst({
        where: { id: BigInt(data.leadId), deletedAt: null },
        select: { id: true, phone: true, name: true, email: true, companyName: true, facebookUrl: true, instagramUrl: true, zaloUrl: true, linkedinUrl: true, customerId: true, assignedUserId: true, departmentId: true },
      });
      if (!lead) throw new NotFoundException('Lead không tồn tại');

      if (lead.customerId) {
        customerId = lead.customerId;
      } else {
        // Customer chỉ sinh ra tại đây (tạo đơn) - không còn tạo lúc tạo lead.
        // Dedup theo phone TRƯỚC: nếu SĐT đã thuộc customer khác thì dùng lại,
        // tránh 2 hồ sơ cùng SĐT. Không trùng mới create từ data lead.
        const dedup = await this.customerPhonesService.findCustomerByAnyPhone(lead.phone);
        if (dedup) {
          customerId = dedup.id;
        } else {
          const customer = await this.prisma.customer.create({
            data: {
              phone: lead.phone, name: lead.name, email: lead.email,
              companyName: lead.companyName, facebookUrl: lead.facebookUrl,
              instagramUrl: lead.instagramUrl, zaloUrl: lead.zaloUrl, linkedinUrl: lead.linkedinUrl,
              assignedUserId: lead.assignedUserId, assignedDepartmentId: lead.departmentId,
            },
          });
          customerId = customer.id;
        }
        // Link customer to lead + convert lead
        await this.prisma.lead.update({
          where: { id: lead.id },
          data: { customerId, status: 'CONVERTED' },
        });
      }
    }

    if (!customerId) throw new BadRequestException('Cần customerId hoặc leadId để tạo đơn hàng');

    // Chặn đơn trùng sản phẩm khi khách còn đơn cùng SP chưa thanh toán xong.
    if (data.productId) {
      await this.assertNoUnpaidDuplicateOrder(customerId, BigInt(data.productId));
    }

    const amount = data.amount;
    // So luong san pham (mac dinh 1). Tong tien don = don gia * so luong.
    const quantity = Math.max(1, Math.floor(Number(data.quantity) || 1));
    const totalAmount = amount * quantity;

    // Payment lồng: validate TRƯỚC khi ghi bất cứ thứ gì - fail sớm, không tạo đơn mồ côi.
    if (data.payment) {
      if (!Number.isFinite(data.payment.amount) || data.payment.amount <= 0) {
        throw new BadRequestException('Số tiền thanh toán phải lớn hơn 0');
      }
      if (!(data.payment.transferDate instanceof Date) || isNaN(data.payment.transferDate.getTime())) {
        throw new BadRequestException('Vui lòng nhập Ngày CK hợp lệ');
      }
      // Cho phép thu vượt tối đa 110% giá đơn (bù phí CK / làm tròn). Vượt hơn -> chặn.
      if (data.payment.amount > totalAmount * 1.1) {
        throw new BadRequestException('Số tiền thanh toán vượt quá 110% giá trị đơn hàng');
      }
    }

    // Giá SP đã bao gồm VAT -> tách phần VAT nằm trong tổng tiền; tổng đúng bằng đơn giá * số lượng, không cộng thêm.
    const vatAmount = Math.round(totalAmount * vatRate / (100 + vatRate));

    // Đơn + payment (nếu có) tạo trong CÙNG 1 transaction: payment fail -> rollback
    // cả đơn, user sửa lại form rồi bấm tạo lần nữa không bị chặn "đã có đơn trùng".
    const { order, payment } = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          amount, quantity, vatRate, vatAmount, totalAmount,
          notes: data.notes,
          companyName: data.companyName, taxCode: data.taxCode,
          contactPerson: data.contactPerson, customerName: data.customerName,
          customerPhone: data.customerPhone, address: data.address,
          format: data.format, groupType: data.groupType,
          stt: data.stt, courseCode: data.courseCode,
          vatEmail: data.vatEmail,
          ...(data.formatId ? { orderFormat: { connect: { id: data.formatId } } } : {}),
          ...(data.productGroupId ? { productGroup: { connect: { id: data.productGroupId } } } : {}),
          // Duong ong Lark dich (do nhan vien chon) - quyet dinh payment day ve bang nao
          ...(data.larkSyncId ? { larkSyncMapping: { connect: { id: data.larkSyncId } } } : {}),
          customer: { connect: { id: customerId } },
          creator: { connect: { id: userId } },
          ...(data.leadId ? { lead: { connect: { id: BigInt(data.leadId) } } } : {}),
          ...(data.productId ? { product: { connect: { id: BigInt(data.productId) } } } : {}),
        },
        select: ORDER_SELECT,
      });

      let payment: { id: bigint } | null = null;
      if (data.payment) {
        // Không truyền user: đơn vừa tạo bởi chính userId nên IDOR check thừa.
        const created = await this.paymentsService.createPaymentInTx(tx, {
          orderId: order.id.toString(),
          amount: data.payment.amount,
          transferDate: data.payment.transferDate,
          paymentTypeId: data.payment.paymentTypeId,
          bankAccountId: data.payment.bankAccountId,
          transferContent: data.payment.transferContent,
          installmentId: data.payment.installmentId,
          notes: data.payment.notes,
        });
        payment = created.payment;
      }

      return { order, payment };
    });

    // Side effects của payment sau khi commit (match bank tx, activity, Lark sync).
    if (payment && data.payment) {
      await this.paymentsService.runPaymentPostCreate(
        payment,
        { leadId: data.leadId ? BigInt(data.leadId) : null, createdBy: userId },
        { amount: data.payment.amount, transferContent: data.payment.transferContent },
      );
    }

    // Log activity on lead timeline
    if (data.leadId) {
      await this.prisma.activity.create({
        data: {
          entityType: 'LEAD', entityId: BigInt(data.leadId), userId,
          type: 'NOTE',
          content: `Tạo đơn hàng #${order.id} - ${order.product?.name || ''} - ${totalAmount.toLocaleString('vi-VN')}₫`,
          metadata: { orderId: order.id.toString(), type: 'ORDER_CREATED' },
        },
      });
      await this.triggerLeadInProgress(BigInt(data.leadId), userId);
    }

    await this.invalidateCustomerRevenue(customerId);
    return order;
  }

  async updateStatus(id: bigint, newStatus: OrderStatus) {
    const order = await this.findById(id);
    const current = order.status as OrderStatus;

    if (!ALLOWED_ORDER_TRANSITIONS[current]?.includes(newStatus)) {
      throw new ConflictException(`Không thể chuyển từ ${current} sang ${newStatus}`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Guard predicate theo status hiện tại: 2 request đồng thời cùng đọc snapshot cũ
      // thì chỉ 1 cái update được, cái còn lại count=0 -> 409 (chống double-transition).
      const claimed = await tx.order.updateMany({
        where: { id, status: current, deletedAt: null },
        data: { status: newStatus },
      });
      if (claimed.count === 0) {
        throw new ConflictException(`Đơn hàng đã bị thay đổi trạng thái bởi thao tác khác`);
      }

      // Không còn cascade order -> payment. Huỷ/hoàn tiền giờ là hành động trên từng
      // Payment (cancel/refund), vì trạng thái tiền đã dồn hẳn xuống cấp Payment.
      return tx.order.findFirstOrThrow({ where: { id }, select: ORDER_SELECT });
    });

    await this.invalidateCustomerRevenue(updated.customerId);
    return updated;
  }

  /**
   * Sửa thông tin đơn hàng (MANAGER+). Đổi sản phẩm/giá -> tính lại VAT + tổng theo
   * vatRate của sản phẩm hiện hành. Tỉ lệ TT (completionRate) lấy giá SP thuần (amount)
   * làm mẫu số nên đổi giá phải snapshot lại completionRate cho mọi payment của đơn.
   */
  async update(id: bigint, data: {
    productId?: string; amount?: number; notes?: string;
    companyName?: string; taxCode?: string; contactPerson?: string;
    customerName?: string; customerPhone?: string; address?: string;
    stt?: string; courseCode?: string; vatEmail?: string;
    formatId?: bigint; productGroupId?: bigint;
  }, user: CurrentUser) {
    // Write-scope qua findById(user): MANAGER/SUPER_ADMIN thấy tất cả, guard endpoint
    // đã loại LEADER/USER khỏi thao tác sửa đơn.
    const order = await this.findById(id, user);

    // Đổi sản phẩm -> lấy vatRate mới; không đổi thì giữ vatRate cũ của đơn.
    let vatRate = Number(order.vatRate);
    let productId: bigint | undefined;
    if (data.productId !== undefined) {
      const product = await this.prisma.product.findFirst({
        where: { id: BigInt(data.productId), deletedAt: null },
        select: { id: true, vatRate: true },
      });
      if (!product) throw new NotFoundException('Sản phẩm không tồn tại');
      vatRate = Number(product.vatRate);
      productId = product.id;
    }

    // Giá đơn mới (hoặc giữ cũ) -> tính lại VAT + tổng theo vatRate hiện hành.
    const amount = data.amount !== undefined ? data.amount : Number(order.amount);
    if (amount <= 0) throw new BadRequestException('Giá đơn phải là số dương');
    // So luong giu nguyen theo don (form sua don khong doi so luong). Tong = don gia * so luong.
    const quantity = Math.max(1, Math.floor(Number(order.quantity) || 1));
    const totalAmount = amount * quantity;
    // Giá SP đã bao gồm VAT -> tách phần VAT nằm trong tổng; tổng đúng bằng đơn giá * số lượng, không cộng thêm.
    const vatAmount = Math.round((totalAmount * vatRate) / (100 + vatRate));

    // Guard: tổng tiền đã/đang thu (loại REFUNDED + CANCELLED) không được vượt tổng mới.
    const paid = await this.prisma.payment.aggregate({
      where: { orderId: id, status: { notIn: ['REFUNDED', 'CANCELLED'] } },
      _sum: { amount: true },
    });
    const paidTotal = Number(paid._sum.amount || 0);
    if (paidTotal > totalAmount) {
      throw new ConflictException(
        `Giá đơn mới (${totalAmount.toLocaleString('vi-VN')}₫) nhỏ hơn tổng đã thanh toán (${paidTotal.toLocaleString('vi-VN')}₫)`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: {
          amount, vatRate, vatAmount, totalAmount,
          ...(productId !== undefined ? { product: { connect: { id: productId } } } : {}),
          ...(data.formatId !== undefined ? { orderFormat: { connect: { id: data.formatId } } } : {}),
          ...(data.productGroupId !== undefined ? { productGroup: { connect: { id: data.productGroupId } } } : {}),
          ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
          ...(data.companyName !== undefined ? { companyName: data.companyName || null } : {}),
          ...(data.taxCode !== undefined ? { taxCode: data.taxCode || null } : {}),
          ...(data.contactPerson !== undefined ? { contactPerson: data.contactPerson || null } : {}),
          ...(data.customerName !== undefined ? { customerName: data.customerName || null } : {}),
          ...(data.customerPhone !== undefined ? { customerPhone: data.customerPhone || null } : {}),
          ...(data.address !== undefined ? { address: data.address || null } : {}),
          ...(data.vatEmail !== undefined ? { vatEmail: data.vatEmail || null } : {}),
          ...(data.stt !== undefined ? { stt: data.stt || null } : {}),
          ...(data.courseCode !== undefined ? { courseCode: data.courseCode || null } : {}),
        },
      });

      // Snapshot lại completionRate: cộng dồn theo thứ tự tạo (id asc), loại
      // REFUNDED + CANCELLED khỏi tử số; mẫu số = tổng tiền đơn (đơn giá * số lượng).
      // Đồng thời tính lại vatAmount từng payment theo vatRate MỚI (đổi SP -> đổi VAT).
      const payments = await tx.payment.findMany({
        where: { orderId: id }, orderBy: { id: 'asc' },
        select: { id: true, amount: true, status: true },
      });
      let running = 0;
      for (const p of payments) {
        if (p.status !== 'REFUNDED' && p.status !== 'CANCELLED') running += Number(p.amount);
        const rate = totalAmount > 0 ? Math.round((running / totalAmount) * 10000) / 100 : 0;
        const pVat = vatRate > 0
          ? Math.round(Number(p.amount) * vatRate / (100 + vatRate))
          : null;
        await tx.payment.update({ where: { id: p.id }, data: { completionRate: rate, vatAmount: pVat } });
      }

      return tx.order.findFirstOrThrow({ where: { id }, select: ORDER_SELECT });
    });

    await this.invalidateCustomerRevenue(updated.customerId);
    return updated;
  }

  async softDelete(id: bigint) {
    const order = await this.findById(id);
    const result = await this.prisma.order.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.invalidateCustomerRevenue(order.customerId);
    return result;
  }

  /** Bulk soft-delete - SA override mọi status. `skipped` = đã soft-delete trước đó. */
  async bulkSoftDelete(ids: bigint[]): Promise<{ deleted: number; skipped: number }> {
    if (ids.length === 0) return { deleted: 0, skipped: 0 };
    const affected = await this.prisma.order.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { customerId: true },
    });
    const result = await this.prisma.order.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    // Invalidate revenue cache cho mọi customer bị ảnh hưởng
    const uniqueCustomerIds = Array.from(new Set(affected.map(o => o.customerId.toString())));
    await Promise.all(uniqueCustomerIds.map(cid => this.invalidateCustomerRevenue(BigInt(cid))));
    return { deleted: result.count, skipped: ids.length - result.count };
  }

  private async triggerLeadInProgress(leadId: bigint, userId: bigint) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, status: 'ASSIGNED', deletedAt: null },
    });
    if (!lead) return;

    await this.prisma.lead.update({ where: { id: leadId }, data: { status: 'IN_PROGRESS' } });
    await this.prisma.activity.create({
      data: {
        entityType: 'LEAD', entityId: leadId, userId,
        type: 'STATUS_CHANGE',
        content: 'ASSIGNED → IN_PROGRESS (tự động khi tạo đơn hàng)',
        metadata: { fromStatus: 'ASSIGNED', toStatus: 'IN_PROGRESS', auto: true },
      },
    });
  }
}
