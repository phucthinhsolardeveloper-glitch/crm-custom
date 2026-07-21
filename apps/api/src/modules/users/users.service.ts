import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaClient, Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from './users.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { AdminUpdateUserDto, UpdateUserProfileDto } from './dto/update-user.dto';
import { UpsertSipConfigDto } from './dto/sip-config.dto';
import { UserListQueryDto } from './dto/user-list-query.dto';
import { AuthService } from '../auth/auth.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';

const BCRYPT_ROUNDS = 12;

type Actor = { id: bigint; role: UserRole };

/** Caller dùng cho /my-team: cần teamId để giới hạn phạm vi đội. */
type TeamScopedActor = { id: bigint; role: UserRole; teamId?: bigint | null };

/**
 * MANAGER chỉ được thao tác trên user role USER hoặc LEADER, và chỉ set/giữ role trong {USER, LEADER}.
 * LEADER nằm dưới MANAGER nên là việc vận hành bình thường; MANAGER vẫn KHÔNG chạm được MANAGER+.
 * SUPER_ADMIN không bị chặn. Gọi ở mọi entry point CRUD để tránh leo thang qua API trực tiếp.
 */
const MANAGER_TOUCHABLE_ROLES: UserRole[] = [UserRole.USER, UserRole.LEADER];

function assertActorCanTouchUser(
  actor: Actor,
  opts: { targetRole?: UserRole; desiredRole?: UserRole },
) {
  if (actor.role === UserRole.SUPER_ADMIN) return;
  if (actor.role !== UserRole.MANAGER) {
    throw new ForbiddenException('Không có quyền thao tác trên nhân viên');
  }
  if (opts.targetRole && !MANAGER_TOUCHABLE_ROLES.includes(opts.targetRole)) {
    throw new ForbiddenException('Quản lý chỉ được thao tác trên nhân viên (USER) hoặc trưởng nhóm (LEADER)');
  }
  if (opts.desiredRole && !MANAGER_TOUCHABLE_ROLES.includes(opts.desiredRole)) {
    throw new ForbiddenException('Quản lý không được gán vai trò Quản lý hoặc Super Admin');
  }
}

