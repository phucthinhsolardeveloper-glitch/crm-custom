import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaClient, Prisma, EntityType, UserRole } from '@prisma/client';
import { normalizePhone } from '@crm/utils';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AiSummaryService } from '../ai-summary/ai-summary.service';
import { CustomerPhonesService } from '../customers/customer-phones.service';
import { UserPhonesService } from '../user-phones/user-phones.service';
import { UsersService } from '../users/users.service';
import type { InternalCdr } from './helpers/omicall-cdr-mapper';

/**
 * Select shape cho list endpoint. recordingUrl them de player inline o UI.
 * matchedUser (avatar + name) duoc fetch + merge o list() method - schema khong
 * co Prisma relation matchedUser nen khong include nested duoc.
 */
const CALL_LOG_SELECT = {
  id: true, externalId: true, phoneNumber: true, callType: true,
  callTime: true, duration: true, content: true, analysis: true,
  matchedEntityType: true, matchedEntityId: true, matchedUserId: true,
  matchStatus: true, recordingUrl: true, hangupCause: true, disposition: true,
  endbyName: true, createdAt: true,
} satisfies Prisma.CallLogSelect;

interface EntityMatch {
  matchedEntityType: EntityType | null;
  matchedEntityId: bigint | null;
  fallbackUserId: bigint | null;
}

/** Actor toi thieu de scope call-logs theo role. */
export interface CallScopeActor {
  id: bigint;
  role: UserRole;
  teamId: bigint | null;
}

/**
 * Scope value cho where.matchedUserId theo role:
 * - undefined: khong filter (MANAGER+ / SUPER_ADMIN thay tat ca)
 * - bigint: self-scope (USER, LEADER khong team) - chi cuoc cua chinh minh
 * - { in: ids }: team-scope (LEADER co team) - cuoc cua member trong team
 */
export type CallScope = bigint | { in: bigint[] } | undefined;

