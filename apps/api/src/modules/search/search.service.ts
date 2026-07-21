import { Injectable } from '@nestjs/common';
import { PrismaClient, Prisma, UserRole } from '@prisma/client';

interface CurrentUser {
  id: bigint;
  role: UserRole;
  departmentId: bigint | null;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Global search across leads, customers, orders. Role-scoped for USER. */
  async search(query: string, limit = 10, user?: CurrentUser) {
    // USER role scoping: only search own records
    const leadScope: Prisma.LeadWhereInput = user?.role === UserRole.USER
      ? { assignedUserId: user.id } : {};
    const customerScope: Prisma.CustomerWhereInput = user?.role === UserRole.USER
      ? { assignedUserId: user.id } : {};
    const orderScope: Prisma.OrderWhereInput = user?.role === UserRole.USER
      ? { createdBy: user.id } : {};

    const [leads, customers, orders] = await Promise.all([
      this.prisma.lead.findMany({
        where: {
          deletedAt: null,
          ...leadScope,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query } },
            { email: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, phone: true, status: true },
        take: limit,
      }),
      this.prisma.customer.findMany({
        where: {
          deletedAt: null,
          ...customerScope,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query } },
            { email: { contains: query, mode: 'insensitive' } },
            // Match số phụ qua relation `phones` (active only)
            { phones: { some: { phone: { contains: query }, deletedAt: null } } },
          ],
        },
        select: { id: true, name: true, phone: true, status: true },
        take: limit,
      }),
      this.prisma.order.findMany({
        where: {
          deletedAt: null,
          ...orderScope,
          customer: {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { phone: { contains: query } },
              { phones: { some: { phone: { contains: query }, deletedAt: null } } },
            ],
          },
        },
        select: { id: true, totalAmount: true, status: true, customer: { select: { name: true } } },
        take: limit,
      }),
    ]);

    return { leads, customers, orders };
  }
}
