import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { normalizePhone } from '@crm/utils';

export interface ContactLookupResult {
  type: 'LEAD' | 'CUSTOMER';
  id: bigint;
  name: string;
  phone: string;
}

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Tim lead/customer theo SĐT. Dung cho OmiCall searchRemoteContact
   * (hien thi ten nguoi goi tren popup incoming call).
   *
   * Khong ap dung buildAccessFilter vi day la caller ID - moi user deu can
   * biet ai dang goi den. Chi tra ve {name, type, id}, khong tra data chi tiet.
   */
  async lookupByPhone(phone: string): Promise<ContactLookupResult | null> {
    const normalized = normalizePhone(phone);

    // 1) Match Lead (uu tien lead dang active - co assignedUserId)
    const lead = await this.prisma.lead.findFirst({
      where: { phone: normalized, deletedAt: null },
      select: { id: true, name: true, phone: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (lead) {
      return { type: 'LEAD', id: lead.id, name: lead.name, phone: lead.phone };
    }

    // 2) Match Customer so chinh
    const customer = await this.prisma.customer.findFirst({
      where: { phone: normalized, deletedAt: null },
      select: { id: true, name: true, phone: true },
    });

    if (customer) {
      return { type: 'CUSTOMER', id: customer.id, name: customer.name, phone: customer.phone };
    }

    // 3) Match Customer so phu (customer_phones)
    const altPhone = await this.prisma.customerPhone.findFirst({
      where: { phone: normalized, deletedAt: null },
      include: {
        customer: { select: { id: true, name: true, phone: true, deletedAt: true } },
      },
    });

    if (altPhone?.customer && !altPhone.customer.deletedAt) {
      return {
        type: 'CUSTOMER',
        id: altPhone.customer.id,
        name: altPhone.customer.name,
        phone: altPhone.customer.phone,
      };
    }

    return null;
  }
}
