import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { normalizePhone, isValidVNPhone } from '@crm/utils';
import { CustomerPhonesService } from '../customers/customer-phones.service';

// Cột "Nhóm" trong CSV được resolve thành Nhóm (group). skipPool là giá trị HIỆU LỰC
// (Nhóm ưu tiên, null kế thừa Nguồn cha) - đã resolve sẵn ở import.processor preloadLookups.
export type LookupGroup = { id: bigint; name: string; sourceId: bigint; skipPool: boolean };
export type LookupProduct = { id: bigint; name: string };
export type LookupLabel = { id: bigint; name: string };

export interface LookupMaps {
  groupMap: Map<string, LookupGroup>;
  productMap: Map<string, LookupProduct>;
  labelMap: Map<string, LookupLabel>;
}

/**
 * Dữ liệu dedup nạp sẵn cho 1 lô (batch) lead - thay cho query per-row.
 * - customerByPhone: SĐT (normalized) -> customerId của khách đã có.
 * - existingLeadCombos: tập khóa "phone|groupId|productId" của lead đã tồn tại
 *   (gồm cả lead trong DB lẫn lead hợp lệ đã thấy ở các dòng trước trong file).
 */
export interface LeadPrefetch {
  customerByPhone: Map<string, bigint>;
  existingLeadCombos: Set<string>;
}

/** Khóa dedup lead: SĐT + nhóm + sản phẩm (null -> chuỗi rỗng). */
export function leadComboKey(
  phone: string,
  groupId: bigint | null,
  productId: bigint | null,
): string {
  return `${phone}|${groupId ?? ''}|${productId ?? ''}`;
}

export interface ParsedLead {
  rowNum: number;
  phone: string;
  name: string;
  email: string | null;
  sourceId: bigint | null;   // Nguồn cha (suy ra từ nhóm)
  groupId: bigint | null;    // Nhóm (resolve từ cột "Nhóm" CSV)
  skipPool: boolean;         // skipPool hiệu lực (Nhóm ưu tiên, null kế thừa Nguồn) -> status POOL/ZOOM
  productId: bigint | null;
  existingCustomerId: bigint | null;
  csvLabelNames: string[];
  resolvedFirstLabelId: bigint | null;
  noteRaw: string;
  metadata: Record<string, string>;
  warnings: string[];
}

export interface ParsedCustomer {
  rowNum: number;
  phone: string;
  name: string;
  email: string | null;
  companyName: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  zaloUrl: string | null;
  linkedinUrl: string | null;
  shortDescription: string | null;
  description: string | null;
  noteRaw: string;
  csvLabelNames: string[];
  matchedLabelIds: bigint[];
  warnings: string[];
}

export type ValidationResult<T> =
  | { valid: true; parsed: T; warnings: string[] }
  | { valid: false; error: string };

const LEAD_KNOWN_KEYS = new Set([
  'phone', 'Số điện thoại',
  'name', 'Họ tên',
  'email', 'Email',
  'group', 'Nhóm',
  'source', 'Nguồn',
  'product', 'Sản phẩm',
  'labels', 'Nhãn',
  'note', 'Ghi chú',
]);

