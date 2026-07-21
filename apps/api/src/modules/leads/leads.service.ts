import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaClient, Prisma, LeadStatus, UserRole } from '@prisma/client';
import { stringify } from 'csv-stringify/sync';
import { normalizePhone, isValidVNPhone, sanitizeCsvRow } from '@crm/utils';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadListQueryDto, AssignmentFilter, LeadSortField } from './dto/lead-list-query.dto';
import { PoolListQueryDto } from './dto/pool-list-query.dto';
import { CustomerPhonesService } from '../customers/customer-phones.service';
import { buildAccessFilter, AccessFilterUser } from '../../common/filters/build-access-filter';
import { EVENT_NAMES } from '../../common/event-bus/event-catalog';
import { SYSTEM_ACTOR, type ActorContext } from '../../common/event-bus/system-actor';
import { NotificationsService } from '../notifications/notifications.service';
import { LeadFieldDefinitionsService } from '../lead-field-definitions/lead-field-definitions.service';

// Valid status transitions
const ALLOWED_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  POOL: ['IN_PROGRESS', 'FLOATING'],
  ZOOM: ['IN_PROGRESS', 'POOL', 'FLOATING'],
  ASSIGNED: ['IN_PROGRESS', 'POOL', 'FLOATING'], // legacy, assign now goes directly to IN_PROGRESS
  IN_PROGRESS: ['CONVERTED', 'LOST', 'POOL', 'FLOATING'],
  CONVERTED: [], // terminal
  LOST: ['FLOATING'],
  FLOATING: ['IN_PROGRESS'], // claim → auto IN_PROGRESS
};

// Nhãn tiếng Việt cho status khi xuất CSV (người dùng cuối đọc, không phải enum raw).
const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  POOL: 'Kho mới',
  ZOOM: 'Zoom',
  ASSIGNED: 'Đã gán',
  IN_PROGRESS: 'Đang xử lý',
  CONVERTED: 'Đã chuyển đổi',
  LOST: 'Thất bại',
  FLOATING: 'Thả nổi',
};

