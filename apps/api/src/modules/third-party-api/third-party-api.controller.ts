import { Controller, Post, Body, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaClient } from '@prisma/client';
import { normalizePhone, isValidVNPhone } from '@crm/utils';
import { Public } from '../auth/decorators/public-route.decorator';
import { ApiKeyAuth } from '../auth/decorators/api-key-auth.decorator';
import { CustomerPhonesService } from '../customers/customer-phones.service';
import { LeadFieldDefinitionsService } from '../lead-field-definitions/lead-field-definitions.service';

/** External lead ingestion API - requires x-api-key header. */
@Controller('external')
export class ThirdPartyApiController {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly customerPhonesService: CustomerPhonesService,
    private readonly leadFieldDefinitions: LeadFieldDefinitionsService,
  ) {}

  @Public()
  @ApiKeyAuth()
  @Post('leads')
  async createExternalLead(
    @Req() req: Request & { apiKey?: { createdBy: bigint } },
    @Body() body: {
      name: string; phone: string; email?: string;
      source?: string; product?: string; group?: string;
      note?: string; metadata?: Record<string, unknown>;
    },
  ) {
    const phone = normalizePhone(body.phone);
    if (!isValidVNPhone(phone)) {
      return { error: 'Số điện thoại không hợp lệ' };
    }

    // Whitelist source: chỉ map vào nguồn admin đã tạo sẵn. Không tự đẻ
    // nguồn mới từ API ngoài để tránh polluting master data + caller có
    // API key bơm rác bảng lead_sources.
    let sourceId: bigint | null = null;
    if (body.source) {
      const source = await this.prisma.leadSource.findFirst({
        where: { name: body.source.trim(), isActive: true },
        select: { id: true },
      });
      // Không khớp -> bỏ qua, vẫn tạo lead bình thường (không báo lỗi).
      if (source) sourceId = source.id;
    }

    // Group (Nhóm) theo tên. Group là cấp con của Nguồn -> nếu khớp thì suy
    // sourceId từ Nguồn cha của nó (ghi đè field source rời để giữ nhất quán
    // model 2 cấp). Không khớp -> bỏ qua, vẫn tạo lead bình thường.
    let groupId: bigint | null = null;
    let groupSkipPool: boolean | null = null;
    if (body.group) {
      const group = await this.prisma.leadGroup.findFirst({
        where: { name: body.group.trim(), isActive: true },
        select: { id: true, sourceId: true, skipPool: true },
      });
      if (group) {
        groupId = group.id;
        sourceId = group.sourceId;
        groupSkipPool = group.skipPool;
      }
    }

    // "Bỏ qua Kho Mới" (skip_pool) -> lead vào Kho Zoom (ZOOM) thay vì Kho Mới (POOL),
    // khớp hành vi tạo lead của MANAGER+ và import CSV. Hiệu lực: Nhóm ưu tiên
    // (group.skipPool), null = kế thừa Nguồn cha.
    let skipPool = false;
    if (sourceId) {
      const src = await this.prisma.leadSource.findFirst({
        where: { id: sourceId },
        select: { skipPool: true },
      });
      skipPool = groupSkipPool ?? src?.skipPool ?? false;
    }
    const initialStatus: 'POOL' | 'ZOOM' = skipPool ? 'ZOOM' : 'POOL';

    // Product (Sản phẩm) theo tên. Không khớp -> bỏ qua, vẫn tạo lead bình
    // thường (không tự đẻ sản phẩm từ API ngoài, cũng không báo lỗi).
    let productId: bigint | null = null;
    if (body.product) {
      const product = await this.prisma.product.findFirst({
        where: { name: body.product.trim(), isActive: true, deletedAt: null },
        select: { id: true },
      });
      if (product) productId = product.id;
    }

    // Chỉ TÌM customer sẵn có theo phone (dedup). KHÔNG tạo customer lúc tạo lead:
    // customer chỉ sinh ra khi lead có đơn hoặc convert. Không match -> customerId null.
    const customer = await this.customerPhonesService.findCustomerByAnyPhone(phone);

    // Validate metadata: key phải khớp lead_field_definitions active (như đường web).
    // Key lạ -> 400, chặn API ngoài bơm rác metadata. Size limit 10KB giữ nguyên.
    let validatedMetadata: object | undefined;
    if (body.metadata && Object.keys(body.metadata).length > 0) {
      const metaStr = JSON.stringify(body.metadata);
      if (metaStr.length > 10_000) {
        return { error: 'metadata quá lớn (tối đa 10KB)' };
      }
      const validated = await this.leadFieldDefinitions.validateCustomMetadata(body.metadata);
      const cleaned = Object.fromEntries(
        Object.entries(validated).filter(([, v]) => v !== null),
      );
      validatedMetadata = Object.keys(cleaned).length > 0 ? cleaned : undefined;
    }

    // Note (ghi chú) = Activity type NOTE. Tác giả = người tạo API key
    // (apiKey.createdBy), vì caller bên ngoài không phải user đăng nhập.
    // Bỏ qua note rỗng / whitespace-only để tránh noise trong timeline.
    const trimmedNote = body.note?.trim();
    const noteAuthorId = req.apiKey?.createdBy ?? null;

    // Atomic: tạo lead + (optional) note activity trong cùng transaction.
    // No dedup for API - always create new lead.
    const customerId = customer?.id ?? null;
    const lead = await this.prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          phone, name: body.name, email: body.email,
          status: initialStatus,
          ...(customerId ? { customerId } : {}),
          sourceId,
          groupId,
          productId,
          ...(validatedMetadata ? { metadata: validatedMetadata } : {}),
        },
        select: { id: true, phone: true, name: true, status: true, customerId: true },
      });

      if (trimmedNote && noteAuthorId) {
        await tx.activity.create({
          data: {
            entityType: 'LEAD',
            entityId: created.id,
            userId: noteAuthorId,
            type: 'NOTE',
            content: trimmedNote,
          },
        });
      }

      return created;
    });

    return { data: lead };
  }
}