@Injectable()
export class ImportValidationService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    private readonly customerPhonesService: CustomerPhonesService,
  ) {}

  /**
   * Validate 1 dòng lead dùng dữ liệu dedup đã nạp sẵn theo lô (prefetch) - KHÔNG query
   * DB ở đây nữa (tránh N+1). Phần check trùng customer/lead tra map/set in-memory.
   */
  validateLeadRow(
    row: Record<string, string>,
    rowNum: number,
    lookups: LookupMaps,
    prefetch: LeadPrefetch,
  ): ValidationResult<ParsedLead> {
    const warnings: string[] = [];
    const phone = normalizePhone(row.phone || row['Số điện thoại'] || '');
    const name = row.name || row['Họ tên'] || phone;
    if (!phone) return { valid: false, error: 'Thiếu số điện thoại' };
    if (!isValidVNPhone(phone)) return { valid: false, error: `SĐT không hợp lệ: ${phone}` };

    const existingCustomerId: bigint | null = prefetch.customerByPhone.get(phone) ?? null;

    // Cột "Nhóm" CSV -> resolve thành lead_group; giữ tương thích cột "Nguồn"/"source" cũ.
    // Không khớp nhóm nào -> groupId/sourceId = null (KHÔNG fail dòng).
    const groupName = row.group || row['Nhóm'] || row.source || row['Nguồn'] || null;
    const group = groupName ? lookups.groupMap.get(groupName.toLowerCase()) ?? null : null;
    const groupId = group?.id ?? null;
    const sourceId = group?.sourceId ?? null;  // Nguồn cha suy ra từ nhóm
    const skipPool = group?.skipPool ?? false;
    // Có ghi tên nhóm nhưng không khớp -> cảnh báo (vàng), vẫn import với nhóm trống.
    if (groupName && !group) {
      warnings.push(`Không tìm thấy nhóm "${groupName}" - để trống nhóm`);
    }

    const productName = row.product || row['Sản phẩm'] || null;
    let product: LookupProduct | null = null;
    if (productName) {
      const key = productName.toLowerCase();
      product =
        lookups.productMap.get(key) ||
        [...lookups.productMap.values()].find((p) => p.name.toLowerCase().includes(key)) ||
        null;
      if (!product) {
        return { valid: false, error: `Sản phẩm "${productName}" không tồn tại trong hệ thống` };
      }
    }
    const productId = product?.id ?? null;

    // Dedup theo Nhóm (giữ đúng độ mịn cũ: nguồn cũ = nhóm mới) + SĐT + sản phẩm.
    // Tra tập đã nạp sẵn (DB + các dòng trước trong file) thay cho query per-row.
    if (prefetch.existingLeadCombos.has(leadComboKey(phone, groupId, productId))) {
      return { valid: false, error: `Trùng lead: SĐT ${phone} + nhóm + sản phẩm` };
    }

    const labelsRaw = row.labels || row['Nhãn'] || '';
    const noteRaw = (row.note || row['Ghi chú'] || '').trim();
    const csvLabelNames = labelsRaw.trim()
      ? labelsRaw.split(',').map((l) => l.trim()).filter(Boolean)
      : [];

    let resolvedFirstLabelId: bigint | null = null;
    const resolvedLabelNames: string[] = [];
    for (const labelName of csvLabelNames) {
      const found = lookups.labelMap.get(labelName.toLowerCase());
      if (found) {
        resolvedLabelNames.push(labelName);
        if (resolvedFirstLabelId === null) resolvedFirstLabelId = found.id;
      } else {
        warnings.push(`Nhãn "${labelName}" không tồn tại trong hệ thống - bỏ qua`);
      }
    }
    if (resolvedLabelNames.length > 1) {
      warnings.push(
        `Lead chỉ nhận 1 nhãn - áp dụng "${resolvedLabelNames[0]}", bỏ qua: ${resolvedLabelNames.slice(1).join(', ')}`,
      );
    }

    const metadata: Record<string, string> = {};
    for (const [key, val] of Object.entries(row)) {
      if (!LEAD_KNOWN_KEYS.has(key) && val && val.trim()) {
        metadata[key] = val.trim();
      }
    }

    return {
      valid: true,
      warnings,
      parsed: {
        rowNum,
        phone,
        name,
        email: row.email || null,
        sourceId,
        groupId,
        skipPool,
        productId,
        existingCustomerId,
        csvLabelNames,
        resolvedFirstLabelId,
        noteRaw,
        metadata,
        warnings,
      },
    };
  }

  /**
   * Nạp sẵn dedup cho 1 lô lead bằng 2-3 query batch (thay N+1):
   * - customerByPhone qua `findCustomersByPhones` (2 query IN).
   * - existingLeadCombos qua 1 query `lead.findMany WHERE phone IN (...)`.
   */
  async buildLeadPrefetch(rawPhones: string[]): Promise<LeadPrefetch> {
    const uniq = [...new Set(rawPhones.map((p) => normalizePhone(p)).filter(Boolean))];
    const customerByPhone = await this.customerPhonesService.findCustomersByPhones(uniq);
    const existingLeadCombos = new Set<string>();
    if (uniq.length > 0) {
      const leads = await this.prisma.lead.findMany({
        where: { phone: { in: uniq }, deletedAt: null },
        select: { phone: true, groupId: true, productId: true },
      });
      for (const l of leads) {
        existingLeadCombos.add(leadComboKey(l.phone, l.groupId, l.productId));
      }
    }
    return { customerByPhone, existingLeadCombos };
  }

  /**
   * Nạp sẵn dedup cho 1 lô customer: trả tập SĐT (normalized) đã tồn tại
   * (số chính + số phụ) bằng 2 query batch thay cho N lần `assertPhoneNotExists`.
   */
  async buildCustomerPrefetch(rawPhones: string[]): Promise<Set<string>> {
    const uniq = [...new Set(rawPhones.map((p) => normalizePhone(p)).filter(Boolean))];
    const customerByPhone = await this.customerPhonesService.findCustomersByPhones(uniq);
    return new Set(customerByPhone.keys());
  }

  async insertLead(
    parsed: ParsedLead,
    phoneCache: Map<string, bigint>,
    createdBy: bigint | null,
  ): Promise<string[]> {
    const warnings = [...parsed.warnings];
    // Chỉ TÌM customer sẵn có theo phone (dedup). KHÔNG tạo customer lúc import lead:
    // customer chỉ sinh ra khi lead có đơn hoặc convert. Không match -> customerId null.
    let customerId = parsed.existingCustomerId ?? phoneCache.get(parsed.phone) ?? null;
    if (!customerId) {
      const dbCustomer = await this.customerPhonesService.findCustomerByAnyPhone(parsed.phone);
      if (dbCustomer) {
        customerId = dbCustomer.id;
        phoneCache.set(parsed.phone, customerId);
      }
    }

    const status: 'POOL' | 'ZOOM' = parsed.skipPool ? 'ZOOM' : 'POOL';

    const lead = await this.prisma.lead.create({
      data: {
        phone: parsed.phone,
        name: parsed.name,
        email: parsed.email,
        status,
        customerId,
        sourceId: parsed.sourceId,
        groupId: parsed.groupId,
        productId: parsed.productId,
        ...(Object.keys(parsed.metadata).length > 0 ? { metadata: parsed.metadata } : {}),
      },
    });

    let labelId = parsed.resolvedFirstLabelId;
    if (labelId === null && customerId) {
      // Inherit first label from existing customer when CSV had none.
      const firstCustLabel = await this.prisma.customerLabel.findFirst({
        where: { customerId },
        select: { labelId: true },
      });
      if (firstCustLabel) labelId = firstCustLabel.labelId;
    }
    if (labelId !== null) {
      await this.prisma.lead.update({
        where: { id: lead.id },
        data: { labelId, labelAssignedAt: new Date() },
      });
    }

    if (parsed.noteRaw) {
      if (createdBy) {
        await this.prisma.activity.create({
          data: {
            entityType: 'LEAD',
            entityId: lead.id,
            userId: createdBy,
            type: 'NOTE',
            content: parsed.noteRaw,
          },
        });
      } else {
        warnings.push('Không xác định được người upload - note bị bỏ qua');
      }
    }

    return warnings;
  }

  /**
   * Validate 1 dòng customer dùng tập SĐT đã tồn tại nạp sẵn (prefetch) - KHÔNG query
   * DB ở đây. `existingPhones` gồm SĐT trong DB + SĐT hợp lệ đã thấy ở dòng trước.
   */
  validateCustomerRow(
    row: Record<string, string>,
    rowNum: number,
    lookups: LookupMaps,
    existingPhones: Set<string>,
  ): ValidationResult<ParsedCustomer> {
    const warnings: string[] = [];
    const phone = normalizePhone(row.phone || row['Số điện thoại'] || '');
    const name = row.name || row['Họ tên'] || '';
    if (!phone || !name) return { valid: false, error: 'Thiếu phone hoặc name' };
    if (!isValidVNPhone(phone)) return { valid: false, error: `SĐT không hợp lệ: ${phone}` };

    if (existingPhones.has(phone)) {
      return { valid: false, error: `Trùng khách hàng: SĐT ${phone}` };
    }

    const labelsRaw = row.labels || row['Nhãn'] || '';
    const csvLabelNames = labelsRaw.trim()
      ? labelsRaw.split(',').map((l) => l.trim()).filter(Boolean)
      : [];
    const matchedLabelIds: bigint[] = [];
    for (const labelName of csvLabelNames) {
      const found = lookups.labelMap.get(labelName.toLowerCase());
      if (found) {
        matchedLabelIds.push(found.id);
      } else {
        warnings.push(`Nhãn "${labelName}" không tồn tại trong hệ thống - bỏ qua`);
      }
    }

    return {
      valid: true,
      warnings,
      parsed: {
        rowNum,
        phone,
        name,
        email: row.email || row['Email'] || null,
        companyName: row.companyName || row['Công ty'] || null,
        facebookUrl: row.facebookUrl || row['Facebook'] || null,
        instagramUrl: row.instagramUrl || row['Instagram'] || null,
        zaloUrl: row.zaloUrl || row['Zalo'] || null,
        linkedinUrl: row.linkedinUrl || row['LinkedIn'] || null,
        shortDescription: row.shortDescription || row['Mô tả ngắn'] || null,
        description: row.description || row['Mô tả'] || null,
        noteRaw: (row.note || row['Ghi chú'] || '').trim(),
        csvLabelNames,
        matchedLabelIds,
        warnings,
      },
    };
  }

  async insertCustomer(parsed: ParsedCustomer, createdBy: bigint | null): Promise<string[]> {
    const warnings = [...parsed.warnings];
    const customer = await this.prisma.customer.create({
      data: {
        phone: parsed.phone,
        name: parsed.name,
        email: parsed.email,
        ...(parsed.companyName ? { companyName: parsed.companyName } : {}),
        ...(parsed.facebookUrl ? { facebookUrl: parsed.facebookUrl } : {}),
        ...(parsed.instagramUrl ? { instagramUrl: parsed.instagramUrl } : {}),
        ...(parsed.zaloUrl ? { zaloUrl: parsed.zaloUrl } : {}),
        ...(parsed.linkedinUrl ? { linkedinUrl: parsed.linkedinUrl } : {}),
        ...(parsed.shortDescription ? { shortDescription: parsed.shortDescription } : {}),
        ...(parsed.description ? { description: parsed.description } : {}),
      },
    });

    if (parsed.matchedLabelIds.length > 0) {
      await this.prisma.customerLabel.createMany({
        data: parsed.matchedLabelIds.map((labelId) => ({ customerId: customer.id, labelId })),
        skipDuplicates: true,
      });
    }

    if (parsed.noteRaw) {
      if (createdBy) {
        await this.prisma.activity.create({
          data: {
            entityType: 'CUSTOMER',
            entityId: customer.id,
            userId: createdBy,
            type: 'NOTE',
            content: parsed.noteRaw,
          },
        });
      } else {
        warnings.push('Không xác định được người upload - note bị bỏ qua');
      }
    }

    return warnings;
  }
}