@Injectable()
export class UsersService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly prisma: PrismaClient,
    private readonly authService: AuthService,
    private readonly dashboardService: DashboardService,
    private readonly cacheService: CacheService,
  ) {}

  /** Danh sách rút gọn (id + name) MỌI nhân viên - cho dropdown filter.
   *  Cache 10 phút (xoá khi create/update/deactivate). Khác list() có phân trang/search. */
  async lookup() {
    return {
      data: await this.cacheService.getOrSet(
        CACHE_KEYS.LOOKUP_USERS,
        CACHE_TTL.LOOKUP,
        () => this.prisma.user.findMany({
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
      ),
    };
  }

  /**
   * Danh sách thành viên team + KPI kỳ hiện tại (tháng này). Chỉ đọc.
   * - LEADER: luôn ép theo team của chính mình (bỏ qua teamIdOverride) -> chặn xem team khác.
   * - MANAGER/SUPER_ADMIN: được phép truyền teamIdOverride để xem team bất kỳ.
   * - Không có team (teamId null) -> trả mảng rỗng (tránh lộ toàn bộ nhân viên).
   * Tái dùng getEmployeeScores (DRY) - cùng định nghĩa KPI với dashboard.
   */
  async findMyTeamMembers(actor: TeamScopedActor, teamIdOverride?: bigint) {
    const canOverride =
      actor.role === UserRole.SUPER_ADMIN || actor.role === UserRole.MANAGER;
    const teamId = canOverride && teamIdOverride != null ? teamIdOverride : actor.teamId;
    if (teamId == null) return [];

    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return this.dashboardService.getEmployeeScores(from, now, undefined, teamId);
  }

  async list(query: UserListQueryDto) {
    const where: Prisma.UserWhereInput = {
      // Ẩn tài khoản hệ thống tự sinh (đứng tên cho hành động cron) khỏi danh sách quản lý.
      email: { not: 'system@internal' },
    };
    if (query.departmentId) where.departmentId = BigInt(query.departmentId);
    if (query.role) where.role = query.role;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
      ];
    }
    return this.repo.findMany({
      where,
      cursor: query.cursor ? BigInt(query.cursor) : undefined,
      limit: query.limit,
      page: query.page,
    });
  }

  async findById(id: bigint) {
    const user = await this.repo.findById(id);
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return user;
  }

  async create(dto: CreateUserDto, actor: Actor) {
    // MANAGER chỉ được tạo USER; ép role để dto thiếu cũng an toàn.
    const role = dto.role ?? UserRole.USER;
    assertActorCanTouchUser(actor, { desiredRole: role });

    const existing = await this.repo.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email đã tồn tại');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const created = await this.repo.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
      phone: dto.phone,
      address: dto.address,
      role,
      ...(dto.departmentId ? { department: { connect: { id: BigInt(dto.departmentId) } } } : {}),
      ...(dto.teamId ? { team: { connect: { id: BigInt(dto.teamId) } } } : {}),
      ...(dto.employeeLevelId
        ? { employeeLevel: { connect: { id: BigInt(dto.employeeLevelId) } } }
        : {}),
    });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_USERS);
    return created;
  }

  async updateProfile(id: bigint, dto: UpdateUserProfileDto) {
    const data: Prisma.UserUpdateInput = {};
    if (dto.name) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.password) {
      // Đổi password self-service phải xác minh mật khẩu hiện tại - chống kẻ chiếm
      // được phiên (XSS, máy bỏ quên) đổi password để chiếm tài khoản vĩnh viễn.
      // Admin reset cho user khác đi qua adminUpdate, không qua đây.
      if (!dto.currentPassword) {
        throw new BadRequestException('Cần nhập mật khẩu hiện tại để đổi mật khẩu');
      }
      const existing = await this.prisma.user.findFirst({
        where: { id, deletedAt: null },
        select: { passwordHash: true },
      });
      if (!existing) throw new NotFoundException('Không tìm thấy người dùng');
      const ok = await bcrypt.compare(dto.currentPassword, existing.passwordHash);
      if (!ok) {
        // 400 thay vì 401: api-client phía web auto-redirect mọi 401 về /login,
        // user gõ sai mật khẩu hiện tại sẽ bị đá ra ngoài dù phiên vẫn hợp lệ.
        throw new BadRequestException('Mật khẩu hiện tại không đúng');
      }
      data.passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    }

    const user = await this.repo.update(id, data);

    // Revoke tokens on password change
    if (dto.password) {
      await this.authService.revokeAllUserTokens(id);
    }

    await this.cacheService.del(CACHE_KEYS.LOOKUP_USERS);
    return user;
  }

  async adminUpdate(id: bigint, dto: AdminUpdateUserDto, actor: Actor) {
    const existingUser = await this.repo.findById(id);
    if (!existingUser) throw new NotFoundException('Không tìm thấy người dùng');

    // Chặn MANAGER edit user role MANAGER+, hoặc đổi role của USER lên MANAGER+.
    assertActorCanTouchUser(actor, {
      targetRole: existingUser.role,
      desiredRole: dto.role,
    });

    // Email change is SUPER_ADMIN-only and requires uniqueness check.
    // Skip the work when the value is unchanged so MANAGER can submit the
    // existing email without triggering a 403.
    const emailChanging = dto.email !== undefined && dto.email !== existingUser.email;
    if (emailChanging) {
      if (actor.role !== UserRole.SUPER_ADMIN) {
        throw new ForbiddenException('Chỉ Super Admin được đổi email người dùng');
      }
      const dup = await this.prisma.user.findFirst({
        where: { email: dto.email!, deletedAt: null, id: { not: id } },
        select: { id: true },
      });
      if (dup) throw new ConflictException('Email đã được sử dụng');
    }

    const data: Prisma.UserUpdateInput = {};
    if (emailChanging) data.email = dto.email!;
    if (dto.name) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.role) data.role = dto.role;
    if (dto.status) data.status = dto.status;
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    }
    if (dto.departmentId !== undefined) {
      data.department = dto.departmentId
        ? { connect: { id: BigInt(dto.departmentId) } }
        : { disconnect: true };
    }
    if (dto.teamId !== undefined) {
      data.team = dto.teamId ? { connect: { id: BigInt(dto.teamId) } } : { disconnect: true };
    }
    if (dto.employeeLevelId !== undefined) {
      data.employeeLevel = dto.employeeLevelId
        ? { connect: { id: BigInt(dto.employeeLevelId) } }
        : { disconnect: true };
    }

    const user = await this.repo.update(id, data);

    // Revoke tokens on role change, password change, deactivation, or email change.
    // Email change invalidates JWT subject (email) used by audit/log → safest to log out.
    const roleChanged = dto.role && dto.role !== existingUser.role;
    const deactivated = dto.status === 'INACTIVE';
    if (roleChanged || deactivated || dto.password || emailChanging) {
      await this.authService.revokeAllUserTokens(id);
    }

    await this.cacheService.del(CACHE_KEYS.LOOKUP_USERS);
    return user;
  }

  async deactivate(id: bigint, actor: Actor) {
    const performedBy = actor.id;
    if (id === performedBy) {
      throw new BadRequestException('Không thể vô hiệu hóa chính mình');
    }
    const user = await this.repo.findById(id);
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');

    assertActorCanTouchUser(actor, { targetRole: user.role });

    // Run deactivation cascade in a transaction
    await this.prisma.$transaction(async (tx) => {
      // 1. Soft-delete user
      await tx.user.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'INACTIVE' },
      });

      // 2. Revoke all refresh tokens
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // 3. Unassign leads (back to dept pool)
      const leads = await tx.lead.findMany({
        where: { assignedUserId: id, deletedAt: null },
        select: { id: true, departmentId: true },
      });

      if (leads.length > 0) {
        await tx.lead.updateMany({
          where: { assignedUserId: id, deletedAt: null },
          data: { assignedUserId: null, status: 'POOL' },
        });

        // Log assignment history for each lead
        await tx.assignmentHistory.createMany({
          data: leads.map((lead) => ({
            entityType: 'LEAD' as const,
            entityId: lead.id,
            fromUserId: id,
            toUserId: null,
            fromDepartmentId: lead.departmentId,
            toDepartmentId: lead.departmentId,
            assignedBy: performedBy,
            reason: 'Tự động: người dùng bị vô hiệu hóa',
          })),
        });
      }

      // 4. Unassign customers (back to dept pool)
      const customers = await tx.customer.findMany({
        where: { assignedUserId: id, deletedAt: null },
        select: { id: true, assignedDepartmentId: true },
      });

      if (customers.length > 0) {
        await tx.customer.updateMany({
          where: { assignedUserId: id, deletedAt: null },
          data: { assignedUserId: null },
        });

        await tx.assignmentHistory.createMany({
          data: customers.map((customer) => ({
            entityType: 'CUSTOMER' as const,
            entityId: customer.id,
            fromUserId: id,
            toUserId: null,
            fromDepartmentId: customer.assignedDepartmentId,
            toDepartmentId: customer.assignedDepartmentId,
            assignedBy: performedBy,
            reason: 'Tự động: người dùng bị vô hiệu hóa',
          })),
        });
      }
    });

    await this.cacheService.del(CACHE_KEYS.LOOKUP_USERS);
    return { message: 'Đã vô hiệu hóa người dùng' };
  }

  /**
   * Bulk deactivate - loop `deactivate()` để giữ cascade (leads/customers về dept pool, refresh token revoke).
   * Skip nếu id là chính performedBy hoặc user đã soft-delete.
   */
  async bulkDeactivate(
    ids: bigint[],
    actor: Actor,
  ): Promise<{ deleted: number; skipped: number }> {
    let deleted = 0;
    let skipped = 0;
    for (const id of ids) {
      if (id === actor.id) {
        skipped++;
        continue;
      }
      try {
        // deactivate() đã tự gọi assertActorCanTouchUser; MANAGER skip target MANAGER+.
        await this.deactivate(id, actor);
        deleted++;
      } catch {
        skipped++;
      }
    }
    return { deleted, skipped };
  }

  // ─── SIP Config (OmiCall) ─────────────────────────────────────────────────

  /** Lay SIP config cua mot user (super_admin). Tra ve null neu chua cau hinh. */
  async getSipConfig(userId: bigint) {
    const config = await this.prisma.userSipConfig.findFirst({
      where: { userId, deletedAt: null },
      select: { id: true, sipRealm: true, sipUser: true, sipPassword: true, isActive: true, updatedAt: true },
    });
    return config; // null neu chua co
  }

  /** Tao/cap nhat SIP config cho user (super_admin only - guard o controller). */
  async upsertSipConfig(userId: bigint, dto: UpsertSipConfigDto) {
    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');

    const existing = await this.prisma.userSipConfig.findFirst({
      where: { userId, deletedAt: null },
      select: { id: true },
    });

    if (existing) {
      return this.prisma.userSipConfig.update({
        where: { id: existing.id },
        data: { sipRealm: dto.sipRealm, sipUser: dto.sipUser, sipPassword: dto.sipPassword, isActive: true },
        select: { id: true, sipRealm: true, sipUser: true, sipPassword: true, isActive: true, updatedAt: true },
      });
    }

    return this.prisma.userSipConfig.create({
      data: { userId, sipRealm: dto.sipRealm, sipUser: dto.sipUser, sipPassword: dto.sipPassword },
      select: { id: true, sipRealm: true, sipUser: true, sipPassword: true, isActive: true, updatedAt: true },
    });
  }

  /**
   * Tim user qua sip_user (extension OmiCall) - dung cho webhook auto-match sale.
   * Tra ve null neu khong tim thay config nao active hoac user da deactive/deleted.
   */
  async findBySipUser(sipUser: string): Promise<{ userId: bigint; departmentId: bigint | null } | null> {
    if (!sipUser) return null;
    const config = await this.prisma.userSipConfig.findFirst({
      where: { sipUser, isActive: true, deletedAt: null },
      select: { userId: true, user: { select: { departmentId: true, status: true, deletedAt: true } } },
    });
    if (!config || !config.user || config.user.status !== 'ACTIVE' || config.user.deletedAt) return null;
    return { userId: config.userId, departmentId: config.user.departmentId };
  }

  /** Soft-delete SIP config cua user (super_admin only). */
  async deleteSipConfig(userId: bigint) {
    const existing = await this.prisma.userSipConfig.findFirst({
      where: { userId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Người dùng chưa cấu hình SIP');

    await this.prisma.userSipConfig.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { message: 'Đã xóa cấu hình SIP' };
  }

  /**
   * Lay SIP credentials cho user dang login (self) - SDK OmiCall dung de register tong dai.
   * Tra ve null neu chua cau hinh hoac config inactive -> frontend khong load SDK.
   */
  async getMySipCredentials(userId: bigint) {
    const config = await this.prisma.userSipConfig.findFirst({
      where: { userId, deletedAt: null, isActive: true },
      select: { sipRealm: true, sipUser: true, sipPassword: true },
    });
    return config; // null neu chua cau hinh
  }
}