// Format Date sang giờ VN (UTC+7) dạng DD/MM/YYYY HH:mm cho CSV.
function formatVnDateTime(d: Date | null): string {
  if (!d) return '';
  // en-GB cho thứ tự DD/MM/YYYY; ép timeZone Asia/Ho_Chi_Minh để đúng giờ VN.
  return d.toLocaleString('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(',', '');
}

const LEAD_SELECT = {
  id: true, phone: true, name: true, email: true, status: true,
  companyName: true, facebookUrl: true, instagramUrl: true, zaloUrl: true, linkedinUrl: true,
  customerId: true, productId: true, sourceId: true, groupId: true,
  assignedUserId: true, departmentId: true,
  labelId: true, labelAssignedAt: true,
  // lastAssignedAt: timestamp lần phân lead gần nhất (auto-set bởi trigger
  // on assignment_history). Cần thiết cho FE render cột "Phân cho" với
  // relative time (ví dụ "Mai Nguyễn (2h)"). Trước đó bị thiếu select -> FE
  // không có data để render -> cột luôn hiển thị "-" dù assignedUser tồn tại.
  lastAssignedAt: true,
  metadata: true, createdAt: true, updatedAt: true,
  customer: { select: { id: true, name: true, phone: true } },
  product: { select: { id: true, name: true, price: true } },
  source: { select: { id: true, name: true } },
  group: { select: { id: true, name: true } },
  assignedUser: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  label: { select: { id: true, name: true, color: true, textColor: true, category: true } },
  orders: {
    where: { deletedAt: null },
    select: {
      id: true, status: true, totalAmount: true,
      product: { select: { name: true } },
      payments: { select: { id: true, amount: true, status: true, transferContent: true, createdAt: true, paymentType: { select: { name: true } } } },
    },
    orderBy: { id: 'desc' as const },
  },
} satisfies Prisma.LeadSelect;

type CurrentUser = AccessFilterUser;

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly customerPhonesService: CustomerPhonesService,
    private readonly eventEmitter: EventEmitter2,
    private readonly notifications: NotificationsService,
    private readonly leadFieldDefinitions: LeadFieldDefinitionsService,
  ) {}

  /**
   * Emit lead.assigned_user_changed semantic event for paths using updateMany.
   * Prisma extension only hooks `update` (single row with before/after). All assign
   * paths use updateMany for atomic status guard, so they need to emit explicitly.
   * Without this, downstream listeners (workflows, OmiCall sync) never fire.
   */
  private emitAssignedUserChanged(
    leadId: bigint,
    before: bigint | null,
    after: bigint | null,
    actor: ActorContext = SYSTEM_ACTOR,
  ): void {
    this.eventEmitter.emit(EVENT_NAMES.LEAD_ASSIGNED_USER_CHANGED, {
      type: EVENT_NAMES.LEAD_ASSIGNED_USER_CHANGED,
      leadId,
      before,
      after,
      actor,
      at: new Date(),
    });
  }

  /** Build ActorContext from CurrentUser for event payloads. */
  private actorOf(user: CurrentUser): ActorContext {
    return {
      id: user.id,
      role: user.role,
      departmentId: user.departmentId,
    };
  }

  // Shared filter builder. Status excluded - callers add it (list() takes from query, pool methods hardcode).
  private buildLeadFilterWhere(
    query: Partial<LeadListQueryDto>,
    user?: CurrentUser,
  ): Prisma.LeadWhereInput {
    const where: Prisma.LeadWhereInput = {
      deletedAt: null,
      ...(user ? buildAccessFilter(user, 'lead') : {}),
    };

    // Filter đa chọn: mỗi field là string[] (DTO normalize single -> array). Dùng `in` để
    // match bất kỳ giá trị nào trong tập. Guard theo `.length` (mảng rỗng = no-op).
    if (query.sourceId?.length) where.sourceId = { in: query.sourceId.map(BigInt) };
    if (query.groupId?.length) where.groupId = { in: query.groupId.map(BigInt) };
    if (query.productId?.length) where.productId = { in: query.productId.map(BigInt) };
    // assignedUserId override only for manager+ (USER role is auto-scoped via buildAccessFilter)
    if (query.assignedUserId?.length && (!user || user.role !== UserRole.USER)) {
      where.assignedUserId = { in: query.assignedUserId.map(BigInt) };
    }
    if (query.departmentId?.length) where.departmentId = { in: query.departmentId.map(BigInt) };
    // teamId qua relation assignedUser.teamId - CHỈ match lead có sale assigned.
    // Lead POOL/FLOATING/ZOOM chưa có sale sẽ không match (đã chốt trong plan).
    // LeadListQueryDto có teamId; PoolListQueryDto không có → query.teamId undefined → no-op.
    const teamIds = (query as LeadListQueryDto).teamId;
    if (teamIds?.length) {
      where.assignedUser = { teamId: { in: teamIds.map(BigInt) } };
    }
    if (query.labelId?.length) where.labelId = { in: query.labelId.map(BigInt) };
    // hasOrder: match lead có/không order (mọi status: DRAFT, PENDING, COMPLETED, CANCELLED).
    // Khớp với badge "Đã mua" trong UI bảng (chỉ check orders.length > 0).
    // Đổi từ status=COMPLETED cũ (2026-05-19) - rationale: user thấy badge "Đã mua" + filter
    // "Đã mua" không nhất quán -> chọn semantic loose ("có đơn hàng bất kỳ").
    if (query.hasOrder === 'true') where.orders = { some: {} };
    if (query.hasOrder === 'false') where.orders = { none: {} };
    if (query.dateFrom || query.dateTo) {
      // FE (apps/web/src/lib/datetime-utc7.ts:30) gửi ISO UTC đầy đủ với giờ + phút
      // (vd 2026-05-21T16:59:00.000Z). KHÔNG append 'T23:59:59Z' nữa - làm chuỗi
      // thành 'YYYY-MM-DDTHH:mm:ss.sssZT23:59:59Z' → Invalid Date → Prisma sai.
      // End-of-day cover bởi FE (preset 'today' đã set to=23:59 local UTC+7).
      where.createdAt = {};
      if (query.dateFrom) (where.createdAt as any).gte = new Date(query.dateFrom);
      if (query.dateTo) (where.createdAt as any).lte = new Date(query.dateTo);
    }
    if (query.assignedFrom || query.assignedTo) {
      where.lastAssignedAt = {};
      if (query.assignedFrom) (where.lastAssignedAt as any).gte = new Date(query.assignedFrom);
      if (query.assignedTo) (where.lastAssignedAt as any).lte = new Date(query.assignedTo);
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  // Build orderBy động cho list endpoint. Default = createdAt desc + id desc
  // (lead mới tạo lên đầu).
  // Tie-breaker `id desc` LUÔN giữ - bảo đảm stable order khi 2 record cùng giá trị sort (vd bulk-assign cùng giây).
  // `lastAssignedAt` cần `{ sort, nulls: 'last' }` syntax vì cho phép null - các field khác null-safe nên dùng direction shorthand.
  private buildLeadOrderBy(sortBy?: LeadSortField, sortDir: 'asc' | 'desc' = 'desc'): Prisma.LeadOrderByWithRelationInput[] {
    if (!sortBy) {
      return [{ createdAt: 'desc' }, { id: 'desc' }];
    }
    if (sortBy === 'lastAssignedAt') {
      return [{ lastAssignedAt: { sort: sortDir, nulls: 'last' } }, { id: 'desc' }];
    }
    // name | createdAt | status - direction shorthand
    return [{ [sortBy]: sortDir } as Prisma.LeadOrderByWithRelationInput, { id: 'desc' }];
  }

  // Áp filter "động" (status array + assignment 3-state) - dùng chung list() và labelCounts().
  // Tách helper để DRY, đồng thời cho phép labelCounts strip labelId mà vẫn share logic này.
  //
  // RBAC guard: assignment 3-state ghi đè where.assignedUserId / where.departmentId
  // → CHỈ cho phép MANAGER+ dùng (USER role bị buildAccessFilter scope assignedUserId=user.id,
  //   nếu apply assignment sẽ leak lead user khác). Mirror pattern guard cho assignedUserId line 67.
  //
  // USER kho view: khi USER chọn filter "Chọn kho" (status toàn POOL/FLOATING),
  // bypass scope assignedUserId=user.id của buildAccessFilter và replace bằng scope kho:
  //   - POOL → status=POOL + departmentId=user.departmentId + assignedUserId=null (kho phòng ban)
  //   - FLOATING → status=FLOATING (mọi user thấy, không scope dept)
  // Combine qua OR. Nếu where đã có OR (search), bọc cả 2 OR vào AND.
  private applyDynamicFilters(
    where: Prisma.LeadWhereInput,
    query: Pick<LeadListQueryDto, 'status' | 'assignment'>,
    user?: CurrentUser,
  ): void {
    const statusList = query.status ?? [];
    const isUserKhoView =
      user?.role === UserRole.USER &&
      statusList.length > 0 &&
      statusList.every((s) => s === LeadStatus.POOL || s === LeadStatus.FLOATING);

    if (isUserKhoView) {
      // Strip personal scope (buildAccessFilter set assignedUserId=user.id).
      delete where.assignedUserId;

      const khoClauses: Prisma.LeadWhereInput[] = [];
      if (statusList.includes(LeadStatus.POOL)) {
        khoClauses.push({
          status: LeadStatus.POOL,
          departmentId: user.departmentId,
          assignedUserId: null,
        });
      }
      if (statusList.includes(LeadStatus.FLOATING)) {
        khoClauses.push({ status: LeadStatus.FLOATING });
      }

      // Merge với OR có sẵn (search): bọc vào AND để 2 nhóm OR phải đồng thời thoả.
      if (where.OR) {
        where.AND = [{ OR: where.OR as Prisma.LeadWhereInput[] }, { OR: khoClauses }];
        delete where.OR;
      } else {
        where.OR = khoClauses;
      }
      // Skip normal status/assignment - kho view đã xử lý status.
      return;
    }

    // Trang /leads LUÔN loại lead Kho Zoom (status=ZOOM) khỏi mọi bộ lọc thường
    // (danh sách + đếm nhãn + xuất CSV). Zoom đi theo luồng phân phối riêng
    // (distribute-zoom) nên không được trộn vào bất kỳ view lọc nào.
    // NGOẠI LỆ duy nhất: xem đúng view Kho Zoom - chọn DUY NHẤT status=ZOOM
    // (vào từ menu Kho Zoom → /leads?status=ZOOM). Khi đó vẫn cho lọc trong phạm vi Zoom.
    // Nếu status chọn kèm giá trị khác (mixed), Zoom bị strip khỏi tập -> vẫn loại Zoom.
    const isZoomOnlyView =
      statusList.length === 1 && statusList[0] === LeadStatus.ZOOM;
    if (isZoomOnlyView) {
      where.status = LeadStatus.ZOOM;
    } else {
      const nonZoomStatuses = statusList.filter((s) => s !== LeadStatus.ZOOM);
      where.status = nonZoomStatuses.length
        ? { in: nonZoomStatuses }
        : { not: LeadStatus.ZOOM };
    }

    const canUseAssignment = !user || user.role !== UserRole.USER;
    if (query.assignment && canUseAssignment) {
      if (query.assignment === AssignmentFilter.UNASSIGNED) {
        where.assignedUserId = null;
        where.departmentId = null;
      } else if (query.assignment === AssignmentFilter.DEPT) {
        where.assignedUserId = null;
        where.departmentId = { not: null };
      } else if (query.assignment === AssignmentFilter.USER) {
        // Giữ filter assignedUserId cụ thể nếu đã set ở buildLeadFilterWhere ({ in: [...] }
        // tự loại null nên đã thoả "đã gán"). Chỉ ép "not null" khi chưa chọn user nào.
        if (where.assignedUserId == null) {
          where.assignedUserId = { not: null };
        }
      }
    }
  }

  // ── List with filters + role-based access ────────────────────────────────
  async list(query: LeadListQueryDto, user?: CurrentUser) {
    const limit = query.limit ?? 10;
    const where = this.buildLeadFilterWhere(query, user);
    this.applyDynamicFilters(where, query, user);

    // Lọc "chỉ lead trùng SĐT": ép where.phone vào tập SĐT xuất hiện ở 2+ lead chưa xóa.
    // Đặt ở đây (không trong buildLeadFilterWhere) để cả 2 nhánh cursor + offset dùng chung
    // -> count() + phân trang vẫn đúng. Tập rỗng -> ép id=-1 cho kết quả rỗng.
    if (query.duplicatesOnly === 'true') {
      const dupPhones = await this.findDuplicatePhones();
      if (dupPhones.length === 0) {
        where.id = BigInt(-1);
      } else {
        where.phone = { in: dupPhones };
      }
    } else if (query.nonDuplicatesOnly === 'true') {
      // Nghịch đảo: chỉ giữ lead có SĐT KHÔNG nằm trong tập trùng.
      // Tập rỗng -> mọi lead đều không trùng -> không thêm điều kiện. Lead phone null
      // bị loại bởi notIn (SQL NOT IN với NULL trả unknown) - chấp nhận vì lead luôn có SĐT.
      const dupPhones = await this.findDuplicatePhones();
      if (dupPhones.length > 0) {
        where.phone = { notIn: dupPhones };
      }
    }

    // ── Cursor-based (backward compat - kanban, infinite scroll) ────────────
    if (query.cursor) {
      const leads = await this.prisma.lead.findMany({
        where, select: LEAD_SELECT,
        orderBy: { id: 'desc' },
        take: limit + 1,
        skip: 1, cursor: { id: BigInt(query.cursor) },
      });

      const hasMore = leads.length > limit;
      const data = hasMore ? leads.slice(0, limit) : leads;
      await this.enrichLeads(data);
      await this.attachDuplicateCount(data);
      await this.attachRecentNotes(data);
      return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
    }

    // ── Offset-based with total count ────────────────────────────────────────
    const page = query.page ?? 1;
    const [leads, total] = await Promise.all([
      this.prisma.lead.findMany({
        where, select: LEAD_SELECT,
        // Sort: nếu FE truyền sortBy thì dùng (whitelist trong DTO + buildLeadOrderBy),
        // mặc định = createdAt desc + id desc (lead mới tạo lên đầu).
        // Cursor branch BỎ QUA sortBy vì cursor cần stable `id desc` cho kanban/infinite scroll.
        orderBy: this.buildLeadOrderBy(query.sortBy, query.sortDir),
        take: limit,
        skip: (page - 1) * limit,
      }),
      this.prisma.lead.count({ where }),
    ]);

    const data = leads;
    await this.enrichLeads(data);
    await this.attachDuplicateCount(data);
    await this.attachRecentNotes(data);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Export CSV theo bộ lọc hiện tại ───────────────────────────────────────
  // Tái dùng buildLeadFilterWhere + applyDynamicFilters → khớp 100% bộ lọc list()
  // VÀ tôn trọng buildAccessFilter (phân quyền). Bỏ qua page/limit/cursor/sortBy:
  // export lấy toàn bộ kết quả khớp tới cap 10000, sort id desc cho ổn định.
  async exportCsv(query: LeadListQueryDto, user?: CurrentUser): Promise<string> {
    const where = this.buildLeadFilterWhere(query, user);
    this.applyDynamicFilters(where, query, user);

    const leads = await this.prisma.lead.findMany({
      where,
      select: {
        id: true, name: true, phone: true, email: true, status: true,
        createdAt: true, updatedAt: true,
        source: { select: { name: true } },
        group: { select: { name: true } },
        label: { select: { name: true } },
        product: { select: { name: true } },
        assignedUser: { select: { name: true } },
        department: { select: { name: true } },
        // take:1 đủ để biết lead có đơn hàng hay không (cột "Có đơn hàng?").
        orders: { where: { deletedAt: null }, select: { id: true }, take: 1 },
      },
      orderBy: { id: 'desc' },
      take: 10000,
    });

    // Cột "Ghi chú": tối đa 5 note tay mới nhất mỗi lead (cùng nguồn với cột Note trên bảng).
    await this.attachRecentNotes(leads);

    const rows = leads.map((lead: (typeof leads)[number] & { recentNotes?: { content: string }[] }) => sanitizeCsvRow({
      ID: lead.id.toString(),
      'Họ tên': lead.name,
      'Số điện thoại': lead.phone,
      Email: lead.email || '',
      'Trạng thái': LEAD_STATUS_LABELS[lead.status] || lead.status,
      Nguồn: lead.source?.name || '',
      Nhóm: lead.group?.name || '',
      Nhãn: lead.label?.name || '',
      'Sản phẩm': lead.product?.name || '',
      'Nhân viên phụ trách': lead.assignedUser?.name || '',
      'Phòng ban': lead.department?.name || '',
      'Có đơn hàng?': lead.orders.length > 0 ? 'Có' : 'Không',
      // Nối các note bằng " | " để giữ 1 dòng CSV/ô Excel, note mới nhất đứng trước.
      // Xuống dòng trong note ép về khoảng trắng cho ô gọn.
      'Ghi chú': (lead.recentNotes ?? [])
        .map((n) => n.content.replace(/\s*\n\s*/g, ' '))
        .filter(Boolean)
        .join(' | '),
      'Ngày tạo': formatVnDateTime(lead.createdAt),
      'Ngày cập nhật': formatVnDateTime(lead.updatedAt),
    }));

    return stringify(rows, { header: true });
  }

  // ── My department pool (for USER role) ──────────────────────────────────
  async myDeptPool(user: CurrentUser, query: PoolListQueryDto = {}) {
    if (!user.departmentId) return { data: [], meta: {} };
    return this.poolDepartment(user.departmentId, query, user);
  }

  // ── 3 Kho Pool Endpoints ────────────────────────────────────────────────
  async poolNew(query: LeadListQueryDto) {
    return this.list({ ...query, status: [LeadStatus.POOL], departmentId: undefined, assignedUserId: undefined });
  }

  async poolNewFiltered(query: PoolListQueryDto = {}, user?: CurrentUser) {
    // Filter base (sourceId/productId/labelId/hasOrder/dateFrom/dateTo/search); status & departmentId & assignedUserId fixed below.
    const filterWhere = this.buildLeadFilterWhere(query, user);

    // 1. Kho Mới: POOL + dept=null (chưa phân) - fixed scope wins over user input.
    const poolLeads = await this.prisma.lead.findMany({
      where: { ...filterWhere, status: 'POOL', departmentId: null, assignedUserId: null },
      select: LEAD_SELECT, orderBy: { id: 'desc' },
      take: 200,
    });

    // 2. Recently distributed leads (phân từ kho mới trong 72h gần đây)
    const since72h = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const recentAssignments = await this.prisma.assignmentHistory.findMany({
      where: {
        entityType: 'LEAD',
        fromDepartmentId: null, // was in kho mới (dept=null before)
        createdAt: { gte: since72h },
      },
      select: { entityId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      distinct: ['entityId'],
    });

    const distributedLeadIds = recentAssignments.map(a => a.entityId);
    // Exclude leads already in pool (avoid duplicates)
    const poolIds = new Set(poolLeads.map(l => l.id.toString()));
    const filteredIds = distributedLeadIds.filter(id => !poolIds.has(id.toString()));

    let enrichedDistributed: any[] = [];
    if (filteredIds.length > 0) {
      // Apply user filters to distributed branch too. Status here fixed to IN_PROGRESS/ASSIGNED (post-distribution).
      const distributedLeads = await this.prisma.lead.findMany({
        where: { ...filterWhere, id: { in: filteredIds }, status: { in: ['IN_PROGRESS', 'ASSIGNED'] } },
        select: LEAD_SELECT,
      });

      // Count user interactions (exclude ASSIGNMENT/SYSTEM) per lead
      const activityCounts = await this.prisma.activity.groupBy({
        by: ['entityId'],
        where: {
          entityType: 'LEAD',
          entityId: { in: filteredIds },
          type: { in: ['NOTE', 'CALL', 'STATUS_CHANGE', 'LABEL_CHANGE'] },
          deletedAt: null,
        },
        _count: true,
      });

      const countMap = new Map(activityCounts.map(a => [a.entityId.toString(), a._count]));
      const assignMap = new Map(recentAssignments.map(a => [a.entityId.toString(), a.createdAt]));

      enrichedDistributed = distributedLeads.map(lead => ({
        ...lead,
        assignedAt: assignMap.get(lead.id.toString()) || null,
        activityCount: countMap.get(lead.id.toString()) || 0,
      }));
    }

    const enrichedPool = poolLeads.map(lead => ({
      ...lead,
      assignedAt: null,
      activityCount: 0,
    }));

    // Latest NOTE activity per lead (for "Ghi chú" column in pool table)
    const allLeadIds = [
      ...poolLeads.map(l => l.id),
      ...enrichedDistributed.map(l => l.id),
    ];
    const latestNoteMap = new Map<string, { content: string | null; createdAt: Date }>();
    if (allLeadIds.length > 0) {
      const latestNotes = await this.prisma.activity.findMany({
        where: {
          entityType: 'LEAD',
          entityId: { in: allLeadIds },
          type: 'NOTE',
          deletedAt: null,
        },
        select: { entityId: true, content: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        distinct: ['entityId'],
      });
      for (const n of latestNotes) {
        latestNoteMap.set(n.entityId.toString(), { content: n.content, createdAt: n.createdAt });
      }
    }
    const attachNote = <T extends { id: bigint }>(lead: T) => ({
      ...lead,
      latestNote: latestNoteMap.get(lead.id.toString()) || null,
    });

    // Pool leads first, then distributed (sorted by assignedAt desc)
    enrichedDistributed.sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime());

    // Final dedup by id to prevent race-condition duplicates between queries
    const seen = new Set<string>();
    const merged = [...enrichedPool, ...enrichedDistributed].filter(l => {
      const key = l.id.toString();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(attachNote);
    await this.attachDuplicateCount(merged);
    await this.attachRecentNotes(merged);
    return { data: merged };
  }

  async poolZoom(query: PoolListQueryDto = {}, user?: CurrentUser) {
    const limit = query.limit ?? 10;
    const take = limit + 1;
    const filterWhere = this.buildLeadFilterWhere(query, user);
    const leads = await this.prisma.lead.findMany({
      where: { ...filterWhere, status: 'ZOOM' },
      select: LEAD_SELECT, orderBy: { id: 'desc' }, take,
      ...(query.cursor ? { skip: 1, cursor: { id: BigInt(query.cursor) } } : {}),
    });
    const hasMore = leads.length > limit;
    const data = hasMore ? leads.slice(0, limit) : leads;
    await this.attachDuplicateCount(data);
    await this.attachRecentNotes(data);
    return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
  }

  async poolDepartment(deptId: bigint, query: PoolListQueryDto = {}, user?: CurrentUser) {
    const limit = query.limit ?? 10;
    const take = limit + 1;
    const filterWhere = this.buildLeadFilterWhere(query, user);
    // Fixed scope: status POOL + dept=deptId + unassigned. Wins over user input.
    const leads = await this.prisma.lead.findMany({
      where: { ...filterWhere, status: 'POOL', departmentId: deptId, assignedUserId: null },
      select: LEAD_SELECT, orderBy: { id: 'desc' }, take,
      ...(query.cursor ? { skip: 1, cursor: { id: BigInt(query.cursor) } } : {}),
    });
    const hasMore = leads.length > limit;
    const data = hasMore ? leads.slice(0, limit) : leads;
    await this.attachDuplicateCount(data);
    await this.attachRecentNotes(data);
    return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
  }

  async poolFloating(query: PoolListQueryDto = {}, user?: CurrentUser) {
    const limit = query.limit ?? 10;
    const take = limit + 1;
    const filterWhere = this.buildLeadFilterWhere(query, user);
    const leads = await this.prisma.lead.findMany({
      where: { ...filterWhere, status: 'FLOATING' },
      select: LEAD_SELECT, orderBy: { id: 'desc' }, take,
      ...(query.cursor ? { skip: 1, cursor: { id: BigInt(query.cursor) } } : {}),
    });
    const hasMore = leads.length > limit;
    const data = hasMore ? leads.slice(0, limit) : leads;
    await this.attachDuplicateCount(data);
    await this.attachRecentNotes(data);
    return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
  }

  // ── Label quick filter counts (unified) ─────────────────────────────────
  // Trả về count lead theo labelId, áp cùng filter set với list endpoint.
  // labelId filter từ query bị strip để count cross tất cả label.
  // Scope role-based qua buildAccessFilter. Filter combo (status array, assignment, teamId, ...)
  // qua applyDynamicFilters - share logic với list() để tránh drift.
  async labelCounts(query: LeadListQueryDto = {}, user?: CurrentUser) {
    // Drop labelId để count cross-label (group by label nên không filter theo nhãn cụ thể)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { labelId: _drop, ...rest } = query;
    const where = this.buildLeadFilterWhere(rest, user);
    this.applyDynamicFilters(where, rest, user);

    // Tập SĐT trùng toàn hệ thống (chưa xóa, xuất hiện 2+ lần). Dùng chung cho:
    //  (a) thống kê "tổng trùng" trả về luôn (badge cạnh chip Tất cả),
    //  (b) áp filter duplicatesOnly cho count nhãn để khớp với list().
    const dupPhones = await this.findDuplicatePhones();

    // Thống kê trùng trong phạm vi quyền + filter hiện tại (giao với tập SĐT trùng global,
    // y hệt cách list() lọc). Tính TRƯỚC khi ép duplicatesOnly để luôn hiện kể cả khi toggle tắt.
    let duplicateLeadCount = 0;
    let duplicatePhoneCount = 0;
    if (dupPhones.length > 0) {
      const dupGroups = await this.prisma.lead.groupBy({
        by: ['phone'],
        where: { ...where, phone: { in: dupPhones } },
        _count: { _all: true },
      });
      duplicatePhoneCount = dupGroups.length;
      duplicateLeadCount = dupGroups.reduce((sum, g) => sum + g._count._all, 0);
    }

    // Count nhãn cũng phải tôn trọng filter "chỉ lead trùng" - trước đây bỏ qua nên badge nhãn
    // không đổi khi bật toggle, lệch với số dòng trên bảng. Tập rỗng -> ép id=-1 cho kết quả rỗng.
    if (rest.duplicatesOnly === 'true') {
      if (dupPhones.length === 0) where.id = BigInt(-1);
      else where.phone = { in: dupPhones };
    }

    const [grouped, labels] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ['labelId'],
        where,
        _count: { _all: true },
      }),
      this.prisma.label.findMany({
        where: { isActive: true },
        select: { id: true, name: true, color: true, textColor: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    // Nhãn hiển thị theo phòng ban: chỉ lọc danh sách chip cho USER/LEADER có
    // phòng ban được cấu hình trong department_labels. Phòng ban không có dòng
    // nào = thấy tất cả (fallback). MANAGER/SUPER_ADMIN luôn thấy full. Đây là
    // display-config, không phải access control - total/noLabelCount giữ nguyên.
    let visibleLabels = labels;
    if (
      user?.departmentId &&
      (user.role === UserRole.USER || user.role === UserRole.LEADER)
    ) {
      const deptRows = await this.prisma.departmentLabel.findMany({
        where: { departmentId: user.departmentId },
        select: { labelId: true },
      });
      if (deptRows.length > 0) {
        const allowed = new Set(deptRows.map((r) => String(r.labelId)));
        visibleLabels = labels.filter((l) => allowed.has(String(l.id)));
      }
    }

    const countByLabelId = new Map<string, number>();
    let noLabelCount = 0;
    let total = 0;
    for (const g of grouped) {
      const c = g._count._all;
      total += c;
      if (g.labelId === null) noLabelCount = c;
      else countByLabelId.set(String(g.labelId), c);
    }

    return {
      total,
      noLabelCount,
      duplicateLeadCount,
      duplicatePhoneCount,
      counts: visibleLabels.map((l) => ({
        labelId: String(l.id),
        name: l.name,
        color: l.color,
        textColor: l.textColor,
        count: countByLabelId.get(String(l.id)) ?? 0,
      })),
    };
  }

  // ── Find by ID ──────────────────────────────────────────────────────────
  async findById(id: bigint, user?: CurrentUser, mode: 'read' | 'write' = 'read') {
    const where: Prisma.LeadWhereInput = {
      id, deletedAt: null,
      ...(user ? buildAccessFilter(user, 'lead', mode) : {}),
    };
    const lead = await this.prisma.lead.findFirst({
      where, select: LEAD_SELECT,
    });
    if (!lead) throw new NotFoundException('Không tìm thấy lead');
    return lead;
  }

  // ── Create ──────────────────────────────────────────────────────────────
  async create(dto: CreateLeadDto, user: CurrentUser) {
    const phone = normalizePhone(dto.phone);
    if (!isValidVNPhone(phone)) throw new BadRequestException('Số điện thoại không hợp lệ');

    // Chỉ TÌM customer sẵn có theo phone (chính + phụ) để dedup + merge nhãn + cảnh báo trùng.
    // KHÔNG tạo customer lúc tạo lead: customer chỉ sinh ra khi lead có đơn (order) hoặc convert.
    // Lead chưa có customer -> customerId null (cột nullable), hợp lệ.
    const matched = await this.customerPhonesService.findCustomerByAnyPhone(phone);
    const customer = matched
      ? await this.prisma.customer.findUnique({
          where: { id: matched.id },
          include: { labels: { select: { labelId: true } } },
        })
      : null;
    const isDuplicate = !!customer;

    // Nếu chọn Nhóm (group) → suy ra Nguồn cha để lưu sourceId nhất quán + đọc skipPool.
    // Nếu chỉ chọn Nguồn (source) → dùng trực tiếp.
    // skipPool hiệu lực: Nhóm ưu tiên (group.skipPool), thiếu (null) thì kế thừa Nguồn cha.
    let effectiveSourceId: bigint | null = dto.sourceId ? BigInt(dto.sourceId) : null;
    const groupId: bigint | null = dto.groupId ? BigInt(dto.groupId) : null;
    let groupSkipPool: boolean | null = null;
    if (groupId) {
      const group = await this.prisma.leadGroup.findFirst({
        where: { id: groupId },
        select: { sourceId: true, skipPool: true },
      });
      if (group) {
        effectiveSourceId = group.sourceId;
        groupSkipPool = group.skipPool;
      }
    }

    let skipPool = false;
    if (effectiveSourceId) {
      const source = await this.prisma.leadSource.findFirst({
        where: { id: effectiveSourceId },
        select: { skipPool: true },
      });
      // Nhóm override Nguồn cha; null = kế thừa.
      skipPool = groupSkipPool ?? source?.skipPool ?? false;
    }

    // Auto-assign khi USER/LEADER tạo lead - lead về tay họ ngay với status IN_PROGRESS.
    // MANAGER+ giữ logic cũ (POOL hoặc ZOOM nếu source skipPool).
    // Lý do: USER/LEADER chỉ tạo lead khi đã có khách hàng cụ thể trong tay; không cần qua pool.
    // LEADER self-service y hệt USER (theo CLAUDE.md role model).
    const isRegularUser = user.role === UserRole.USER || user.role === UserRole.LEADER;
    const initialStatus: LeadStatus = isRegularUser
      ? 'IN_PROGRESS'
      : (skipPool ? 'ZOOM' : 'POOL');
    const initialAssignedUserId = isRegularUser ? user.id : null;
    const initialDepartmentId = isRegularUser ? (user.departmentId ?? null) : null;

    // Trường tùy chỉnh: validate key theo lead_field_definitions active, value string
    // max 500. Key lạ -> 400. null value bị bỏ khi create (không có gì để xóa).
    let customMetadata: Record<string, string> | undefined;
    if (dto.metadata && Object.keys(dto.metadata).length > 0) {
      const validated = await this.leadFieldDefinitions.validateCustomMetadata(dto.metadata);
      customMetadata = Object.fromEntries(
        Object.entries(validated).filter(([, v]) => v !== null),
      ) as Record<string, string>;
    }

    // Atomic: tạo lead + (optional) merge label + (optional) note activity trong cùng transaction.
    // Note rỗng / whitespace-only -> skip activity (không tạo noise trong timeline).
    const trimmedNote = dto.note?.trim();
    const customerId = customer?.id ?? null;
    const customerLabels = customer?.labels ?? [];

    const leadId = await this.prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          phone, name: dto.name || phone, email: dto.email,
          companyName: dto.companyName, facebookUrl: dto.facebookUrl,
          instagramUrl: dto.instagramUrl, zaloUrl: dto.zaloUrl, linkedinUrl: dto.linkedinUrl,
          status: initialStatus,
          ...(initialAssignedUserId ? { assignedUser: { connect: { id: initialAssignedUserId } } } : {}),
          ...(initialDepartmentId ? { department: { connect: { id: initialDepartmentId } } } : {}),
          ...(customerId ? { customer: { connect: { id: customerId } } } : {}),
          ...(effectiveSourceId ? { source: { connect: { id: effectiveSourceId } } } : {}),
          ...(groupId ? { group: { connect: { id: groupId } } } : {}),
          ...(dto.productId ? { product: { connect: { id: BigInt(dto.productId) } } } : {}),
          ...(customMetadata && Object.keys(customMetadata).length > 0
            ? { metadata: customMetadata }
            : {}),
        },
        select: { id: true },
      });

      // USER auto-assign: insert assignment_history row để Postgres trigger
      // tự maintain lead.lastAssignedAt + ghi activity ASSIGNMENT cho audit timeline.
      if (isRegularUser) {
        await tx.assignmentHistory.create({
          data: {
            entityType: 'LEAD',
            entityId: created.id,
            toUserId: user.id,
            toDepartmentId: user.departmentId,
            assignedBy: user.id,
            reason: 'USER tự tạo lead',
          },
        });
        await tx.activity.create({
          data: {
            entityType: 'LEAD',
            entityId: created.id,
            userId: user.id,
            type: 'ASSIGNMENT',
            content: 'Tự tạo và chăm sóc',
            metadata: { toUserId: user.id.toString(), selfCreated: true },
          },
        });
      }

      // Merge label from existing customer → new lead (single label only; take first)
      if (isDuplicate && customerLabels && customerLabels.length > 0) {
        await tx.lead.update({
          where: { id: created.id },
          data: { labelId: customerLabels[0].labelId, labelAssignedAt: new Date() },
        });
      }

      // Initial note → 1 activity (atomic với lead). Author = req.user.id, không nhận từ body.
      if (trimmedNote) {
        await tx.activity.create({
          data: {
            entityType: 'LEAD',
            entityId: created.id,
            userId: user.id,
            type: 'NOTE',
            content: trimmedNote,
          },
        });
      }

      return created.id;
    });

    // Return lead with duplicate warning (outside tx - read-only)
    const result = await this.findById(leadId);
    if (customer) {
      (result as any)._warning = {
        type: 'DUPLICATE_PHONE',
        message: `SĐT ${phone} đã tồn tại - ${customer.name || 'khách hàng'}`,
        existingCustomerId: customer.id.toString(),
        existingName: customer.name,
      };
    }

    // USER/LEADER tự tạo lead -> báo cho MANAGER. Fire-and-forget: lỗi gửi thông báo
    // không được làm hỏng kết quả tạo lead (đã commit trong transaction ở trên).
    if (isRegularUser) {
      this.notifyManagersLeadCreated(leadId, user.id, dto.name || phone, phone).catch(() => {});
    }

    return result;
  }

  /**
   * Báo cho mọi MANAGER khi USER/LEADER tự tạo lead.
   * Chỉ MANAGER (KHÔNG gồm SUPER_ADMIN) - theo yêu cầu nghiệp vụ.
   * MANAGER không scope theo phòng ban nên gửi cho tất cả manager đang hoạt động.
   */
  private async notifyManagersLeadCreated(
    leadId: bigint,
    creatorId: bigint,
    leadName: string,
    phone: string,
  ): Promise<void> {
    const [creator, managers] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: creatorId }, select: { name: true } }),
      this.prisma.user.findMany({
        where: { role: UserRole.MANAGER, status: 'ACTIVE', deletedAt: null },
        select: { id: true },
      }),
    ]);
    if (managers.length === 0) return;

    const creatorName = creator?.name ?? 'Nhân viên';
    await Promise.all(
      managers.map((m) =>
        this.notifications.create(
          m.id,
          `${creatorName} vừa tạo lead mới`,
          `${leadName} - ${phone}`,
          'LEAD_CREATED',
          'LEAD',
          leadId,
        ),
      ),
    );
  }

  // ── Update ──────────────────────────────────────────────────────────────
  async update(id: bigint, data: Record<string, unknown>, user: CurrentUser) {
    const existing = await this.findById(id, user, 'write');
    const isManagerPlus = ([UserRole.SUPER_ADMIN, UserRole.MANAGER] as UserRole[]).includes(user.role);

    // Field-level permission: USER không được sửa identity fields (phone/sourceId/groupId)
    // - dữ liệu gốc từ CSV/import, chỉ MANAGER+ fix typo.
    // Lưu ý: chỉ throw khi USER thực sự đổi giá trị (không phải gửi cùng giá trị cũ trong PATCH).
    if (!isManagerPlus) {
      if (data.phone && normalizePhone(data.phone as string) !== existing.phone) {
        throw new ForbiddenException('Chỉ quản lý mới được sửa số điện thoại');
      }
      if (data.sourceId !== undefined && String(data.sourceId) !== String(existing.sourceId ?? '')) {
        throw new ForbiddenException('Chỉ quản lý mới được đổi nguồn');
      }
      if (data.groupId !== undefined && String(data.groupId) !== String(existing.groupId ?? '')) {
        throw new ForbiddenException('Chỉ quản lý mới được đổi nhóm nguồn');
      }
    }

    const updateData: Prisma.LeadUpdateInput = {};
    if (data.name) updateData.name = data.name as string;
    if (data.email !== undefined) updateData.email = data.email as string | null;
    if (data.phone) {
      const phone = normalizePhone(data.phone as string);
      if (!isValidVNPhone(phone)) throw new BadRequestException('Số điện thoại không hợp lệ');
      updateData.phone = phone;
    }
    if (data.sourceId !== undefined && isManagerPlus) {
      updateData.source = data.sourceId
        ? { connect: { id: BigInt(data.sourceId as string) } }
        : { disconnect: true };
    }
    // Đổi Nhóm (manager+): set group + đồng bộ sourceId = Nguồn cha của nhóm (nguồn cha là source of truth).
    if (data.groupId !== undefined && isManagerPlus) {
      if (data.groupId) {
        const groupId = BigInt(data.groupId as string);
        const group = await this.prisma.leadGroup.findUnique({ where: { id: groupId }, select: { sourceId: true } });
        if (!group) throw new BadRequestException('Nhóm nguồn không tồn tại');
        updateData.group = { connect: { id: groupId } };
        updateData.source = { connect: { id: group.sourceId } };
      } else {
        updateData.group = { disconnect: true };
      }
    }
    // Product = "sản phẩm sale đang chăm sóc" - cho phép cả USER sửa (khác source = lịch sử cố định).
    if (data.productId !== undefined) {
      updateData.product = data.productId
        ? { connect: { id: BigInt(data.productId as string) } }
        : { disconnect: true };
    }
    if (data.companyName !== undefined) updateData.companyName = data.companyName as string | null;
    if (data.facebookUrl !== undefined) updateData.facebookUrl = data.facebookUrl as string | null;
    if (data.instagramUrl !== undefined) updateData.instagramUrl = data.instagramUrl as string | null;
    if (data.zaloUrl !== undefined) updateData.zaloUrl = data.zaloUrl as string | null;
    if (data.linkedinUrl !== undefined) updateData.linkedinUrl = data.linkedinUrl as string | null;

    // Trường tùy chỉnh: MERGE với metadata hiện có (không replace cả object) để
    // key lạ/legacy trong JSONB sống sót qua update. value null = xóa key.
    if (data.metadata !== undefined && data.metadata !== null && typeof data.metadata === 'object') {
      const validated = await this.leadFieldDefinitions.validateCustomMetadata(
        data.metadata as Record<string, unknown>,
      );
      const existingMeta = (existing.metadata ?? {}) as Record<string, unknown>;
      const merged: Record<string, unknown> = { ...existingMeta };
      for (const [key, value] of Object.entries(validated)) {
        if (value === null) delete merged[key];
        else merged[key] = value;
      }
      updateData.metadata = merged as Prisma.InputJsonValue;
    }

    return this.prisma.lead.update({ where: { id }, data: updateData, select: LEAD_SELECT });
  }

  // ── Enrichment helper ────────────────────────────────────────────────────
  /** Mutates each lead in-place: adds activityCount + lastInteractionAt */
  private async enrichLeads(data: any[]) {
    if (data.length === 0) return;
    const ids = data.map((l: any) => l.id);
    const [activityCounts, orderCounts, lastActivities, lastOrders] = await Promise.all([
      this.prisma.activity.groupBy({
        by: ['entityId'],
        where: { entityType: 'LEAD', entityId: { in: ids }, deletedAt: null, type: { in: ['NOTE', 'CALL'] } },
        _count: true,
      }),
      this.prisma.order.groupBy({
        by: ['leadId'],
        where: { leadId: { in: ids }, deletedAt: null },
        _count: true,
      }),
      this.prisma.activity.groupBy({
        by: ['entityId'],
        where: { entityType: 'LEAD', entityId: { in: ids }, deletedAt: null },
        _max: { createdAt: true },
      }),
      this.prisma.order.groupBy({
        by: ['leadId'],
        where: { leadId: { in: ids }, deletedAt: null },
        _max: { createdAt: true },
      }),
    ]);
    const actMap = new Map(activityCounts.map(a => [a.entityId.toString(), a._count]));
    const ordMap = new Map(orderCounts.map(o => [o.leadId!.toString(), o._count]));
    const lastActMap = new Map(lastActivities.map(a => [a.entityId.toString(), a._max.createdAt]));
    const lastOrdMap = new Map(lastOrders.map(o => [o.leadId!.toString(), o._max.createdAt]));

    for (const lead of data) {
      const id = lead.id.toString();
      (lead as any).activityCount = (actMap.get(id) || 0) + (ordMap.get(id) || 0);
      const dates = [lead.updatedAt, lastActMap.get(id), lastOrdMap.get(id)].filter(Boolean) as Date[];
      (lead as any).lastInteractionAt = dates.length > 0
        ? new Date(Math.max(...dates.map((d: Date) => new Date(d).getTime())))
        : lead.updatedAt;
    }
  }

  // ── Recent notes per lead ────────────────────────────────────────────────
  /**
   * Attach `recentNotes` (top 5 by createdAt DESC) to each lead in-place.
   * Single raw SQL query với ROW_NUMBER() OVER (PARTITION BY ...) tránh N+1.
   * Notes auto-scoped theo lead.id - không cần access filter vì leads input
   * đã được scope qua buildAccessFilter ở caller.
   */
  private async attachRecentNotes(leads: any[]) {
    if (leads.length === 0) return;
    const ids = leads.map((l: any) => l.id as bigint);

    // ROW_NUMBER picks top 5 per lead trong 1 query. Index [entity_type, entity_id, created_at] có sẵn.
    // Loại bỏ activity tự sinh từ order/payment (lưu type='NOTE' nhưng có metadata.type)
    // để cột Note chỉ hiển thị ghi chú user viết tay, không lẫn lịch sử đơn hàng/thanh toán.
    const rows = await this.prisma.$queryRaw<
      Array<{ entity_id: bigint; id: bigint; content: string | null; created_at: Date }>
    >`
      SELECT entity_id, id, content, created_at
      FROM (
        SELECT entity_id, id, content, created_at,
               ROW_NUMBER() OVER (PARTITION BY entity_id ORDER BY created_at DESC) AS rn
        FROM activities
        WHERE entity_type = 'LEAD'
          AND entity_id IN (${Prisma.join(ids)})
          AND type = 'NOTE'
          AND deleted_at IS NULL
          AND (metadata->>'type' IS NULL
               OR metadata->>'type' NOT IN ('ORDER_CREATED', 'PAYMENT_CREATED', 'PAYMENT_VERIFIED'))
      ) t
      WHERE rn <= 5
      ORDER BY entity_id, created_at DESC
    `;

    // Group by entity_id (string-keyed to avoid BigInt Map quirks)
    const byLead = new Map<string, Array<{ id: string; content: string; createdAt: string }>>();
    for (const r of rows) {
      const key = r.entity_id.toString();
      if (!byLead.has(key)) byLead.set(key, []);
      byLead.get(key)!.push({
        id: r.id.toString(),
        content: r.content ?? '',
        createdAt: r.created_at.toISOString(),
      });
    }

    for (const lead of leads) {
      lead.recentNotes = byLead.get(lead.id.toString()) ?? [];
    }
  }

  // ── Duplicate phone detection ────────────────────────────────────────────
  /** Trả danh sách SĐT (lead.phone) xuất hiện ở 2+ lead chưa xóa - dùng cho filter
   *  "chỉ hiện lead trùng". Lọc theo lead.phone trực tiếp (không gồm bridge số phụ
   *  customer như duplicateCount) để giữ filter + phân trang nhẹ. Giới hạn có chủ đích. */
  private async findDuplicatePhones(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ phone: string }>>`
      SELECT phone FROM leads
      WHERE deleted_at IS NULL AND phone IS NOT NULL AND status <> 'ZOOM'
      GROUP BY phone HAVING COUNT(*) > 1
    `;
    return rows.map((r) => r.phone);
  }

  /** Attach `duplicateCount` (số lead chưa xóa chia sẻ chung một SĐT) vào mỗi lead.
   *  Một lead được tính trùng nếu cùng `lead.phone`, hoặc cùng `customer_id` với
   *  customer có phone (chính hoặc phụ) khớp - bắt được trường hợp SĐT đầu vào
   *  trùng với SĐT phụ của một lead khác (qua bridge customer_phones).
   */
  private async attachDuplicateCount(leads: any[]) {
    if (leads.length === 0) return;
    const phones = Array.from(new Set(leads.map(l => l.phone).filter(Boolean))) as string[];
    if (phones.length === 0) return;

    // Raw CTE: với mỗi phone đầu vào, gộp leads trực tiếp (lead.phone = P) với
    // leads gián tiếp (lead.customer_id thuộc customer có P là số chính/phụ),
    // rồi đếm distinct lead_id mỗi phone. Một round-trip, không N+1.
    const rows = await this.prisma.$queryRaw<Array<{ phone: string; cnt: number }>>`
      WITH input(phone) AS (
        SELECT unnest(ARRAY[${Prisma.join(phones)}]::text[])
      ),
      matched_customers AS (
        SELECT i.phone, c.id AS customer_id
        FROM input i JOIN customers c ON c.phone = i.phone AND c.deleted_at IS NULL
        UNION
        SELECT i.phone, cp.customer_id
        FROM input i JOIN customer_phones cp ON cp.phone = i.phone AND cp.deleted_at IS NULL
      ),
      matched_leads AS (
        SELECT i.phone, l.id AS lead_id
        FROM input i JOIN leads l ON l.phone = i.phone AND l.deleted_at IS NULL AND l.status <> 'ZOOM'
        UNION
        SELECT mc.phone, l.id
        FROM matched_customers mc JOIN leads l ON l.customer_id = mc.customer_id AND l.deleted_at IS NULL AND l.status <> 'ZOOM'
      )
      SELECT phone, COUNT(DISTINCT lead_id)::int AS cnt
      FROM matched_leads
      GROUP BY phone
    `;

    const map = new Map(rows.map(r => [r.phone, r.cnt]));
    for (const lead of leads) {
      lead.duplicateCount = map.get(lead.phone) ?? 1;
    }
  }

  /** Lịch sử các lead trùng SĐT + lịch sử phân phối.
   *  Lead được coi là trùng nếu khớp một trong:
   *   (a) lead.phone = X (SĐT chính của lead)
   *   (b) lead.customerId thuộc customer có customer.phone = X (số chính của customer)
   *   (c) lead.customerId thuộc customer có 1 số phụ trong customer_phones = X
   *  Điều này giúp scan ngang hàng giữa SĐT chính và SĐT phụ.
   */
  async findDuplicatesByPhone(rawPhone: string) {
    const phone = normalizePhone(rawPhone);
    if (!phone || !isValidVNPhone(phone)) {
      throw new BadRequestException('Số điện thoại không hợp lệ');
    }

    // Tập customerIds mà phone tra cứu khớp dưới dạng số chính HOẶC số phụ của customer.
    const [customersMain, phonesAlt] = await Promise.all([
      this.prisma.customer.findMany({
        where: { phone, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.customerPhone.findMany({
        where: { phone, deletedAt: null },
        select: { customerId: true },
      }),
    ]);
    const customerIdsArr = Array.from(new Set([
      ...customersMain.map(c => c.id),
      ...phonesAlt.map(p => p.customerId),
    ]));

    const leads = await this.prisma.lead.findMany({
      where: {
        deletedAt: null,
        // Kho Zoom đi theo luồng phân phối riêng, không trộn vào view thường -> loại khỏi popup trùng SĐT
        status: { not: LeadStatus.ZOOM },
        OR: [
          { phone },
          ...(customerIdsArr.length > 0 ? [{ customerId: { in: customerIdsArr } }] : []),
        ],
      },
      select: {
        id: true, name: true, phone: true, status: true,
        createdAt: true, updatedAt: true,
        product: { select: { id: true, name: true } },
        source: { select: { id: true, name: true } },
        group: { select: { id: true, name: true } },
        assignedUser: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        label: { select: { id: true, name: true, color: true, textColor: true } },
        // Đếm order chưa xóa để render cờ "Đã có đơn" ở popup trùng SĐT
        _count: { select: { orders: { where: { deletedAt: null } } } },
      },
      orderBy: { id: 'desc' },
    });

    if (leads.length === 0) {
      return { data: { phone, leads: [], history: [] } };
    }

    const leadIds = leads.map(l => l.id);

    // Lấy ghi chú mới nhất của mỗi lead (note lưu dưới dạng Activity type NOTE) để hiện ở cột Ghi chú popup trùng SĐT.
    // distinct theo entityId + orderBy createdAt desc -> mỗi lead chỉ lấy 1 note gần nhất.
    const latestNotes = await this.prisma.activity.findMany({
      where: { entityType: 'LEAD', entityId: { in: leadIds }, type: 'NOTE', deletedAt: null, content: { not: null } },
      distinct: ['entityId'],
      orderBy: [{ entityId: 'asc' }, { createdAt: 'desc' }],
      select: { entityId: true, content: true },
    });
    const noteByLeadId = new Map(latestNotes.map(n => [n.entityId.toString(), n.content]));

    // Annotate matchedBy: PRIMARY = trùng qua chính lead.phone; SECONDARY = trùng qua bridge customer.
    const annotated = leads.map(l => ({
      ...l,
      matchedBy: l.phone === phone ? 'PRIMARY' as const : 'SECONDARY' as const,
      note: noteByLeadId.get(l.id.toString()) ?? null,
    }));

    const history = await this.prisma.assignmentHistory.findMany({
      where: { entityType: 'LEAD', entityId: { in: leadIds } },
      select: {
        id: true, entityId: true, createdAt: true, reason: true,
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
        fromDepartment: { select: { id: true, name: true } },
        toDepartment: { select: { id: true, name: true } },
        assignedByUser: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { data: { phone, leads: annotated, history } };
  }

  // ── Assign ──────────────────────────────────────────────────────────────
  /** Check if user has capacity to hold more leads (maxLeads from EmployeeLevel) */
  private async checkUserCapacity(userId: bigint, count = 1) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId },
      select: { employeeLevel: { select: { maxLeads: true } } },
    });
    const maxLeads = user?.employeeLevel?.maxLeads;
    if (maxLeads === null || maxLeads === undefined) return; // unlimited

    const currentCount = await this.prisma.lead.count({
      where: { assignedUserId: userId, status: { in: ['ASSIGNED', 'IN_PROGRESS'] }, deletedAt: null },
    });
    const customerCount = await this.prisma.customer.count({
      where: { assignedUserId: userId, status: 'ACTIVE', deletedAt: null },
    });

    if (currentCount + customerCount + count > maxLeads) {
      throw new ConflictException(`Nhân viên đã đạt giới hạn ${maxLeads} leads+customers`);
    }
  }

  async assign(id: bigint, targetUserId: bigint, user: CurrentUser) {
    const lead = await this.findById(id);

    // Cho phân lead chưa chủ (POOL/ZOOM/FLOATING) lẫn phân lại lead đang có chủ (ASSIGNED/IN_PROGRESS).
    if (!['POOL', 'ZOOM', 'FLOATING', 'ASSIGNED', 'IN_PROGRESS'].includes(lead.status)) {
      throw new ConflictException('Không thể phân lead đã chốt hoặc đã mất');
    }

    // Check capacity before assigning
    await this.checkUserCapacity(targetUserId);

    // Get target user's department
    const targetUser = await this.prisma.user.findFirst({
      where: { id: targetUserId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, departmentId: true },
    });
    if (!targetUser) throw new NotFoundException('Không tìm thấy nhân viên');

    // Atomic: use updateMany with status guard to prevent race condition
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.lead.updateMany({
        where: { id, status: { in: ['POOL', 'ZOOM', 'FLOATING', 'ASSIGNED', 'IN_PROGRESS'] } },
        data: {
          assignedUserId: targetUserId,
          departmentId: targetUser.departmentId,
          status: 'IN_PROGRESS',
        },
      });
      if (updated.count === 0) {
        throw new ConflictException('Lead đã được gán bởi người khác');
      }

      this.emitAssignedUserChanged(id, lead.assignedUserId, targetUserId, this.actorOf(user));

      await tx.assignmentHistory.create({
        data: {
          entityType: 'LEAD', entityId: id,
          fromUserId: lead.assignedUserId,
          toUserId: targetUserId,
          fromDepartmentId: lead.departmentId,
          toDepartmentId: targetUser.departmentId,
          assignedBy: user.id,
        },
      });

      await tx.activity.create({
        data: {
          entityType: 'LEAD', entityId: id, userId: user.id,
          type: 'ASSIGNMENT',
          content: `Gán cho nhân viên`,
          metadata: { toUserId: targetUserId.toString() },
        },
      });

      // Reset label-recall timer khi assign cho user mới (only if lead has a label)
      await tx.lead.updateMany({
        where: { id, labelId: { not: null } },
        data: { labelAssignedAt: new Date() },
      });
    });

    return this.findById(id);
  }

  /** Bulk assign multiple leads to a single user in one transaction.
   *  Auto-recall: cho phép assign cả lead đã có chủ (status != CONVERTED/LOST).
   *  Lead đang giữ bởi chính targetUser được skip (idempotent). */
  async bulkAssign(leadIds: bigint[], targetUserId: bigint, user: CurrentUser, labelId?: bigint) {
    const targetUser = await this.prisma.user.findFirst({
      where: { id: targetUserId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, departmentId: true, name: true },
    });
    if (!targetUser) throw new NotFoundException('Không tìm thấy nhân viên');

    // Validate nhãn (nếu có) trước khi vào transaction
    if (labelId) {
      const label = await this.prisma.label.findFirst({ where: { id: labelId, isActive: true } });
      if (!label) throw new BadRequestException('Nhãn không tồn tại');
    }

    const leads = await this.prisma.lead.findMany({
      where: {
        id: { in: leadIds },
        status: { notIn: ['CONVERTED', 'LOST'] },
        deletedAt: null,
      },
      select: { id: true, assignedUserId: true, departmentId: true, status: true },
    });

    if (leads.length === 0) {
      throw new BadRequestException('Không có lead nào có thể phân phối (lead đã CONVERTED/LOST hoặc đã xóa)');
    }

    // Skip leads đang giữ bởi chính targetUser (idempotent), split reassign vs new-assign
    const leadsToUpdate = leads.filter(l => l.assignedUserId !== targetUserId);
    const sameOwnerCount = leads.length - leadsToUpdate.length;
    const reassignedCount = leadsToUpdate.filter(l => l.assignedUserId != null).length;
    const newAssignedCount = leadsToUpdate.length - reassignedCount;

    if (leadsToUpdate.length === 0) {
      // Tất cả lead đã thuộc target user. Người dùng vẫn bấm "phân" -> coi là 1 lần phân mới:
      // cập nhật lastAssignedAt để lead hiện trong bộ lọc "ngày phân", áp nhãn nếu có chọn.
      const data: { lastAssignedAt: Date; labelId?: bigint; labelAssignedAt?: Date } = {
        lastAssignedAt: new Date(),
      };
      if (labelId) {
        data.labelId = labelId;
        data.labelAssignedAt = new Date();
      }
      await this.prisma.lead.updateMany({
        where: { id: { in: leads.map(l => l.id) } },
        data,
      });
      return {
        data: {
          assigned: 0,
          skipped: leadIds.length,
          reassigned: 0,
          newAssigned: 0,
          sameOwnerSkipped: sameOwnerCount,
          targetUser: { id: targetUser.id.toString(), name: targetUser.name },
        },
      };
    }

    const updateIds = leadsToUpdate.map(l => l.id);
    // Lead trộn lẫn: một số đổi chủ (trigger tự set lastAssignedAt), một số cùng chủ.
    // Lead cùng chủ vẫn được coi là 1 lần phân mới -> cần set lastAssignedAt thủ công.
    const sameOwnerIds = leads.filter(l => l.assignedUserId === targetUserId).map(l => l.id);

    await this.prisma.$transaction(async (tx) => {
      await tx.lead.updateMany({
        where: { id: { in: updateIds } },
        data: { assignedUserId: targetUserId, departmentId: targetUser.departmentId, status: 'IN_PROGRESS' },
      });

      // Emit per-lead semantic events (updateMany doesn't trigger Prisma extension)
      const actor = this.actorOf(user);
      for (const l of leadsToUpdate) {
        this.emitAssignedUserChanged(l.id, l.assignedUserId, targetUserId, actor);
      }

      await tx.assignmentHistory.createMany({
        data: leadsToUpdate.map(l => ({
          entityType: 'LEAD' as const, entityId: l.id,
          fromUserId: l.assignedUserId, toUserId: targetUserId,
          fromDepartmentId: l.departmentId, toDepartmentId: targetUser.departmentId,
          assignedBy: user.id,
          reason: l.assignedUserId ? 'Phân lại hàng loạt sang nhân viên khác' : 'Phân hàng loạt',
        })),
      });

      await tx.activity.createMany({
        data: leadsToUpdate.map(l => ({
          entityType: 'LEAD' as const, entityId: l.id, userId: user.id,
          type: 'ASSIGNMENT' as const,
          content: l.assignedUserId
            ? `Phân lại hàng loạt sang ${targetUser.name}`
            : `Phân hàng loạt cho ${targetUser.name}`,
          metadata: {
            toUserId: targetUserId.toString(),
            bulk: true,
            ...(l.assignedUserId ? { fromUserId: l.assignedUserId.toString(), reassigned: true } : {}),
          },
        })),
      });

      if (labelId) {
        // Gắn nhãn cho TẤT CẢ lead được chọn trong đợt phân (gồm cả same-owner skipped)
        await tx.lead.updateMany({
          where: { id: { in: leads.map(l => l.id) } },
          data: { labelId, labelAssignedAt: new Date() },
        });
      } else {
        // Không chọn nhãn: chỉ reset label-recall timer cho lead đã có nhãn
        await tx.lead.updateMany({
          where: { id: { in: updateIds }, labelId: { not: null } },
          data: { labelAssignedAt: new Date() },
        });
      }

      // Lead cùng chủ không tạo assignment_history (trigger không chạy) -> set lastAssignedAt thủ công
      // để lần bấm phân này vẫn tính là 1 lần phân mới trong bộ lọc "ngày phân".
      if (sameOwnerIds.length > 0) {
        await tx.lead.updateMany({
          where: { id: { in: sameOwnerIds } },
          data: { lastAssignedAt: new Date() },
        });
      }
    });

    return {
      data: {
        assigned: leadsToUpdate.length,
        skipped: leadIds.length - leadsToUpdate.length,
        reassigned: reassignedCount,
        newAssigned: newAssignedCount,
        sameOwnerSkipped: sameOwnerCount,
        targetUser: { id: targetUser.id.toString(), name: targetUser.name },
      },
    };
  }

  // ── Recall (thu hồi lead về kho mới) ─────────────────────────────────
  async recall(id: bigint, user: CurrentUser) {
    const lead = await this.findById(id);
    if (!lead.assignedUserId) throw new BadRequestException('Lead chưa được phân phối');

    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id },
        data: { assignedUserId: null, departmentId: null, status: 'POOL' },
      });

      await tx.assignmentHistory.create({
        data: {
          entityType: 'LEAD', entityId: id,
          fromUserId: lead.assignedUserId, fromDepartmentId: lead.departmentId,
          assignedBy: user.id, reason: 'Thu hồi về kho mới',
        },
      });

      await tx.activity.create({
        data: {
          entityType: 'LEAD', entityId: id, userId: user.id,
          type: 'ASSIGNMENT', content: 'Thu hồi về Kho Mới',
          metadata: { recall: true, fromUserId: lead.assignedUserId?.toString() },
        },
      });
    });

    return this.findById(id);
  }

  async bulkRecall(leadIds: bigint[], user: CurrentUser) {
    const leads = await this.prisma.lead.findMany({
      where: { id: { in: leadIds }, assignedUserId: { not: null }, deletedAt: null },
      select: { id: true, assignedUserId: true, departmentId: true },
    });

    if (leads.length === 0) throw new BadRequestException('Không có lead nào để thu hồi');

    await this.prisma.$transaction(async (tx) => {
      await tx.lead.updateMany({
        where: { id: { in: leads.map(l => l.id) } },
        data: { assignedUserId: null, departmentId: null, status: 'POOL' },
      });

      const actor = this.actorOf(user);
      for (const l of leads) {
        this.emitAssignedUserChanged(l.id, l.assignedUserId, null, actor);
      }

      await tx.assignmentHistory.createMany({
        data: leads.map(l => ({
          entityType: 'LEAD' as const, entityId: l.id,
          fromUserId: l.assignedUserId, fromDepartmentId: l.departmentId,
          assignedBy: user.id, reason: 'Thu hồi hàng loạt về kho mới',
        })),
      });

      await tx.activity.createMany({
        data: leads.map(l => ({
          entityType: 'LEAD' as const, entityId: l.id, userId: user.id,
          type: 'ASSIGNMENT' as const, content: 'Thu hồi hàng loạt về Kho Mới',
          metadata: { recall: true, bulk: true, fromUserId: l.assignedUserId?.toString() },
        })),
      });
    });

    return { data: { recalled: leads.length, total: leadIds.length } };
  }

  // ── Claim ───────────────────────────────────────────────────────────────
  async claim(id: bigint, user: CurrentUser) {
    const lead = await this.findById(id);

    // Check capacity before claiming
    await this.checkUserCapacity(user.id);

    // Dept pool: only same dept users can claim
    if (lead.status === 'POOL' && lead.departmentId) {
      if (user.departmentId !== lead.departmentId) {
        throw new ForbiddenException('Chỉ nhân viên cùng phòng ban mới claim được');
      }
    }

    // Floating: any user can claim
    if (lead.status !== 'POOL' && lead.status !== 'FLOATING') {
      throw new ConflictException('Chỉ claim lead ở trạng thái POOL, ZOOM hoặc FLOATING');
    }

    // Atomic claim → auto IN_PROGRESS
    const result = await this.prisma.lead.updateMany({
      where: { id, assignedUserId: null, deletedAt: null, status: { in: ['POOL', 'FLOATING'] } },
      data: {
        assignedUserId: user.id,
        departmentId: user.departmentId,
        status: 'IN_PROGRESS',
      },
    });
    if (result.count === 0) throw new ConflictException('Lead đã được claim bởi người khác');

    this.emitAssignedUserChanged(id, null, user.id, this.actorOf(user));

    await this.prisma.assignmentHistory.create({
      data: {
        entityType: 'LEAD', entityId: id,
        toUserId: user.id, toDepartmentId: user.departmentId,
        assignedBy: user.id, reason: 'Tự claim',
      },
    });

    return this.findById(id);
  }

  // ── Transfer ────────────────────────────────────────────────────────────
  async transfer(id: bigint, targetType: string, targetDeptId: string | null, user: CurrentUser) {
    const lead = await this.findById(id);
    await this.checkTransferPermission(lead, user);

    let status: LeadStatus;
    let deptId: bigint | null = null;

    switch (targetType) {
      case 'DEPARTMENT':
        if (!targetDeptId) throw new BadRequestException('targetDeptId bắt buộc');
        status = 'POOL';
        deptId = BigInt(targetDeptId);
        break;
      case 'FLOATING':
        status = 'FLOATING';
        break;
      case 'UNASSIGN':
        status = 'POOL';
        deptId = lead.departmentId; // giữ dept cũ
        break;
      default:
        throw new BadRequestException('targetType không hợp lệ');
    }

    await this.prisma.lead.update({
      where: { id },
      data: { assignedUserId: null, departmentId: deptId, status },
    });

    await this.prisma.assignmentHistory.create({
      data: {
        entityType: 'LEAD', entityId: id,
        fromUserId: lead.assignedUserId, fromDepartmentId: lead.departmentId,
        toDepartmentId: deptId, assignedBy: user.id,
        reason: `Chuyển: ${targetType}`,
      },
    });

    // Reset label-recall timer khi chuyển phòng ban (only if lead has a label)
    if (targetType === 'DEPARTMENT') {
      await this.prisma.lead.updateMany({
        where: { id, labelId: { not: null } },
        data: { labelAssignedAt: new Date() },
      });
    }

    return this.findById(id);
  }

  // ── Status Change ───────────────────────────────────────────────────────
  async changeStatus(id: bigint, newStatus: LeadStatus, user: CurrentUser) {
    const validStatuses = Object.keys(ALLOWED_TRANSITIONS) as LeadStatus[];
    if (!validStatuses.includes(newStatus)) {
      throw new BadRequestException(`Trạng thái không hợp lệ: ${newStatus}`);
    }

    const lead = await this.findById(id);
    const currentStatus = lead.status as LeadStatus;

    if (!ALLOWED_TRANSITIONS[currentStatus]?.includes(newStatus)) {
      throw new ConflictException(`Không thể chuyển từ ${currentStatus} sang ${newStatus}`);
    }

    const updateData: Prisma.LeadUpdateInput = { status: newStatus };

    // LOST → FLOATING: clear user + dept
    if (newStatus === 'FLOATING') {
      updateData.assignedUser = { disconnect: true };
      updateData.department = { disconnect: true };
    }

    await this.prisma.lead.update({ where: { id }, data: updateData });

    await this.prisma.activity.create({
      data: {
        entityType: 'LEAD', entityId: id, userId: user.id,
        type: 'STATUS_CHANGE',
        content: `${currentStatus} → ${newStatus}`,
        metadata: { fromStatus: currentStatus, toStatus: newStatus },
      },
    });

    return this.findById(id);
  }

  // ── Convert to Customer ─────────────────────────────────────────────────
  // Auto-promote: nếu lead đang POOL/ASSIGNED, tự set IN_PROGRESS trước khi
  // convert (đúng business rule "IN_PROGRESS auto-trigger khi tạo order đầu").
  // Chặn convert từ CONVERTED (idempotent guard), LOST, FLOATING (kho thả nổi
  // phải reclaim trước, không convert thẳng).
  async convert(id: bigint, user: CurrentUser) {
    const lead = await this.findById(id);

    if (lead.status === 'CONVERTED') {
      throw new ConflictException('Lead đã được chuyển đổi trước đó');
    }
    if (lead.status === 'LOST' || lead.status === 'FLOATING') {
      throw new ConflictException('Lead ở kho thả nổi/đã mất, hãy reclaim trước khi tạo đơn');
    }

    const fromStatus = lead.status; // capture cho activity log

    await this.prisma.$transaction(async (tx) => {
      // Auto-promote IN_PROGRESS nếu cần (POOL/ASSIGNED -> IN_PROGRESS)
      if (fromStatus !== 'IN_PROGRESS') {
        await tx.lead.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
        await tx.activity.create({
          data: {
            entityType: 'LEAD', entityId: id, userId: user.id,
            type: 'STATUS_CHANGE',
            content: `${fromStatus} -> IN_PROGRESS (tự động khi tạo đơn)`,
            metadata: { fromStatus, toStatus: 'IN_PROGRESS', auto: true },
          },
        });
      }

      // Customer chỉ sinh ra tại đây (convert) hoặc lúc tạo đơn - không còn tạo ở create lead.
      // Ưu tiên: customer đã link -> update ACTIVE; chưa link -> dedup theo phone (dùng lại nếu
      // trùng, tránh 2 hồ sơ cùng SĐT); không trùng mới create.
      const resolvedCustomerId =
        lead.customerId ?? (await this.customerPhonesService.findCustomerByAnyPhone(lead.phone))?.id ?? null;

      if (resolvedCustomerId) {
        await tx.customer.update({
          where: { id: resolvedCustomerId },
          data: {
            assignedUserId: lead.assignedUserId,
            assignedDepartmentId: lead.departmentId,
            status: 'ACTIVE',
            companyName: lead.companyName, facebookUrl: lead.facebookUrl,
            instagramUrl: lead.instagramUrl, zaloUrl: lead.zaloUrl, linkedinUrl: lead.linkedinUrl,
          },
        });
        // Lead chưa link (dedup match) -> gắn customerId.
        if (!lead.customerId) {
          await tx.lead.update({ where: { id }, data: { customerId: resolvedCustomerId } });
        }
      } else {
        const customer = await tx.customer.create({
          data: {
            phone: lead.phone, name: lead.name, email: lead.email,
            companyName: lead.companyName, facebookUrl: lead.facebookUrl,
            instagramUrl: lead.instagramUrl, zaloUrl: lead.zaloUrl, linkedinUrl: lead.linkedinUrl,
            assignedUserId: lead.assignedUserId,
            assignedDepartmentId: lead.departmentId,
          },
        });
        await tx.lead.update({ where: { id }, data: { customerId: customer.id } });
      }

      // Set lead to CONVERTED
      await tx.lead.update({ where: { id }, data: { status: 'CONVERTED' } });

      // Log activity
      await tx.activity.create({
        data: {
          entityType: 'LEAD', entityId: id, userId: user.id,
          type: 'STATUS_CHANGE',
          content: 'Chuyển đổi thành khách hàng',
          metadata: { fromStatus: 'IN_PROGRESS', toStatus: 'CONVERTED' },
        },
      });
    });

    return this.findById(id);
  }

  // ── Auto IN_PROGRESS trigger ────────────────────────────────────────────
  async triggerInProgress(leadId: bigint, userId: bigint) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, status: 'ASSIGNED', deletedAt: null },
    });
    if (!lead) return; // not ASSIGNED, skip

    await this.prisma.lead.update({
      where: { id: leadId },
      data: { status: 'IN_PROGRESS' },
    });

    await this.prisma.activity.create({
      data: {
        entityType: 'LEAD', entityId: leadId, userId,
        type: 'STATUS_CHANGE',
        content: 'ASSIGNED → IN_PROGRESS (tự động)',
        metadata: { fromStatus: 'ASSIGNED', toStatus: 'IN_PROGRESS', auto: true },
      },
    });
  }

  // ── Soft Delete ─────────────────────────────────────────────────────────
  async softDelete(id: bigint) {
    await this.findById(id);
    return this.prisma.lead.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /** Bulk soft-delete. MANAGER+ enforced at controller. `skipped` = đã xóa trước đó. */
  async bulkSoftDelete(ids: bigint[]): Promise<{ deleted: number; skipped: number }> {
    if (ids.length === 0) return { deleted: 0, skipped: 0 };
    const result = await this.prisma.lead.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return { deleted: result.count, skipped: ids.length - result.count };
  }

  private async checkTransferPermission(lead: Record<string, unknown>, user: CurrentUser) {
    if (user.role === UserRole.SUPER_ADMIN) return;
    if (lead.assignedUserId === user.id) return;
    if (user.role === UserRole.MANAGER) {
      // Manager can transfer unowned leads (POOL with no assignee)
      if (!lead.assignedUserId) return;
      // Check if manager manages the lead's department
      const deptId = lead.departmentId as bigint | null;
      if (deptId) {
        const managed = await this.prisma.managerDepartment.findUnique({
          where: { managerId_departmentId: { managerId: user.id, departmentId: deptId } },
        });
        if (managed) return;
      }
    }
    throw new ForbiddenException('Không có quyền chuyển lead này');
  }

  // ── Secondary phones (lead context) ─────────────────────────────────────
  // Cho phép mọi role có access tới lead (qua findById/buildAccessFilter) được
  // thêm/sửa/xóa số phụ. Khi lead chưa có customerId, tự động tạo customer
  // shadow để link - KHÔNG đổi status lead (không trigger convert flow).

  /**
   * Đảm bảo lead có customerId. Nếu chưa có → tạo customer shadow và link.
   * Access đã được enforce trước bởi caller (qua `findById(leadId, user)` trong addSecondaryPhone)
   * → inner tx dùng `findUnique` không filter là an toàn.
   */
  private async ensureCustomerForLead(leadId: bigint, user: CurrentUser): Promise<bigint> {
    // Caller là addSecondaryPhone (mutation) -> self-scope cho LEADER.
    const lead = await this.findById(leadId, user, 'write');
    if (lead.customerId) return BigInt(lead.customerId);

    // Race-safe: kiểm tra lại trong transaction (2 request song song không tạo 2 customer).
    return this.prisma.$transaction(async (tx) => {
      const fresh = await tx.lead.findUnique({
        where: { id: leadId },
        select: {
          customerId: true, phone: true, name: true, email: true,
          companyName: true, facebookUrl: true, instagramUrl: true,
          zaloUrl: true, linkedinUrl: true,
          assignedUserId: true, departmentId: true,
        },
      });
      if (!fresh) throw new NotFoundException('Không tìm thấy lead');
      if (fresh.customerId) return fresh.customerId;

      // Match customer hiện hữu theo phone trước khi tạo mới (tránh duplicate)
      const matched = fresh.phone
        ? await tx.customer.findFirst({ where: { phone: fresh.phone, deletedAt: null }, select: { id: true } })
        : null;
      const customerId = matched
        ? matched.id
        : (await tx.customer.create({
            data: {
              phone: fresh.phone ?? '',
              name: fresh.name ?? fresh.phone ?? '',
              email: fresh.email,
              companyName: fresh.companyName,
              facebookUrl: fresh.facebookUrl,
              instagramUrl: fresh.instagramUrl,
              zaloUrl: fresh.zaloUrl,
              linkedinUrl: fresh.linkedinUrl,
              assignedUserId: fresh.assignedUserId,
              assignedDepartmentId: fresh.departmentId,
            },
            select: { id: true },
          })).id;

      await tx.lead.update({ where: { id: leadId }, data: { customerId } });
      return customerId;
    });
  }

  /** List số phụ - nếu lead chưa có customerId → mảng rỗng. */
  async listSecondaryPhones(leadId: bigint, user: CurrentUser) {
    const lead = await this.findById(leadId, user);
    if (!lead.customerId) return [];
    return this.customerPhonesService.listPhones(BigInt(lead.customerId));
  }

  /** Thêm số phụ. Auto-create customer nếu cần. */
  async addSecondaryPhone(
    leadId: bigint,
    dto: { phone: string; label?: string; note?: string },
    user: CurrentUser,
  ) {
    const customerId = await this.ensureCustomerForLead(leadId, user);
    return this.customerPhonesService.addPhone(customerId, dto, user.id);
  }

  /** Update số phụ - verify ownership qua lead. */
  async updateSecondaryPhone(
    leadId: bigint,
    phoneId: bigint,
    dto: { phone?: string; label?: string; note?: string },
    user: CurrentUser,
  ) {
    const lead = await this.findById(leadId, user, 'write');
    if (!lead.customerId) throw new NotFoundException('Lead chưa có khách hàng');
    // IDOR guard: phone phải thuộc customer của lead này
    const phone = await this.prisma.customerPhone.findUnique({
      where: { id: phoneId }, select: { customerId: true, deletedAt: true },
    });
    if (!phone || phone.deletedAt || phone.customerId.toString() !== String(lead.customerId)) {
      throw new NotFoundException('Không tìm thấy số phụ');
    }
    return this.customerPhonesService.updatePhone(phoneId, dto);
  }

  /** Soft delete số phụ - verify ownership qua lead. */
  async softDeleteSecondaryPhone(leadId: bigint, phoneId: bigint, user: CurrentUser) {
    const lead = await this.findById(leadId, user, 'write');
    if (!lead.customerId) throw new NotFoundException('Lead chưa có khách hàng');
    const phone = await this.prisma.customerPhone.findUnique({
      where: { id: phoneId }, select: { customerId: true, deletedAt: true },
    });
    if (!phone || phone.deletedAt || phone.customerId.toString() !== String(lead.customerId)) {
      throw new NotFoundException('Không tìm thấy số phụ');
    }
    return this.customerPhonesService.softDeletePhone(phoneId);
  }
}
