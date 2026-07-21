import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, HttpCode, BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { AdminUpdateUserDto, UpdateUserProfileDto } from './dto/update-user.dto';
import { UpsertSipConfigDto } from './dto/sip-config.dto';
import { UserListQueryDto } from './dto/user-list-query.dto';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  async list(@Query() query: UserListQueryDto) {
    return this.usersService.list(query);
  }

  // Danh sách rút gọn (id + name) mọi nhân viên cho dropdown filter - cache 10 phút.
  // Khai báo TRƯỚC @Get(':id') để route động không nuốt 'lookup'.
  @Get('lookup')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  async lookup() {
    return this.usersService.lookup();
  }

  /**
   * Thành viên team + KPI kỳ hiện tại. Read-only, team-scoped.
   * LEADER bị ép theo team của mình; MANAGER/SUPER_ADMIN có thể truyền ?teamId= để xem team khác.
   * Khai báo TRƯỚC @Get(':id') để không bị route động bắt nhầm 'my-team' thành id.
   */
  @Get('my-team')
  @Roles(UserRole.LEADER, UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async findMyTeam(
    @CurrentUser() currentUser: { id: bigint; role: UserRole; teamId?: bigint | null },
    @Query('teamId') teamId?: string,
  ) {
    const data = await this.usersService.findMyTeamMembers(
      currentUser,
      teamId ? BigInt(teamId) : undefined,
    );
    return { data };
  }

  @Get(':id')
  async findById(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() currentUser: { id: bigint; role: UserRole },
  ) {
    // Users can only view themselves unless they're manager+
    if (currentUser.role === UserRole.USER && currentUser.id !== id) {
      const user = await this.usersService.findById(currentUser.id);
      return { data: user };
    }
    const user = await this.usersService.findById(id);
    return { data: user };
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() currentUser: { id: bigint; role: UserRole },
  ) {
    const user = await this.usersService.create(dto, currentUser);
    return { data: user };
  }

  @Patch('profile')
  async updateProfile(
    @Body() dto: UpdateUserProfileDto,
    @CurrentUser() currentUser: { id: bigint },
  ) {
    const user = await this.usersService.updateProfile(currentUser.id, dto);
    return { data: user };
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  async adminUpdate(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: AdminUpdateUserDto,
    @CurrentUser() currentUser: { id: bigint; role: UserRole },
  ) {
    const user = await this.usersService.adminUpdate(id, dto, currentUser);
    return { data: user };
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  async deactivate(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() currentUser: { id: bigint; role: UserRole },
  ) {
    return this.usersService.deactivate(id, currentUser);
  }

  @Post('bulk-delete')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  async bulkDelete(
    @Body() body: { ids: string[] },
    @CurrentUser() currentUser: { id: bigint; role: UserRole },
  ) {
    if (!body.ids?.length) throw new BadRequestException('ids là bắt buộc');
    if (body.ids.length > 100) throw new BadRequestException('Tối đa 100 người dùng mỗi lần');
    const result = await this.usersService.bulkDeactivate(
      body.ids.map(id => BigInt(id)),
      currentUser,
    );
    return { data: result };
  }

  // ─── SIP Config (OmiCall) ─────────────────────────────────────────────────

  /** SIP credentials cho user dang login - OmiCall SDK dung de register. */
  @Get('me/sip-credentials')
  async getMySipCredentials(
    @CurrentUser() currentUser: { id: bigint },
  ) {
    const creds = await this.usersService.getMySipCredentials(currentUser.id);
    return { data: creds };
  }

  @Get(':id/sip-config')
  @Roles(UserRole.SUPER_ADMIN)
  async getSipConfig(@Param('id', ParseBigIntPipe) id: bigint) {
    const config = await this.usersService.getSipConfig(id);
    return { data: config };
  }

  @Put(':id/sip-config')
  @Roles(UserRole.SUPER_ADMIN)
  async upsertSipConfig(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UpsertSipConfigDto,
  ) {
    const config = await this.usersService.upsertSipConfig(id, dto);
    return { data: config };
  }

  @Delete(':id/sip-config')
  @Roles(UserRole.SUPER_ADMIN)
  async deleteSipConfig(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.usersService.deleteSipConfig(id);
  }
}