@Injectable()
export class CallLogsService {
  private readonly logger = new Logger(CallLogsService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly aiSummary: AiSummaryService,
    private readonly customerPhonesService: CustomerPhonesService,
    private readonly userPhonesService: UserPhonesService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Match phone vao LEAD truoc, fallback CUSTOMER (ca so chinh + phu).
   * Tra ve assignedUserId lam fallback cho matched_user_id neu sip_user/user_phones khong khop.
   */
  private async _resolveEntityMatch(phone: string): Promise<EntityMatch> {
    const lead = await this.prisma.lead.findFirst({
      where: { phone, deletedAt: null, assignedUserId: { not: null } },
      select: { id: true, assignedUserId: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (lead) {
      return { matchedEntityType: 'LEAD', matchedEntityId: lead.id, fallbackUserId: lead.assignedUserId };
    }
    const customer = await this.customerPhonesService.findCustomerByAnyPhone(phone);
    if (customer) {
      return { matchedEntityType: 'CUSTOMER', matchedEntityId: customer.id, fallbackUserId: customer.assignedUserId };
    }
    return { matchedEntityType: null, matchedEntityId: null, fallbackUserId: null };
  }

  /**
   * Fetch users theo id list + tra map id -> { id, name }.
   * Dung de attach matchedUser vao tung row sau khi query call logs.
   * Schema khong co avatarUrl - UI render avatar tu initial cua name (vd "NA").
   */
  private async _fetchUsersByIds(userIds: bigint[]) {
    if (userIds.length === 0) return new Map<string, { id: string; name: string }>();
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    return new Map(users.map((u) => [u.id.toString(), { id: u.id.toString(), name: u.name }]));
  }

  /** Attach matchedUser (denormalized) tu user map vao tung call log row. */
  private _attachMatchedUser<T extends { matchedUserId: bigint | null }>(
    logs: T[],
    userMap: Map<string, { id: string; name: string }>,
  ): (T & { matchedUser: { id: string; name: string } | null })[] {
    return logs.map((log) => ({
      ...log,
      matchedUser: log.matchedUserId ? userMap.get(log.matchedUserId.toString()) ?? null : null,
    }));
  }

  /**
   * Tinh scope matchedUserId theo role cua actor.
   * MANAGER+ -> undefined (xem het). LEADER co team -> { in: memberIds }. USER / LEADER khong team -> self.
   * Dung chung boi list + listSalesWithCalls (DRY).
   */
  async resolveCallScope(actor: CallScopeActor): Promise<CallScope> {
    if (actor.role === UserRole.SUPER_ADMIN || actor.role === UserRole.MANAGER) {
      return undefined;
    }
    if (actor.role === UserRole.LEADER && actor.teamId != null) {
      const members = await this.prisma.user.findMany({
        where: { teamId: actor.teamId, deletedAt: null },
        select: { id: true },
      });
      const ids = members.map((m) => m.id);
      return ids.length ? { in: ids } : actor.id;
    }
    return actor.id;
  }

  async list(
    query: PaginationQueryDto & {
      matchStatus?: string;
      matchedUserFilter?: bigint;
      dateFrom?: string;
      dateTo?: string;
      phone?: string;
      callId?: string;
      callType?: string;
      minScore?: number;
      maxScore?: number;
      hasAi?: boolean;
    },
    actor: CallScopeActor,
  ) {
    const limit = query.limit ?? 20;
    const where: Prisma.CallLogWhereInput = { deletedAt: null };
    if (query.matchStatus) where.matchStatus = query.matchStatus as any;
    // Deep-link 1 cuoc goi cu the (combine voi scope ben duoi -> van kiem soat quyen).
    if (query.callId) where.id = BigInt(query.callId);

    // Scope theo role TRUOC (dat tren cung `where` de combine dung voi where.id IN o nhanh score-filter).
    const scope = await this.resolveCallScope(actor);
    if (scope !== undefined) where.matchedUserId = scope;

    // Drill-down theo sale (chi co tac dung voi MANAGER+; LEADER chi khi user do thuoc team).
    if (query.matchedUserFilter) {
      const isManager = actor.role === UserRole.SUPER_ADMIN || actor.role === UserRole.MANAGER;
      const inTeam =
        typeof scope === 'object' && scope !== null && scope.in.some((id) => id === query.matchedUserFilter);
      if (isManager || inTeam) where.matchedUserId = query.matchedUserFilter;
    }

    if (query.callType) where.callType = query.callType as any;
    // Filter by phone (used by Lead table mic icon → call history dialog)
    if (query.phone) where.phoneNumber = normalizePhone(query.phone);
    // Date range filter. Ho tro 2 format:
    // - YYYY-MM-DD (date-only): tu dong mo rong dateTo den 23:59:59 cuoi ngay
    // - YYYY-MM-DDTHH:mm (datetime-local): dung nguyen ban
    if (query.dateFrom || query.dateTo) {
      where.callTime = {};
      if (query.dateFrom) where.callTime.gte = new Date(query.dateFrom);
      if (query.dateTo) {
        const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(query.dateTo);
        where.callTime.lte = new Date(isDateOnly ? `${query.dateTo}T23:59:59.999` : query.dateTo);
      }
    }

    // AI bento filter (v2): score range + hasAi.
    // analysis luu duoi dang TEXT JSON -> cast jsonb at query time.
    // hasAi = analysis NOT NULL VA co key 'score' (loai tru log v1 chi co tags+detail).
    // Pre-resolve IDs qua raw SQL roi truyen vao where.id IN. Khong dung Prisma JSON path
    // vi column la String?, khong phai Json - Prisma path filter fail.
    if (query.minScore !== undefined || query.maxScore !== undefined || query.hasAi) {
      const conds: Prisma.Sql[] = [Prisma.sql`deleted_at IS NULL`];
      if (query.hasAi) {
        conds.push(Prisma.sql`analysis IS NOT NULL AND (analysis::jsonb ? 'score')`);
      }
      if (query.minScore !== undefined) {
        conds.push(Prisma.sql`(analysis::jsonb->>'score')::int >= ${query.minScore}`);
      }
      if (query.maxScore !== undefined) {
        conds.push(Prisma.sql`(analysis::jsonb->>'score')::int <= ${query.maxScore}`);
      }
      const whereSql = Prisma.join(conds, ' AND ');
      const rows = await this.prisma.$queryRaw<{ id: bigint }[]>`
        SELECT id FROM call_logs WHERE ${whereSql}
      `;
      const ids = rows.map((r) => r.id);
      // Empty -> return empty page som de tranh "IN (empty)" gay loi Prisma
      if (ids.length === 0) {
        return { data: [], meta: { total: 0, page: query.page ?? 1, limit, totalPages: 0 } };
      }
      where.id = { in: ids };
    }

    // Cursor-based (load-more / backward compat - dùng bởi listUnmatched + lead call dialog)
    if (query.cursor) {
      const logs = await this.prisma.callLog.findMany({
        where, select: CALL_LOG_SELECT, orderBy: { callTime: 'desc' },
        take: limit + 1, skip: 1, cursor: { id: BigInt(query.cursor) },
      });
      const hasMore = logs.length > limit;
      const sliced = hasMore ? logs.slice(0, limit) : logs;
      const userMap = await this._fetchUsersByIds(sliced.map((l) => l.matchedUserId).filter((id): id is bigint => id !== null));
      const data = this._attachMatchedUser(sliced, userMap);
      return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
    }

    // Offset-based + total count (phân trang đánh số)
    const page = query.page ?? 1;
    const [logs, total] = await Promise.all([
      this.prisma.callLog.findMany({
        where, select: CALL_LOG_SELECT, orderBy: { callTime: 'desc' },
        take: limit, skip: (page - 1) * limit,
      }),
      this.prisma.callLog.count({ where }),
    ]);
    const userMap = await this._fetchUsersByIds(logs.map((l) => l.matchedUserId).filter((id): id is bigint => id !== null));
    const data = this._attachMatchedUser(logs, userMap);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async listUnmatched(actor: CallScopeActor, limit = 20, cursor?: string) {
    return this.list({ limit, cursor, matchStatus: 'UNMATCHED' }, actor);
  }

  /**
   * List ALL active users + so cuoc goi 90 ngay gan day cho dropdown filter.
   * Tra ve tat ca user co status=ACTIVE (khong filter theo role) de manager+
   * co the filter theo bat ky nhan vien nao - ke ca nguoi chua co cuoc goi
   * (khi sip_user/user_phones chua mapping nhung user da goi).
   * Sap xep: count desc (nguoi goi nhieu len truoc), roi name asc.
   */
  async listSalesWithCalls(actor: CallScopeActor) {
    const scope = await this.resolveCallScope(actor);
    // USER khong can dropdown (chi thay cuoc cua minh) -> tra rong.
    if (typeof scope === 'bigint') return [];

    // LEADER co team -> chi member team; MANAGER+ (scope undefined) -> tat ca user active.
    const userWhere: Prisma.UserWhereInput = { status: 'ACTIVE', deletedAt: null };
    const callUserFilter: Prisma.CallLogWhereInput['matchedUserId'] =
      scope !== undefined ? scope : { not: null };
    if (scope !== undefined) userWhere.id = scope;

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const [users, grouped] = await Promise.all([
      this.prisma.user.findMany({
        where: userWhere,
        select: { id: true, name: true },
      }),
      this.prisma.callLog.groupBy({
        by: ['matchedUserId'],
        where: {
          deletedAt: null,
          matchedUserId: callUserFilter,
          callTime: { gte: ninetyDaysAgo },
        },
        _count: { id: true },
      }),
    ]);

    const countMap = new Map(grouped.map((g) => [g.matchedUserId!.toString(), g._count.id]));

    return users
      .map((u) => ({
        id: u.id.toString(),
        name: u.name,
        count: countMap.get(u.id.toString()) ?? 0,
      }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.name.localeCompare(b.name, 'vi');
      });
  }

  /** Ingest call from 3rd party. Auto-match by phone number. */
  async ingest(data: {
    externalId: string; phoneNumber: string; callType: string;
    callTime: string; duration?: number; content?: string;
  }) {
    // Dedup by external_id (chỉ check row active - cho phép re-ingest nếu row cũ đã soft-delete)
    const existing = await this.prisma.callLog.findFirst({
      where: { externalId: data.externalId, deletedAt: null },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Cuộc gọi đã tồn tại (trùng external_id)');

    const phone = normalizePhone(data.phoneNumber);

    // Match flow: user_phones FIRST → LEAD → CUSTOMER → UNMATCHED.
    // matched_user_id ưu tiên user_phones; fallback lead.assignedUserId / customer.assignedUserId.
    let matchedEntityType: EntityType | null = null;
    let matchedEntityId: bigint | null = null;
    let matchedUserId: bigint | null = null;

    // Step 1: lookup user qua user_phones (số do super admin phân cho sale)
    const userMatch = await this.userPhonesService.findUserByPhone(phone);
    if (userMatch) {
      matchedUserId = userMatch.userId;
    }

    // Step 2: match LEAD (giữ filter assignedUserId IS NOT NULL)
    const lead = await this.prisma.lead.findFirst({
      where: { phone, deletedAt: null, assignedUserId: { not: null } },
      select: { id: true, assignedUserId: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (lead) {
      matchedEntityType = 'LEAD';
      matchedEntityId = lead.id;
      if (!matchedUserId) matchedUserId = lead.assignedUserId; // fallback
    } else {
      // Step 3: match CUSTOMER - cả số chính lẫn số phụ.
      const customer = await this.customerPhonesService.findCustomerByAnyPhone(phone);
      if (customer) {
        matchedEntityType = 'CUSTOMER';
        matchedEntityId = customer.id;
        if (!matchedUserId) matchedUserId = customer.assignedUserId; // fallback
      }
    }

    // Step 4: matchStatus = AUTO_MATCHED nếu match được user HOẶC entity, UNMATCHED chỉ khi cả 2 đều null
    const matchStatus: 'AUTO_MATCHED' | 'UNMATCHED' =
      matchedUserId || matchedEntityId ? 'AUTO_MATCHED' : 'UNMATCHED';

    const callLog = await this.prisma.callLog.create({
      data: {
        externalId: data.externalId,
        phoneNumber: phone,
        callType: data.callType as any,
        callTime: new Date(data.callTime),
        duration: data.duration ?? 0,
        content: data.content,
        matchedEntityType,
        matchedEntityId,
        matchedUserId,
        matchStatus,
      },
      select: CALL_LOG_SELECT,
    });

    // If matched, create activity on entity timeline
    if (matchedEntityType && matchedEntityId && matchedUserId) {
      await this.prisma.activity.create({
        data: {
          entityType: matchedEntityType,
          entityId: matchedEntityId,
          userId: matchedUserId,
          type: 'CALL',
          content: `Cuộc gọi ${data.callType}: ${data.duration ?? 0}s`,
          metadata: { callLogId: callLog.id.toString(), callType: data.callType, duration: data.duration },
        },
      });

      // Auto IN_PROGRESS trigger if lead is ASSIGNED
      if (matchedEntityType === 'LEAD') {
        const assignedLead = await this.prisma.lead.findFirst({
          where: { id: matchedEntityId, status: 'ASSIGNED', deletedAt: null },
        });
        if (assignedLead) {
          await this.prisma.lead.update({ where: { id: matchedEntityId }, data: { status: 'IN_PROGRESS' } });
          await this.prisma.activity.create({
            data: {
              entityType: 'LEAD', entityId: matchedEntityId, userId: matchedUserId,
              type: 'STATUS_CHANGE',
              content: 'ASSIGNED → IN_PROGRESS (tự động khi có cuộc gọi)',
              metadata: { auto: true },
            },
          });
        }
      }
    }

    // Fire-and-forget AI call analysis (chi chay khi co transcript content)
    this.aiSummary.triggerFromCall(callLog.id, {
      content: data.content || null,
    }).catch(() => {});

    return callLog;
  }

  /**
   * Upsert call_logs tu OmiCall CDR webhook.
   * - INSERT moi neu chua co row co `externalId = call_uuid` (active)
   * - UPDATE row hien co neu trung (idempotent retry / lan 2 voi transcript moi)
   * - Auto-match user theo sip_user -> user_phones (fallback) -> entity.assignedUserId (fallback)
   * - Trigger AI `analyzeCall()` neu co content (transcript) va content KHAC content cu (tranh re-analyze)
   */
  async upsertFromOmicallCdr(data: InternalCdr): Promise<{ id: bigint; willAnalyze: boolean; created: boolean }> {
    // Step 1: Tim user qua sip_user (extension OmiCall) - nguon dang tin nhat
    const sipMatch = data.sipUser ? await this.usersService.findBySipUser(data.sipUser) : null;
    let matchedUserId: bigint | null = sipMatch?.userId ?? null;

    // Step 2: Fallback user_phones neu sip_user khong khop
    if (!matchedUserId) {
      const userPhoneMatch = await this.userPhonesService.findUserByPhone(data.phoneNumber);
      if (userPhoneMatch) matchedUserId = userPhoneMatch.userId;
    }

    // Step 3: Match LEAD/CUSTOMER theo phone
    const entityMatch = await this._resolveEntityMatch(data.phoneNumber);
    if (!matchedUserId) matchedUserId = entityMatch.fallbackUserId;

    const matchStatus: 'AUTO_MATCHED' | 'UNMATCHED' =
      matchedUserId || entityMatch.matchedEntityId ? 'AUTO_MATCHED' : 'UNMATCHED';

    // Step 4: Tim row hien co (idempotency by call_uuid)
    const existing = await this.prisma.callLog.findFirst({
      where: { externalId: data.callUuid, deletedAt: null },
      select: { id: true, content: true },
    });

    let callLog: { id: bigint; content: string | null };
    let created = false;

    if (existing) {
      // UPDATE: chi update content neu CDR moi co transcript (tranh xoa content cu thanh null)
      callLog = await this.prisma.callLog.update({
        where: { id: existing.id },
        data: {
          phoneNumber: data.phoneNumber,
          callType: data.callType,
          callTime: data.callTime,
          duration: data.duration,
          ...(data.content ? { content: data.content } : {}),
          recordingUrl: data.recordingUrl,
          hangupCause: data.hangupCause,
          disposition: data.disposition,
          endbyName: data.endbyName,
          omicallUserId: data.omicallUserId,
          matchedEntityType: entityMatch.matchedEntityType,
          matchedEntityId: entityMatch.matchedEntityId,
          matchedUserId,
          matchStatus,
        },
        select: { id: true, content: true },
      });
    } else {
      // INSERT
      callLog = await this.prisma.callLog.create({
        data: {
          externalId: data.callUuid,
          phoneNumber: data.phoneNumber,
          callType: data.callType,
          callTime: data.callTime,
          duration: data.duration,
          content: data.content,
          recordingUrl: data.recordingUrl,
          hangupCause: data.hangupCause,
          disposition: data.disposition,
          endbyName: data.endbyName,
          omicallUserId: data.omicallUserId,
          matchedEntityType: entityMatch.matchedEntityType,
          matchedEntityId: entityMatch.matchedEntityId,
          matchedUserId,
          matchStatus,
        },
        select: { id: true, content: true },
      });
      created = true;

      // Activity log + Auto IN_PROGRESS trigger - chi tao khi INSERT moi
      if (entityMatch.matchedEntityType && entityMatch.matchedEntityId && matchedUserId) {
        await this.prisma.activity.create({
          data: {
            entityType: entityMatch.matchedEntityType,
            entityId: entityMatch.matchedEntityId,
            userId: matchedUserId,
            type: 'CALL',
            content: `Cuoc goi ${data.callType}: ${data.duration}s`,
            metadata: {
              callLogId: callLog.id.toString(),
              callType: data.callType,
              duration: data.duration,
              source: 'omicall_webhook',
            },
          },
        });

        if (entityMatch.matchedEntityType === 'LEAD') {
          const assignedLead = await this.prisma.lead.findFirst({
            where: { id: entityMatch.matchedEntityId, status: 'ASSIGNED', deletedAt: null },
          });
          if (assignedLead) {
            await this.prisma.lead.update({
              where: { id: entityMatch.matchedEntityId },
              data: { status: 'IN_PROGRESS' },
            });
            await this.prisma.activity.create({
              data: {
                entityType: 'LEAD',
                entityId: entityMatch.matchedEntityId,
                userId: matchedUserId,
                type: 'STATUS_CHANGE',
                content: 'ASSIGNED -> IN_PROGRESS (tu dong khi co cuoc goi)',
                metadata: { auto: true },
              },
            });
          }
        }
      }
    }

    // Step 5: Trigger AI neu co transcript moi (KHAC content cu)
    const contentChanged = !!callLog.content && callLog.content !== existing?.content;
    const willAnalyze = contentChanged;
    if (willAnalyze) {
      this.aiSummary.triggerFromCall(callLog.id, { content: callLog.content })
        .catch((err) => this.logger.error(`AI trigger fail: ${err.message}`));
    }

    return { id: callLog.id, willAnalyze, created };
  }

  /** Manual match: link unmatched call to an entity. */
  async manualMatch(callId: bigint, entityType: EntityType, entityId: bigint, userId: bigint) {
    const call = await this.prisma.callLog.findFirst({
      where: { id: callId, matchStatus: 'UNMATCHED', deletedAt: null },
    });
    if (!call) throw new NotFoundException('Cuộc gọi không tìm thấy hoặc đã được ghép');

    await this.prisma.callLog.update({
      where: { id: callId },
      data: {
        matchedEntityType: entityType,
        matchedEntityId: entityId,
        matchedUserId: userId,
        matchStatus: 'MANUALLY_MATCHED',
        verifiedBy: userId,
      },
    });

    // Create activity
    await this.prisma.activity.create({
      data: {
        entityType, entityId, userId,
        type: 'CALL',
        content: `Cuộc gọi ghép thủ công: ${call.callType} ${call.duration}s`,
        // Giữ callType + duration trong metadata để UI render gọn (hướng gọi + thời lượng).
        metadata: { callLogId: callId.toString(), manual: true, callType: call.callType, duration: call.duration },
      },
    });

    return this.prisma.callLog.findUnique({ where: { id: callId }, select: CALL_LOG_SELECT });
  }

  /**
   * Soft delete call log - chỉ SUPER_ADMIN gọi (guard ở controller).
   * Set deletedAt, KHÔNG xoá vật lý. Activity reference giữ nguyên (orphan link cho phép).
   * Partial unique index trên externalId WHERE deleted_at IS NULL cho phép re-ingest cùng externalId sau khi soft-delete.
   */
  async deleteById(id: bigint) {
    const call = await this.prisma.callLog.findFirst({ where: { id, deletedAt: null } });
    if (!call) throw new NotFoundException('Cuộc gọi không tồn tại hoặc đã bị xoá');

    await this.prisma.callLog.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id: id.toString(), message: 'Đã xoá cuộc gọi' };
  }
}
