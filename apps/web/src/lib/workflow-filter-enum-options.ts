/**
 * Enum options cho SmartValuePicker trong workflow filter builder.
 *
 * Khi user pick var co valueType = 1 trong cac enum type (lead-status,
 * customer-status, order-status, payment-status, task-priority, ...),
 * picker se goi getEnumOptions(valueType) de lay danh sach option hien thi.
 *
 * Quy tac:
 * - Tra ve null neu valueType khong phai enum (ham caller fallback ve Input)
 * - value cua option = giong het enum string trong DB (CAPITALIZED), de match
 *   chinh xac voi event payload khi JsonLogic chay
 * - label = ten hien thi tieng Viet (de user de doc)
 *
 * Source of truth: packages/database/prisma/schema.prisma
 */

import type { ValueType } from './workflow-event-payload-hints';

export interface EnumOption {
  value: string;
  label: string;
}

export function getEnumOptions(valueType: ValueType): EnumOption[] | null {
  switch (valueType) {
    case 'lead-status':
      return [
        { value: 'POOL', label: 'Kho chung' },
        { value: 'ASSIGNED', label: 'Da phan cho sale' },
        { value: 'IN_PROGRESS', label: 'Dang cham soc' },
        { value: 'CONVERTED', label: 'Da chuyen don' },
        { value: 'LOST', label: 'Mat lead' },
        { value: 'FLOATING', label: 'Kho tha noi' },
        { value: 'ZOOM', label: 'Zoom (legacy)' },
      ];

    case 'customer-status':
      return [
        { value: 'ACTIVE', label: 'Dang cham soc' },
        { value: 'INACTIVE', label: 'Da hoan tat' },
        { value: 'FLOATING', label: 'Kho tha noi' },
      ];

    case 'order-status':
      return [
        { value: 'PENDING', label: 'Dang chay' },
        { value: 'COMPLETED', label: 'Hoan thanh' },
      ];

    case 'payment-status':
      return [
        { value: 'PENDING', label: 'Cho duyet' },
        { value: 'VERIFIED', label: 'Da xac nhan' },
        { value: 'REJECTED', label: 'Sai thong tin' },
        { value: 'REFUNDED', label: 'Da hoan tien' },
        { value: 'CANCELLED', label: 'Da huy' },
      ];

    case 'task-priority':
      return [
        { value: 'LOW', label: 'Thap' },
        { value: 'MEDIUM', label: 'Trung binh' },
        { value: 'HIGH', label: 'Cao' },
      ];

    case 'call-direction':
      // Schema chi co 1 enum CallType - khong tach direction/status rieng
      return [
        { value: 'OUTGOING', label: 'Goi di' },
        { value: 'INCOMING', label: 'Goi den' },
        { value: 'MISSED', label: 'Nho goi' },
      ];

    case 'call-status':
      // Schema khong co enum rieng cho status - fallback Input
      return null;

    case 'user-role':
      return [
        { value: 'USER', label: 'Sale' },
        { value: 'MANAGER', label: 'Quan ly' },
        { value: 'SUPER_ADMIN', label: 'Super Admin' },
      ];

    case 'entity-type':
      // Schema EntityType chi co LEAD va CUSTOMER
      return [
        { value: 'LEAD', label: 'Lead' },
        { value: 'CUSTOMER', label: 'Khach hang' },
      ];

    default:
      return null;
  }
}
