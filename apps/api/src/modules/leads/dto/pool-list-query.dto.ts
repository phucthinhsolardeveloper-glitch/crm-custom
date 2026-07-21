import { IsOptional, IsString, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { toOptionalStringArray } from './lead-list-query.dto';

// Status intentionally OMITTED - each pool endpoint has fixed status scope to prevent bypass.
export class PoolListQueryDto extends PaginationQueryDto {
  // Filter đa chọn: accept single hoặc multi value -> normalize string[] (xem toOptionalStringArray).
  @IsOptional() @Transform(toOptionalStringArray) @IsArray() @IsString({ each: true }) sourceId?: string[];
  @IsOptional() @Transform(toOptionalStringArray) @IsArray() @IsString({ each: true }) groupId?: string[];
  @IsOptional() @Transform(toOptionalStringArray) @IsArray() @IsString({ each: true }) productId?: string[];
  @IsOptional() @Transform(toOptionalStringArray) @IsArray() @IsString({ each: true }) assignedUserId?: string[];
  @IsOptional() @Transform(toOptionalStringArray) @IsArray() @IsString({ each: true }) departmentId?: string[];
  @IsOptional() @Transform(toOptionalStringArray) @IsArray() @IsString({ each: true }) labelId?: string[];
  @IsOptional() @IsString() hasOrder?: string;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @IsString() search?: string;
  // ISO datetime to-the-minute (e.g. "2026-05-11T08:30") - filters lead.lastAssignedAt range
  @IsOptional() @IsString() assignedFrom?: string;
  @IsOptional() @IsString() assignedTo?: string;
}
