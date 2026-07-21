import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaClient, Prisma, UserRole, EntityType, ActivityType, PaymentStatus, TaskStatus } from '@prisma/client';
import { normalizePhone } from '@crm/utils';
import * as path from 'path';
import * as fs from 'fs';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerListQueryDto } from './dto/customer-list-query.dto';
import { CustomerPhonesService } from './customer-phones.service';
import { FileUploadService } from '../file-upload/file-upload.service';
import { buildAccessFilter, AccessFilterUser } from '../../common/filters/build-access-filter';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_TTL } from '../../common/cache/cache.constants';
import { computeDaysUntilBirthday } from './helpers/compute-days-until-birthday';
import type { RevenueByProductItem, RevenueByProductResponse } from './dto/revenue-by-product.dto';
import type { NextActionItem, NextActionsResponse } from './dto/next-actions.dto';

// Avatar upload limits (nhỏ hơn document 10MB do là ảnh đại diện).
const AVATAR_MAX_SIZE = 5 * 1024 * 1024;
const AVATAR_ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const CUSTOMER_SELECT = {
  id: true,
  phone: true,
  name: true,
  email: true,
  companyName: true,
  facebookUrl: true,
  instagramUrl: true,
  zaloUrl: true,
  linkedinUrl: true,
  addressProvinceCode: true,
  addressProvinceName: true,
  addressWardCode: true,
  addressWardName: true,
  addressStreet: true,
  shortDescription: true,
  description: true,
  aiRating: true,
  birthday: true,
  avatarUrl: true,
  totalSpent: true,
  currentTierId: true,
  assignedUserId: true,
  assignedDepartmentId: true,
  status: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  assignedUser: { select: { id: true, name: true } },
  assignedDepartment: { select: { id: true, name: true } },
  currentTier: { select: { id: true, name: true, slug: true, color: true, emoji: true, iconKey: true, minSpending: true } },
  labels: { include: { label: true } },
  // Needed for card grid display ("8 don" badge). Soft-delete aware.
  _count: { select: { orders: { where: { deletedAt: null } } } },
} satisfies Prisma.CustomerSelect;

const REVENUE_CACHE_KEY = (id: bigint | string) => `customer:revenue-by-product:${id}`;
const PINNED_NOTE_CAP = 5;
const TOP_PRODUCTS_LIMIT = 5;

