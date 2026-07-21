import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { stringify } from 'csv-stringify/sync';
import { sanitizeCsvRow } from '@crm/utils';

@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaClient) {}

  async exportLeads(filters: { status?: string; departmentId?: string; sourceId?: string }) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (filters.status) where.status = filters.status;
    if (filters.departmentId) where.departmentId = BigInt(filters.departmentId);
    if (filters.sourceId) where.sourceId = BigInt(filters.sourceId);

    const leads = await this.prisma.lead.findMany({
      where,
      include: {
        customer: { select: { name: true, phone: true } },
        source: { select: { name: true } },
        product: { select: { name: true } },
        assignedUser: { select: { name: true } },
        department: { select: { name: true } },
      },
      orderBy: { id: 'desc' },
      take: 10000,
    });

    const rows = leads.map((lead) => sanitizeCsvRow({
      ID: lead.id.toString(),
      'Họ tên': lead.name,
      'Số điện thoại': lead.phone,
      Email: lead.email || '',
      'Trạng thái': lead.status,
      Nguồn: lead.source?.name || '',
      'Sản phẩm': lead.product?.name || '',
      'Nhân viên': lead.assignedUser?.name || '',
      'Phòng ban': lead.department?.name || '',
      'Ngày tạo': lead.createdAt.toISOString(),
    }));

    return stringify(rows, { header: true });
  }

  async exportCustomers(filters: { status?: string; departmentId?: string }) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (filters.status) where.status = filters.status;
    if (filters.departmentId) where.assignedDepartmentId = BigInt(filters.departmentId);

    const customers = await this.prisma.customer.findMany({
      where,
      include: {
        assignedUser: { select: { name: true } },
        assignedDepartment: { select: { name: true } },
      },
      orderBy: { id: 'desc' },
      take: 10000,
    });

    const rows = customers.map((c) => sanitizeCsvRow({
      ID: c.id.toString(),
      'Họ tên': c.name,
      'Số điện thoại': c.phone,
      Email: c.email || '',
      'Trạng thái': c.status,
      'Nhân viên': c.assignedUser?.name || '',
      'Phòng ban': c.assignedDepartment?.name || '',
      'Ngày tạo': c.createdAt.toISOString(),
    }));

    return stringify(rows, { header: true });
  }

  async exportOrders(filters: { status?: string; customerId?: string }) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (filters.status) where.status = filters.status;
    if (filters.customerId) where.customerId = BigInt(filters.customerId);

    const orders = await this.prisma.order.findMany({
      where,
      include: {
        customer: { select: { name: true, phone: true } },
        product: { select: { name: true } },
        creator: { select: { name: true } },
      },
      orderBy: { id: 'desc' },
      take: 10000,
    });

    const rows = orders.map((o) => sanitizeCsvRow({
      ID: o.id.toString(),
      'Khách hàng': o.customer.name,
      'SĐT': o.customer.phone,
      'Sản phẩm': o.product?.name || '',
      'Số tiền': o.amount.toString(),
      VAT: o.vatAmount.toString(),
      'Tổng': o.totalAmount.toString(),
      'Trạng thái': o.status,
      'Người tạo': o.creator.name,
      'Ngày tạo': o.createdAt.toISOString(),
    }));

    return stringify(rows, { header: true });
  }
}
