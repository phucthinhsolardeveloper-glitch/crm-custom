import { Controller, Get, Post, Patch, Delete, Body, Param, Query, BadRequestException } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { UserRole } from '@prisma/client';
import { ProductsService } from './products.service';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

class ProductListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  includeInactive?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  // Loc theo loai: 'combo' | 'normal' (mac dinh tat ca)
  @IsOptional()
  @IsString()
  type?: string;
}

@Controller('products')
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get()
  async list(@Query() query: ProductListQueryDto) {
    return this.service.list(query);
  }

  // Danh sách rút gọn (id + name) mọi SP đang bán cho dropdown filter - cache 10 phút.
  // Đặt trước ':id' để không bị route param nuốt mất.
  @Get('lookup')
  async lookup() {
    return this.service.lookup();
  }

  // Đặt trước ':id' để không bị route param nuốt mất.
  @Get('category-counts')
  async categoryCounts() {
    return { data: await this.service.categoryCounts() };
  }

  // Đếm theo loại (all/combo/normal/inactive) cho sidebar mới. Đặt trước ':id'.
  @Get('type-counts')
  async typeCounts() {
    return { data: await this.service.typeCounts() };
  }

  // Tem phiên bản catalog cho FE tự làm mới cache localStorage khi có ai CRUD sản phẩm.
  // Siêu nhẹ (1 aggregate + 1 count). Đặt trước ':id' để không bị route param nuốt mất.
  @Get('cache-version')
  async cacheVersion() {
    return { data: await this.service.cacheVersion() };
  }

  @Get(':id')
  async findById(@Param('id', ParseBigIntPipe) id: bigint) {
    return { data: await this.service.findById(id) };
  }

  @Post()
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async create(@Body() body: { name: string; price: number; description?: string; categoryId?: string; vatRate?: number; isCombo?: boolean; childProductIds?: string[] }) {
    if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
      throw new BadRequestException('Tên sản phẩm là bắt buộc');
    }
    if (body.price === undefined || body.price === null) {
      throw new BadRequestException('Giá sản phẩm là bắt buộc');
    }
    if (typeof body.price !== 'number' || body.price < 0) {
      throw new BadRequestException('Giá sản phẩm phải là số không âm');
    }
    return { data: await this.service.create(body) };
  }

  @Patch(':id')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async update(@Param('id', ParseBigIntPipe) id: bigint, @Body() body: Record<string, unknown>) {
    return { data: await this.service.update(id, body as any) };
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async delete(@Param('id', ParseBigIntPipe) id: bigint) {
    await this.service.softDelete(id);
    return { data: { message: 'Đã xóa sản phẩm' } };
  }
}
