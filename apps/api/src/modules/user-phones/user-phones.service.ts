import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { isValidVNPhone, normalizePhone } from '@crm/utils';
import { UserPhonesRepository } from './user-phones.repository';
import { CreateUserPhoneDto } from './dto/create-user-phone.dto';
import { ListUserPhonesDto } from './dto/list-user-phones.dto';
import { TransferUserPhoneDto } from './dto/transfer-user-phone.dto';
import { BulkCreateUserPhoneDto } from './dto/bulk-create-user-phone.dto';

interface BulkRowResult {
  phone: string;
  userId: string;
  status: 'CREATED' | 'SKIPPED' | 'FAILED';
  reason?: string;
  id?: string;
}

@Injectable()
export class UserPhonesService {
  constructor(private readonly repo: UserPhonesRepository) {}

  async list(query: ListUserPhonesDto) {
    return this.repo.list({
      userId: query.userId ? BigInt(query.userId) : undefined,
      phone: query.phone ? normalizePhone(query.phone) : undefined,
      cursor: query.cursor ? BigInt(query.cursor) : undefined,
      limit: query.limit ?? 20,
    });
  }

  async listByUser(userId: bigint) {
    return this.repo.listByUser(userId);
  }

  async getHistory(userPhoneId: bigint) {
    const row = await this.repo.findById(userPhoneId);
    if (!row) {
      throw new NotFoundException('Không tìm thấy SĐT phân');
    }
    return this.repo.listHistoryByPhone(row.phone);
  }

  async create(dto: CreateUserPhoneDto, assignedBy: bigint) {
    const phone = normalizePhone(dto.phone);
    if (!isValidVNPhone(phone)) {
      throw new BadRequestException('Số điện thoại không hợp lệ');
    }
    const userId = BigInt(dto.userId);
    if (!(await this.repo.userExists(userId))) {
      throw new BadRequestException('Nhân viên không tồn tại');
    }
    const existing = await this.repo.findActiveByPhone(phone);
    if (existing) {
      throw new ConflictException('Số điện thoại đã được phân cho nhân viên khác');
    }
    return this.repo.create({ phone, userId, assignedBy, note: dto.note });
  }

  async transfer(id: bigint, dto: TransferUserPhoneDto, changedBy: bigint) {
    const newUserId = BigInt(dto.newUserId);
    const current = await this.repo.findById(id);
    if (!current) {
      throw new NotFoundException('Không tìm thấy SĐT phân');
    }
    if (current.userId === newUserId) {
      throw new BadRequestException('SĐT đang thuộc nhân viên này');
    }
    if (!(await this.repo.userExists(newUserId))) {
      throw new BadRequestException('Nhân viên đích không tồn tại');
    }
    const result = await this.repo.transferTx(id, newUserId, changedBy, dto.note);
    if (!result) {
      throw new NotFoundException('Không tìm thấy SĐT phân');
    }
    return result;
  }

  async remove(id: bigint, changedBy: bigint) {
    const result = await this.repo.softDeleteTx(id, changedBy);
    if (!result) {
      throw new NotFoundException('Không tìm thấy SĐT phân');
    }
    return { id: result.id.toString(), message: 'Đã xóa SĐT phân' };
  }

  async bulkCreate(dto: BulkCreateUserPhoneDto, assignedBy: bigint) {
    const created: BulkRowResult[] = [];
    const skipped: BulkRowResult[] = [];
    const failed: BulkRowResult[] = [];

    for (const item of dto.items) {
      const rawPhone = item.phone;
      try {
        const phone = normalizePhone(rawPhone);
        if (!isValidVNPhone(phone)) {
          failed.push({ phone: rawPhone, userId: item.userId, status: 'FAILED', reason: 'SĐT không hợp lệ' });
          continue;
        }
        const userId = BigInt(item.userId);
        if (!(await this.repo.userExists(userId))) {
          failed.push({ phone, userId: item.userId, status: 'FAILED', reason: 'Nhân viên không tồn tại' });
          continue;
        }
        const existing = await this.repo.findActiveByPhone(phone);
        if (existing) {
          skipped.push({ phone, userId: item.userId, status: 'SKIPPED', reason: 'SĐT đã được phân' });
          continue;
        }
        const row = await this.repo.create({ phone, userId, assignedBy, note: item.note });
        created.push({ phone, userId: item.userId, status: 'CREATED', id: row.id.toString() });
      } catch (err) {
        failed.push({
          phone: rawPhone,
          userId: item.userId,
          status: 'FAILED',
          reason: err instanceof Error ? err.message : 'Lỗi không xác định',
        });
      }
    }

    return { created, skipped, failed };
  }

  /** Internal API for CallLogsService - lookup user assigned to a phone. */
  async findUserByPhone(phone: string): Promise<{ userId: bigint; userPhoneId: bigint } | null> {
    const normalized = normalizePhone(phone);
    const row = await this.repo.findActiveByPhone(normalized);
    if (!row) return null;
    return { userId: row.userId, userPhoneId: row.id };
  }
}
