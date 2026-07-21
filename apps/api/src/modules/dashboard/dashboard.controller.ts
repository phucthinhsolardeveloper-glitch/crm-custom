import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { DashboardBlocksService } from './dashboard-blocks.service';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { Roles } from '../auth/decorators/roles-required.decorator';

// FE gửi ISO đầy đủ (có giờ phút, đã convert từ UTC+7 local sang UTC ở client).
// Fallback default: tháng hiện tại đến now nếu thiếu hoặc parse fail.
function parseDates(from?: string, to?: string) {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const parseOrDefault = (s: string | undefined, fallback: Date): Date => {
    if (!s) return fallback;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? fallback : d;
  };
  return {
    dateFrom: parseOrDefault(from, defaultFrom),
    dateTo: parseOrDefault(to, now),
  };
}

/** CSV "1,2,3" -> [1n,2n,3n]. Rỗng/undefined -> undefined (không filter dept). */
function parseDeptIds(deptIds?: string): bigint[] | undefined {
  if (!deptIds) return undefined;
  const ids = deptIds.split(',').filter(Boolean).map(BigInt);
  return ids.length ? ids : undefined;
}

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly service: DashboardService,
    private readonly blocksService: DashboardBlocksService,
  ) {}

  // ── Analytics blocks (Nguồn lead / Sản phẩm / Thanh toán / Hạng khách / mở rộng) ──
  @Get('source-quality')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getSourceQuality(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.blocksService.getSourceQuality(dateFrom, dateTo) };
  }

  @Get('revenue/by-product-category')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getRevenueByProductCategory(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.blocksService.getRevenueByProductCategory(dateFrom, dateTo) };
  }

  @Get('tier-distribution')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getTierDistribution() {
    return { data: await this.blocksService.getTierDistribution() };
  }

  @Get('tier-movement')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getTierMovement(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.blocksService.getTierMovement(dateFrom, dateTo) };
  }

  @Get('conversion-by-hour')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getConversionByHour(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.blocksService.getConversionByHour(dateFrom, dateTo) };
  }

  @Get('receivables')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getReceivables(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.blocksService.getReceivables(dateFrom, dateTo) };
  }

  @Get('stats')
  async getStats(@CurrentUser() user: any, @Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getStats(user.id, user.role, dateFrom, dateTo, user.teamId) };
  }

  @Get('lead-funnel')
  async getLeadFunnel(@CurrentUser() user: any, @Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getLeadFunnel(user.id, user.role, dateFrom, dateTo, user.teamId) };
  }

  @Get('revenue-trend')
  async getRevenueTrend(@CurrentUser() user: any, @Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getRevenueTrend(user.id, user.role, dateFrom, dateTo, user.teamId) };
  }

  @Get('top-performers')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getTopPerformers(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getTopPerformers(dateFrom, dateTo) };
  }

  @Get('leads-by-source')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getLeadsBySource(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getLeadsBySource(dateFrom, dateTo) };
  }

  @Get('conversion-trend')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getConversionTrend(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getConversionTrend(dateFrom, dateTo) };
  }

  @Get('lead-aging')
  async getLeadAging(@CurrentUser() user: any) {
    return { data: await this.service.getLeadAging(user.id, user.role, user.teamId) };
  }

  @Get('new-vs-returning')
  async getNewVsReturning(@CurrentUser() user: any, @Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getNewVsReturning(user.id, user.role, dateFrom, dateTo, user.teamId) };
  }

  @Get('dept-performance')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getDeptPerformance(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getDeptPerformance(dateFrom, dateTo) };
  }

  @Get('team-performance')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getTeamPerformance(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getTeamPerformance(dateFrom, dateTo) };
  }

  @Get('employee-scores')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getEmployeeScores(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('deptIds') deptIds?: string,
  ) {
    const { dateFrom, dateTo } = parseDates(from, to);
    const departmentIds = parseDeptIds(deptIds);
    return { data: await this.service.getEmployeeScores(dateFrom, dateTo, departmentIds) };
  }

  @Get('employee-reports/calls')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getEmployeeCallReport(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('deptIds') deptIds?: string,
  ) {
    const { dateFrom, dateTo } = parseDates(from, to);
    const departmentIds = parseDeptIds(deptIds);
    return { data: await this.service.getEmployeeCallReport(dateFrom, dateTo, departmentIds) };
  }

  @Get('employee-reports/sales-breakdown')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getEmployeeSalesBreakdown(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('deptIds') deptIds?: string,
  ) {
    const { dateFrom, dateTo } = parseDates(from, to);
    const departmentIds = parseDeptIds(deptIds);
    return { data: await this.service.getEmployeeSalesBreakdown(dateFrom, dateTo, departmentIds) };
  }

  // ── Revenue dashboard endpoints (no-quota) ──────────────────────────
  @Get('revenue/overview')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getRevenueOverview(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getRevenueOverview(dateFrom, dateTo) };
  }

  @Get('revenue/by-product')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getRevenueByProduct(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getRevenueByProduct(dateFrom, dateTo) };
  }

  @Get('revenue/dept-comparison')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getRevenueDeptComparison(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getDeptComparison(dateFrom, dateTo) };
  }

  @Get('revenue/podium')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getRevenuePodium(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getRevenuePodium(dateFrom, dateTo) };
  }

  @Get('revenue/leaderboard')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getRevenueLeaderboard(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getRevenueLeaderboard(dateFrom, dateTo) };
  }

  // ── H1 Cash Flow Decomposition (Top N + Khác pattern) ───────────────
  @Get('revenue/by-payment-type')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getRevenueByPaymentType(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getRevenueByPaymentType(dateFrom, dateTo) };
  }

  @Get('revenue/by-order-format')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getRevenueByOrderFormat(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getRevenueByOrderFormat(dateFrom, dateTo) };
  }

  @Get('revenue/by-product-group')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getRevenueByProductGroup(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getRevenueByProductGroup(dateFrom, dateTo) };
  }

  @Get('revenue/by-bank-account')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getRevenueByBankAccount(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getRevenueByBankAccount(dateFrom, dateTo) };
  }

  @Get('revenue/by-installment')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getRevenueByInstallment(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getRevenueByInstallment(dateFrom, dateTo) };
  }

  @Get('revenue/by-tier')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getRevenueByTier(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getRevenueByTier(dateFrom, dateTo) };
  }

  @Get('revenue/daily-by-group')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getRevenueDailyByGroup(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getRevenueDailyByGroup(dateFrom, dateTo) };
  }

  @Get('revenue/sankey-source-format-tier')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getRevenueSankey(@Query('from') from?: string, @Query('to') to?: string) {
    const { dateFrom, dateTo } = parseDates(from, to);
    return { data: await this.service.getRevenueSankey(dateFrom, dateTo) };
  }

  /** Drill-down: lấy items ngoài Top N. URL: /revenue/dimension-items/:dim?from=&to=&excludeTop= */
  @Get('revenue/dimension-items/:dim')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getRevenueByDimensionItems(
    @Param('dim') dim: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('excludeTop') excludeTopStr?: string,
  ) {
    const validDims = ['payment-type', 'order-format', 'product-group', 'bank-account', 'installment', 'tier'] as const;
    if (!validDims.includes(dim as any)) {
      throw new BadRequestException(`Invalid dim. Must be one of: ${validDims.join(', ')}`);
    }
    const { dateFrom, dateTo } = parseDates(from, to);
    const excludeTop = excludeTopStr ? Math.max(0, parseInt(excludeTopStr, 10)) : 5;
    return {
      data: await this.service.getRevenueByDimensionItems(
        dim as typeof validDims[number],
        dateFrom, dateTo, excludeTop,
      ),
    };
  }

  @Get('employee-reports/sales-breakdown/customers')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async getSalesBreakdownCustomers(
    @Query('userId') userIdStr: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('labelId') labelIdStr?: string,
    @Query('untouched') untouchedStr?: string,
    @Query('other') otherStr?: string,
    @Query('cursor') cursorStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    if (!userIdStr) {
      throw new BadRequestException('userId is required');
    }
    const { dateFrom, dateTo } = parseDates(from, to);
    return {
      data: await this.service.getEmployeeSalesBreakdownCustomers({
        userId: BigInt(userIdStr),
        labelId: labelIdStr ? BigInt(labelIdStr) : undefined,
        untouched: untouchedStr === 'true' || untouchedStr === '1',
        other: otherStr === 'true' || otherStr === '1',
        dateFrom,
        dateTo,
        cursor: cursorStr ? BigInt(cursorStr) : undefined,
        limit: limitStr ? parseInt(limitStr, 10) : undefined,
      }),
    };
  }
}
