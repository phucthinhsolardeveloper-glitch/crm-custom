import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient, BankAccountDirection } from '@prisma/client';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';

/** Các trường cấu hình 1 tài khoản ngân hàng (dùng chung cho create/update). */
interface BankAccountInput {
  name: string;
  accountNumber?: string;
  bankName?: string;
  accountHolder?: string;
  direction?: BankAccountDirection;
  label?: string;
  labelColor?: string;
  isActive?: boolean;
}

@Injectable()
export class BankAccountsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cacheService: CacheService,
  ) {}

  /** Chỉ TK active - nguồn cho dropdown tạo đơn/thanh toán, dashboard. Có cache. */
  async list() {
    return {
      data: await this.cacheService.getOrSet(
        CACHE_KEYS.LOOKUP_BANK_ACCOUNTS,
        CACHE_TTL.LOOKUP,
        () => this.prisma.bankAccount.findMany({ where: { isActive: true }, orderBy: { id: 'asc' } }),
      ),
    };
  }

  /** Toàn bộ TK (gồm cả DEACTIVE) cho trang settings - admin-only, không cache. */
  async listAll() {
    return { data: await this.prisma.bankAccount.findMany({ orderBy: { id: 'asc' } }) };
  }

  async create(data: BankAccountInput) {
    const result = await this.prisma.bankAccount.create({
      data: {
        name: data.name.trim(),
        accountNumber: data.accountNumber,
        bankName: data.bankName,
        accountHolder: data.accountHolder,
        direction: data.direction,
        label: data.label,
        labelColor: data.labelColor,
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_BANK_ACCOUNTS);
    return result;
  }

  async update(id: bigint, data: Partial<BankAccountInput>) {
    const ba = await this.prisma.bankAccount.findUnique({ where: { id } });
    if (!ba) throw new NotFoundException('Không tìm thấy tài khoản ngân hàng');
    // Prisma bỏ qua field undefined -> chỉ cập nhật trường được gửi lên.
    const result = await this.prisma.bankAccount.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name.trim() : undefined,
        accountNumber: data.accountNumber,
        bankName: data.bankName,
        accountHolder: data.accountHolder,
        direction: data.direction,
        label: data.label,
        labelColor: data.labelColor,
        isActive: data.isActive,
      },
    });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_BANK_ACCOUNTS);
    return result;
  }

  async deactivate(id: bigint) {
    const result = await this.prisma.bankAccount.update({ where: { id }, data: { isActive: false } });
    await this.cacheService.del(CACHE_KEYS.LOOKUP_BANK_ACCOUNTS);
    return result;
  }
}