type CurrentUser = AccessFilterUser;

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly customerPhonesService: CustomerPhonesService,
    private readonly cache: CacheService,
    private readonly fileUploadService: FileUploadService,
  ) {}

  async list(query: CustomerListQueryDto, user?: CurrentUser) {
    const limit = query.limit ?? 20;
    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      ...(user ? buildAccessFilter(user, 'customer') : {}),
    };

    if (query.status) where.status = query.status;
    if (query.departmentId) where.assignedDepartmentId = BigInt(query.departmentId);
    if (query.assignedUserId) where.assignedUserId = BigInt(query.assignedUserId);
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.labelId) {
      where.labels = { some: { labelId: BigInt(query.labelId) } };
    }
    if (query.minSpending !== undefined || query.maxSpending !== undefined) {
      if (
        query.minSpending !== undefined &&
        query.maxSpending !== undefined &&
        query.maxSpending < query.minSpending
      ) {
        throw new BadRequestException('maxSpending phải >= minSpending');
      }
      where.totalSpent = {
        ...(query.minSpending !== undefined ? { gte: query.minSpending } : {}),
        ...(query.maxSpending !== undefined ? { lte: query.maxSpending } : {}),
      };
    }
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo + 'T23:59:59.999Z') } : {}),
      };
    }

    // ── Cursor-based (backward compat) ───────────────────────────────────────
    if (query.cursor) {
      const customers = await this.prisma.customer.findMany({
        where, select: CUSTOMER_SELECT, orderBy: { id: 'desc' },
        take: limit + 1, skip: 1, cursor: { id: BigInt(query.cursor) },
      });
      const hasMore = customers.length > limit;
      const data = hasMore ? customers.slice(0, limit) : customers;
      return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
    }

    // ── Offset-based with total count ────────────────────────────────────────
    const page = query.page ?? 1;
    const [customers, total] = await Promise.all([
      this.prisma.customer.findMany({
        where, select: CUSTOMER_SELECT, orderBy: { id: 'desc' },
        take: limit, skip: (page - 1) * limit,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return {
      data: customers,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async searchByPhone(phone: string) {
    const normalized = normalizePhone(phone);

    // 1) Match số chính
    const primary = await this.prisma.customer.findMany({
      where: { phone: normalized, deletedAt: null },
      select: { id: true, phone: true, name: true, email: true, status: true },
    });

    // 2) Match số phụ → lấy customerId, exclude những id đã match số chính, fetch customer info
    const altPhones = await this.prisma.customerPhone.findMany({
      where: { phone: normalized, deletedAt: null },
      select: { customerId: true },
    });
    const altIds = altPhones
      .map(p => p.customerId)
      .filter(id => !primary.some(c => c.id === id));

    const fromAlt = altIds.length
      ? await this.prisma.customer.findMany({
          where: { id: { in: altIds }, deletedAt: null },
          select: { id: true, phone: true, name: true, email: true, status: true },
        })
      : [];

    // QĐ 3A: silent return - không phân biệt match số chính/phụ.
    return { data: [...primary, ...fromAlt].slice(0, 10) };
  }

  async findById(id: bigint, user?: CurrentUser, mode: 'read' | 'write' = 'read') {
    // IDOR prevention qua shared filter: SUPER_ADMIN/MANAGER thấy tất cả,
    // USER chỉ thấy KH assigned cho mình. LEADER: team khi đọc, self khi ghi (mode).
    const where: Prisma.CustomerWhereInput = {
      id,
      deletedAt: null,
      ...(user ? buildAccessFilter(user, 'customer', mode) : {}),
    };
    const customer = await this.prisma.customer.findFirst({
      where,
      select: {
        ...CUSTOMER_SELECT,
        leads: {
          where: { deletedAt: null },
          select: {
            id: true, status: true, createdAt: true,
            product: { select: { id: true, name: true } },
            label: { select: { id: true, name: true, color: true, textColor: true } },
          },
          take: 50,
        },
        orders: {
          where: { deletedAt: null },
          select: {
            id: true, status: true, totalAmount: true, createdAt: true,
            product: { select: { id: true, name: true } },
          },
          take: 50,
          orderBy: { createdAt: 'desc' },
        },
        phones: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: {
            leads: { where: { deletedAt: null } },
            orders: { where: { deletedAt: null } },
            phones: { where: { deletedAt: null } },
          },
        },
      },
    });
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');

    // Computed fields: daysUntilBirthday + lastContactAt từ activities mới nhất
    const lastActivity = await this.prisma.activity.findFirst({
      where: { entityType: EntityType.CUSTOMER, entityId: id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    // Phòng ban hiển thị ở sidebar: ưu tiên lead CONVERTED gần nhất có phòng ban,
    // nếu khách chưa có lead convert nào thì lấy lead gần nhất bất kỳ (vẫn cần có phòng ban).
    const leadDepartment = await this.resolveLeadDepartment(id);

    return {
      ...customer,
      daysUntilBirthday: computeDaysUntilBirthday(customer.birthday),
      lastContactAt: lastActivity?.createdAt ?? null,
      leadDepartment,
    };
  }

  async create(dto: CreateCustomerDto, user: CurrentUser) {
    const phone = normalizePhone(dto.phone);
    // Helper validates format AND deduplicates cross-table (số chính + phụ).
    await this.customerPhonesService.assertPhoneNotExists(phone);

    return this.prisma.customer.create({
      data: {
        phone,
        name: dto.name,
        email: dto.email,
        companyName: dto.companyName,
        facebookUrl: dto.facebookUrl,
        instagramUrl: dto.instagramUrl,
        zaloUrl: dto.zaloUrl,
        linkedinUrl: dto.linkedinUrl,
        shortDescription: dto.shortDescription,
        description: dto.description,
        birthday: dto.birthday ? new Date(dto.birthday) : null,
        ...(dto.assignedUserId ? { assignedUser: { connect: { id: BigInt(dto.assignedUserId) } } } : {}),
        ...(dto.assignedDepartmentId ? { assignedDepartment: { connect: { id: BigInt(dto.assignedDepartmentId) } } } : {}),
      },
      select: CUSTOMER_SELECT,
    });
  }

  async update(id: bigint, data: Record<string, unknown>, user: CurrentUser) {
    const customer = await this.findById(id, user, 'write');

    // Phone field-level permission: manager+ only
    if (data.phone && !([UserRole.SUPER_ADMIN, UserRole.MANAGER] as UserRole[]).includes(user.role)) {
      throw new ForbiddenException('Chỉ quản lý mới được sửa số điện thoại');
    }

    const updateData: Prisma.CustomerUpdateInput = {};
    if (data.name) updateData.name = data.name as string;
    if (data.email !== undefined) updateData.email = data.email as string | null;
    if (data.phone) {
      const phone = normalizePhone(data.phone as string);
      // Helper validates format AND dedupes cross-table, excluding chính KH này.
      await this.customerPhonesService.assertPhoneNotExists(phone, id);
      updateData.phone = phone;
    }
    if (data.companyName !== undefined) updateData.companyName = data.companyName as string | null;
    if (data.facebookUrl !== undefined) updateData.facebookUrl = data.facebookUrl as string | null;
    if (data.instagramUrl !== undefined) updateData.instagramUrl = data.instagramUrl as string | null;
    if (data.zaloUrl !== undefined) updateData.zaloUrl = data.zaloUrl as string | null;
    if (data.linkedinUrl !== undefined) updateData.linkedinUrl = data.linkedinUrl as string | null;
    if (data.addressProvinceCode !== undefined) updateData.addressProvinceCode = data.addressProvinceCode as string | null;
    if (data.addressProvinceName !== undefined) updateData.addressProvinceName = data.addressProvinceName as string | null;
    if (data.addressWardCode !== undefined) updateData.addressWardCode = data.addressWardCode as string | null;
    if (data.addressWardName !== undefined) updateData.addressWardName = data.addressWardName as string | null;
    if (data.addressStreet !== undefined) updateData.addressStreet = data.addressStreet as string | null;
    if (data.shortDescription !== undefined) updateData.shortDescription = data.shortDescription as string | null;
    if (data.description !== undefined) updateData.description = data.description as string | null;
    if (data.birthday !== undefined) {
      const raw = data.birthday as string | null;
      if (raw === null || raw === '') {
        updateData.birthday = null;
      } else if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
        updateData.birthday = new Date(raw);
      } else {
        throw new ConflictException('Birthday phải là chuỗi ngày ISO (YYYY-MM-DD)');
      }
    }

    return this.prisma.customer.update({ where: { id }, data: updateData, select: CUSTOMER_SELECT });
  }

  async claim(id: bigint, user: CurrentUser) {
    // Atomic claim: only if unassigned
    const result = await this.prisma.customer.updateMany({
      where: { id, assignedUserId: null, deletedAt: null, status: { in: ['ACTIVE', 'FLOATING'] } },
      data: {
        assignedUserId: user.id,
        assignedDepartmentId: user.departmentId,
        status: 'ACTIVE',
      },
    });
    if (result.count === 0) throw new ConflictException('Không thể claim khách hàng này');

    // Log assignment history
    await this.prisma.assignmentHistory.create({
      data: {
        entityType: 'CUSTOMER',
        entityId: id,
        toUserId: user.id,
        toDepartmentId: user.departmentId,
        assignedBy: user.id,
        reason: 'Tự claim',
      },
    });

    return this.findById(id);
  }

  async transfer(id: bigint, targetType: string, targetDeptId: string | null, user: CurrentUser) {
    const customer = await this.findById(id);

    // Permission check: assigned user, manager of dept, or super_admin
    await this.checkTransferPermission(customer, user);

    const updateData: Prisma.CustomerUpdateInput = {};
    let reason: string;

    switch (targetType) {
      case 'DEPARTMENT':
        if (!targetDeptId) throw new ConflictException('targetDeptId bắt buộc khi chuyển phòng ban');
        updateData.assignedUser = { disconnect: true };
        updateData.assignedDepartment = { connect: { id: BigInt(targetDeptId) } };
        updateData.status = 'ACTIVE';
        reason = 'Chuyển phòng ban';
        break;
      case 'FLOATING':
        updateData.assignedUser = { disconnect: true };
        updateData.assignedDepartment = { disconnect: true };
        updateData.status = 'FLOATING';
        reason = 'Chuyển kho thả nổi';
        break;
      case 'INACTIVE':
        updateData.assignedUser = { disconnect: true };
        updateData.status = 'INACTIVE';
        reason = 'Chăm sóc xong';
        break;
      default:
        throw new ConflictException('targetType không hợp lệ');
    }

    await this.prisma.customer.update({ where: { id }, data: updateData });

    await this.prisma.assignmentHistory.create({
      data: {
        entityType: 'CUSTOMER',
        entityId: id,
        fromUserId: customer.assignedUserId,
        fromDepartmentId: customer.assignedDepartmentId,
        toDepartmentId: targetDeptId ? BigInt(targetDeptId) : null,
        assignedBy: user.id,
        reason,
      },
    });

    return this.findById(id);
  }

  async reactivate(id: bigint, user: CurrentUser) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null, status: 'INACTIVE' },
    });
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng INACTIVE');

    return this.prisma.customer.update({
      where: { id },
      data: { status: 'ACTIVE' },
      select: CUSTOMER_SELECT,
    });
  }

  async softDelete(id: bigint) {
    await this.findById(id);
    return this.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Upload avatar cho customer. Cleanup file cũ nếu có.
   * Storage subdir: avatars/customer/{YYYY-MM}/{uuid}.{ext}
   * MIME validation: jpeg/png/webp 5MB max (defense in depth: multer + magic bytes).
   */
  async uploadAvatar(id: bigint, file: Express.Multer.File, user: CurrentUser) {
    if (!file) throw new BadRequestException('Vui lòng chọn ảnh');
    if (file.size > AVATAR_MAX_SIZE) {
      throw new BadRequestException('Ảnh vượt quá 5MB');
    }
    if (!AVATAR_ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException('Chỉ chấp nhận ảnh JPG, PNG, WebP');
    }

    // Access check + lấy avatar cũ để cleanup
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null, ...buildAccessFilter(user, 'customer', 'write') },
      select: { id: true, avatarUrl: true },
    });
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');

    // Save mới qua FileUploadService (UUID + magic bytes + secure path)
    const saved = await this.fileUploadService.saveFile(
      file.buffer,
      file.originalname,
      file.mimetype,
      'avatars/customer',
    );

    const newUrl = `/uploads/${saved.filePath}`;
    await this.prisma.customer.update({
      where: { id },
      data: { avatarUrl: newUrl },
    });

    // Cleanup file cũ - không block nếu fail (file đã bị xoá manual)
    this.unlinkAvatarSafe(customer.avatarUrl);

    return { avatarUrl: newUrl };
  }

  async removeAvatar(id: bigint, user: CurrentUser) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null, ...buildAccessFilter(user, 'customer', 'write') },
      select: { id: true, avatarUrl: true },
    });
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');

    await this.prisma.customer.update({
      where: { id },
      data: { avatarUrl: null },
    });
    this.unlinkAvatarSafe(customer.avatarUrl);
    return { ok: true };
  }

  /** Best-effort unlink. File system race / pre-deleted → log only, không throw. */
  private unlinkAvatarSafe(relativeUrl: string | null): void {
    if (!relativeUrl) return;
    try {
      // relativeUrl format: /uploads/avatars/customer/YYYY-MM/uuid.ext
      const trimmed = relativeUrl.replace(/^\/+/, '');
      const fullPath = path.resolve(process.cwd(), trimmed);
      // Guard: không cho phép path traversal ra ngoài uploads dir
      const uploadsRoot = path.resolve(process.cwd(), 'uploads');
      if (!fullPath.startsWith(uploadsRoot + path.sep) && fullPath !== uploadsRoot) return;
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch {
      // Swallow - cleanup không phải critical
    }
  }

  /** Bulk soft-delete. SA-only enforced at controller. */
  async bulkSoftDelete(ids: bigint[]): Promise<{ deleted: number; skipped: number }> {
    if (ids.length === 0) return { deleted: 0, skipped: 0 };
    const result = await this.prisma.customer.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return { deleted: result.count, skipped: ids.length - result.count };
  }

  /**
   * Doanh thu theo sản phẩm (top 5 + "Other" gộp). Cache 5 phút Redis.
   * Schema thực tế: 1 order = 1 product (orders.product_id), không có order_items.
   */
  async revenueByProduct(id: bigint, user?: CurrentUser): Promise<RevenueByProductResponse> {
    await this.findById(id, user); // ownership check + 404 handling
    return this.cache.getOrSet<RevenueByProductResponse>(
      REVENUE_CACHE_KEY(id.toString()),
      CACHE_TTL.MEDIUM,
      async () => this.computeRevenueByProduct(id),
    );
  }

  private async computeRevenueByProduct(id: bigint): Promise<RevenueByProductResponse> {
    // Aggregate revenue per product cho TẤT CẢ orders của KH (không filter status).
    // User intent: "có đơn là tính" - sale care velocity hơn certainty.
    const rows = await this.prisma.order.groupBy({
      by: ['productId'],
      where: {
        customerId: id,
        deletedAt: null,
      },
      _sum: { totalAmount: true },
      _count: { _all: true },
    });

    if (rows.length === 0) {
      return { products: [], totalRevenue: 0, deltaPercent: null };
    }

    // Resolve product names cho các productId không null
    const productIds = rows.map(r => r.productId).filter((p): p is bigint => p !== null);
    const products = productIds.length > 0
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true },
        })
      : [];
    const productNameMap = new Map(products.map(p => [p.id.toString(), p.name]));

    // Map rows → items + sort desc revenue
    const items = rows.map(r => ({
      productId: r.productId ? r.productId.toString() : null,
      name: r.productId
        ? productNameMap.get(r.productId.toString()) ?? 'Sản phẩm đã xoá'
        : 'Không gán sản phẩm',
      revenue: Number(r._sum.totalAmount ?? 0),
      orders: r._count._all,
    }));
    items.sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = items.reduce((sum, item) => sum + item.revenue, 0);

    // Top N + "Other" aggregate
    const top = items.slice(0, TOP_PRODUCTS_LIMIT);
    const rest = items.slice(TOP_PRODUCTS_LIMIT);
    const result: RevenueByProductItem[] = top.map(item => ({
      ...item,
      percent: totalRevenue > 0 ? (item.revenue / totalRevenue) * 100 : 0,
    }));

    if (rest.length > 0) {
      const otherRevenue = rest.reduce((sum, item) => sum + item.revenue, 0);
      const otherOrders = rest.reduce((sum, item) => sum + item.orders, 0);
      result.push({
        productId: null,
        name: `Khác (${rest.length} sản phẩm)`,
        revenue: otherRevenue,
        orders: otherOrders,
        percent: totalRevenue > 0 ? (otherRevenue / totalRevenue) * 100 : 0,
      });
    }

    const deltaPercent = await this.computeRevenueDeltaPercent(id);

    return { products: result, totalRevenue, deltaPercent };
  }

  /** So sánh doanh thu 3 tháng gần nhất với 3 tháng liền trước. */
  private async computeRevenueDeltaPercent(id: bigint): Promise<number | null> {
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());

    const [recent, previous] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          customerId: id, deletedAt: null,
          createdAt: { gte: threeMonthsAgo, lt: now },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: {
          customerId: id, deletedAt: null,
          createdAt: { gte: sixMonthsAgo, lt: threeMonthsAgo },
        },
        _sum: { totalAmount: true },
      }),
    ]);

    const recentRevenue = Number(recent._sum.totalAmount ?? 0);
    const previousRevenue = Number(previous._sum.totalAmount ?? 0);
    if (previousRevenue === 0) return null;
    return Math.round(((recentRevenue - previousRevenue) / previousRevenue) * 100);
  }

  /** N note gần nhất từ các lead đã liên kết với customer này. Mặc định 3. */
  async recentLeadNotes(id: bigint, user?: CurrentUser, limit = 3) {
    await this.findById(id, user);
    const leads = await this.prisma.lead.findMany({
      where: { customerId: id, deletedAt: null },
      select: { id: true },
    });
    const leadIds = leads.map((l) => l.id);
    if (leadIds.length === 0) return [];

    return this.prisma.activity.findMany({
      where: {
        entityType: EntityType.LEAD,
        entityId: { in: leadIds },
        type: ActivityType.NOTE,
        deletedAt: null,
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        entityId: true,
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 20),
    });
  }

  /** Note ghim của khách. Cap PINNED_NOTE_CAP ở FE display, BE trả về list đầy đủ. */
  async pinnedNotes(id: bigint, user?: CurrentUser) {
    await this.findById(id, user);
    return this.prisma.activity.findMany({
      where: {
        entityType: EntityType.CUSTOMER,
        entityId: id,
        type: ActivityType.NOTE,
        isPinned: true,
        deletedAt: null,
      },
      select: {
        id: true, content: true, createdAt: true, metadata: true,
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Action card: gộp task overdue + task hôm nay + payment pending của order thuộc KH. */
  async nextActions(id: bigint, user?: CurrentUser): Promise<NextActionsResponse> {
    await this.findById(id, user);
    const now = new Date();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const [overdueTasks, todayTasks, pendingPayments] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          entityType: EntityType.CUSTOMER,
          entityId: id,
          status: TaskStatus.PENDING,
          dueDate: { lt: now },
          deletedAt: null,
        },
        select: { id: true, title: true, dueDate: true },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),
      this.prisma.task.findMany({
        where: {
          entityType: EntityType.CUSTOMER,
          entityId: id,
          status: TaskStatus.PENDING,
          dueDate: { gte: now, lte: endOfToday },
          deletedAt: null,
        },
        select: { id: true, title: true, dueDate: true },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),
      this.prisma.payment.findMany({
        where: {
          status: PaymentStatus.PENDING,
          order: { customerId: id, deletedAt: null },
        },
        select: {
          id: true, amount: true, transferDate: true,
          order: { select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const formatMoney = (n: number) =>
      new Intl.NumberFormat('vi-VN').format(n) + ' VND';

    const items: NextActionItem[] = [
      ...overdueTasks.map(t => ({
        kind: 'OVERDUE_TASK' as const,
        refId: t.id.toString(),
        title: t.title,
        meta: t.dueDate ? `Quá hạn ${this.daysAgo(t.dueDate)}d` : 'Quá hạn',
        href: `/tasks/${t.id}`,
      })),
      ...todayTasks.map(t => ({
        kind: 'TODAY_TASK' as const,
        refId: t.id.toString(),
        title: t.title,
        meta: t.dueDate
          ? `Hôm nay ${t.dueDate.getHours().toString().padStart(2, '0')}:${t.dueDate.getMinutes().toString().padStart(2, '0')}`
          : 'Hôm nay',
        href: `/tasks/${t.id}`,
      })),
      ...pendingPayments.map(p => ({
        kind: 'PENDING_PAYMENT' as const,
        refId: p.id.toString(),
        title: `Chờ verify ${formatMoney(Number(p.amount))}`,
        meta: p.transferDate ? `CK ${p.transferDate.toLocaleDateString('vi-VN')}` : 'Chưa có ngày CK',
        href: `/orders/${p.order.id}`,
      })),
    ];

    return { items };
  }

  private daysAgo(date: Date): number {
    return Math.floor((Date.now() - date.getTime()) / 86400000);
  }

  /**
   * Phòng ban gắn với khách qua lead: ưu tiên lead CONVERTED gần nhất (theo createdAt),
   * fallback lead gần nhất bất kỳ. Chỉ xét lead có departmentId. Null nếu không có.
   */
  private async resolveLeadDepartment(
    customerId: bigint,
  ): Promise<{ id: bigint; name: string } | null> {
    const pick = async (onlyConverted: boolean) =>
      this.prisma.lead.findFirst({
        where: {
          customerId,
          deletedAt: null,
          departmentId: { not: null },
          ...(onlyConverted ? { status: 'CONVERTED' } : {}),
        },
        orderBy: { createdAt: 'desc' },
        select: { department: { select: { id: true, name: true } } },
      });

    const converted = await pick(true);
    if (converted?.department) return converted.department;
    const recent = await pick(false);
    return recent?.department ?? null;
  }

  /** Pin / unpin một note (activity type NOTE). Authorization: xem assertCanPinNote. */
  async pinNote(customerId: bigint, noteId: bigint, user: CurrentUser, pin: boolean) {
    await this.findById(customerId, user, 'write'); // ownership check (mutation -> self-scope LEADER)

    const note = await this.prisma.activity.findFirst({
      where: {
        id: noteId,
        entityType: EntityType.CUSTOMER,
        entityId: customerId,
        type: ActivityType.NOTE,
        deletedAt: null,
      },
      select: { id: true, userId: true, isPinned: true },
    });
    if (!note) throw new NotFoundException('Không tìm thấy note');

    await this.assertCanPinNote(note, user);

    return this.prisma.activity.update({
      where: { id: noteId },
      data: { isPinned: pin },
      select: { id: true, isPinned: true },
    });
  }

  /**
   * Quyết định ai được pin / unpin một note:
   * - Owner của note (note tự viết) được toggle pin của chính mình.
   * - MANAGER và SUPER_ADMIN được pin / unpin mọi note của KH (giúp highlight insight chéo team).
   * - USER khác (không phải owner) → ForbiddenException.
   */
  private async assertCanPinNote(
    note: { userId: bigint },
    user: CurrentUser,
  ): Promise<void> {
    if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.MANAGER) return;
    if (note.userId === user.id) return;
    throw new ForbiddenException('Bạn không có quyền ghim note này');
  }

  /** Invalidate revenue cache khi order liên quan customer thay đổi. */
  async invalidateRevenueCache(customerId: bigint | string): Promise<void> {
    await this.cache.del(REVENUE_CACHE_KEY(customerId.toString()));
  }

  private async checkTransferPermission(customer: Record<string, unknown>, user: CurrentUser) {
    if (user.role === UserRole.SUPER_ADMIN) return;
    if (customer.assignedUserId === user.id) return;
    if (user.role === UserRole.MANAGER) {
      // Manager can transfer unowned customers (no assignee)
      if (!customer.assignedUserId) return;
      // Check if manager manages the customer's department
      const deptId = customer.assignedDepartmentId as bigint | null;
      if (deptId) {
        const managed = await this.prisma.managerDepartment.findUnique({
          where: { managerId_departmentId: { managerId: user.id, departmentId: deptId } },
        });
        if (managed) return;
      }
    }
    throw new ForbiddenException('Không có quyền chuyển khách hàng này');
  }
}
