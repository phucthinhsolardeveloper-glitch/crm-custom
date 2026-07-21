import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Pagination query parameters.
 * Supports both cursor-based (cursor) and offset-based (page) pagination.
 * When `page` is provided and `cursor` is absent, offset pagination is used.
 */
export class PaginationQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 20;

  /** Offset-based page number (1-indexed). When set (and no cursor), uses skip/count. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}
