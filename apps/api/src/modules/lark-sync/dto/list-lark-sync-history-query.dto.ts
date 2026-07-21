import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/**
 * Query loc + phan trang cho lich su dong bo Lark.
 * - status: 'all' (mac dinh) | 'success' | 'failed'
 * - mappingId: loc theo duong ong Lark (id, dang string)
 * - search: tim theo paymentId / orderId (so) hoac larkRecordId / ten kenh
 */
export class ListLarkSyncHistoryQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['all', 'success', 'failed'])
  status?: 'all' | 'success' | 'failed';

  @IsOptional()
  @IsString()
  mappingId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
