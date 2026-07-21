import { IsOptional, IsString, IsEnum, IsArray, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';
import { LeadStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

// Whitelist các field FE được phép sort - tránh inject Prisma orderBy arbitrary field.
// `totalAmount` defer client-side sort (Prisma không order theo aggregate trong 1 query).
export const LEAD_SORT_FIELDS = ['createdAt', 'updatedAt', 'name', 'lastAssignedAt', 'status'] as const;
export type LeadSortField = (typeof LEAD_SORT_FIELDS)[number];

// Normalize query param sang string[]. Chấp nhận mọi dạng:
//   - single  (?x=1)            -> ['1']
//   - multi   (?x=1&x=2)        -> ['1','2']
//   - CSV     (?x=1,2)          -> ['1','2']  (phòng thủ: client cũ/bookmark có thể gửi CSV)
// Các field dùng helper này đều là id số nên tách theo ',' an toàn. Empty -> undefined để @IsOptional bỏ qua.
export const toOptionalStringArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const arr = Array.isArray(value) ? (value as unknown[]) : [value];
  const flat = arr.flatMap((v) => String(v).split(',')).map((s) => s.trim()).filter(Boolean);
  return flat.length ? flat : undefined;
};

// Filter "phân bổ" 3-state - không có cột tương ứng trong DB; service translate sang Prisma where.
//   - UNASSIGNED: lead chưa thuộc phòng ban (kho mới toàn hệ thống)
//   - DEPT: đã thuộc phòng ban nhưng chưa gán sale (kho phòng ban)
//   - USER: đã có sale assigned
export enum AssignmentFilter {
  UNASSIGNED = 'unassigned',
  DEPT = 'dept',
  USER = 'user',
}

export class LeadListQueryDto extends PaginationQueryDto {
  // Status accept multi (?status=POOL&status=ZOOM) HOẶC single (?status=POOL) - backward compat.
  // Transform normalize sang array. Empty value (undefined) giữ nguyên để @IsOptional bỏ qua.
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return Array.isArray(value) ? value : [value];
  })
  @IsArray()
  @IsEnum(LeadStatus, { each: true })
  status?: LeadStatus[];

  @IsOptional()
  @IsEnum(AssignmentFilter)
  assignment?: AssignmentFilter;

  // Các filter đa chọn: accept single (?x=1) hoặc multi (?x=1&x=2). @Transform normalize -> string[].
  @IsOptional() @Transform(toOptionalStringArray) @IsArray() @IsString({ each: true })
  teamId?: string[];

  @IsOptional() @Transform(toOptionalStringArray) @IsArray() @IsString({ each: true })
  sourceId?: string[];

  @IsOptional() @Transform(toOptionalStringArray) @IsArray() @IsString({ each: true })
  groupId?: string[];

  @IsOptional() @Transform(toOptionalStringArray) @IsArray() @IsString({ each: true })
  productId?: string[];

  @IsOptional() @Transform(toOptionalStringArray) @IsArray() @IsString({ each: true })
  assignedUserId?: string[];

  @IsOptional() @Transform(toOptionalStringArray) @IsArray() @IsString({ each: true })
  departmentId?: string[];

  @IsOptional() @Transform(toOptionalStringArray) @IsArray() @IsString({ each: true })
  labelId?: string[];

  @IsOptional()
  @IsString()
  hasOrder?: string; // 'true' or 'false'

  // 'true' -> chỉ trả lead có SĐT trùng (phone xuất hiện ở 2+ lead chưa xóa).
  // Khớp icon "trùng" trên UI bảng (duplicateCount > 1).
  @IsOptional()
  @IsString()
  duplicatesOnly?: string;

  // 'true' -> chỉ trả lead có SĐT KHÔNG trùng (phone chỉ xuất hiện ở đúng 1 lead chưa xóa).
  // Nghịch đảo của duplicatesOnly. Nếu cả 2 cùng gửi, duplicatesOnly ưu tiên (xem service).
  @IsOptional()
  @IsString()
  nonDuplicatesOnly?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string; // ISO date

  @IsOptional()
  @IsString()
  dateTo?: string; // ISO date

  @IsOptional()
  @IsString()
  search?: string;

  // ISO datetime to-the-minute - filters lead.lastAssignedAt range
  @IsOptional() @IsString() assignedFrom?: string;
  @IsOptional() @IsString() assignedTo?: string;

  // Sort field whitelist (xem LEAD_SORT_FIELDS). Mặc định backend giữ `lastAssignedAt desc, id desc`
  // khi không truyền sortBy. Cursor branch BỎ QUA sortBy (cursor cần stable `id desc`).
  @IsOptional() @IsIn([...LEAD_SORT_FIELDS]) sortBy?: LeadSortField;
  @IsOptional() @IsIn(['asc', 'desc']) sortDir?: 'asc' | 'desc';
}
