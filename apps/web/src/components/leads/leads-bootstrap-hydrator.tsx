'use client';

import { useEffect } from 'react';
import { setLeadsBootstrap } from '@/lib/api/lead-form-bootstrap-cache';
import type { NamedEntity, LabelEntity } from '@/types/entities';

interface Props {
  users?: NamedEntity[];
  departments?: NamedEntity[];
  labels?: LabelEntity[];
  sources?: NamedEntity[];
  products?: NamedEntity[];
}

/**
 * Hydrator client component - chạy trên mount để pre-populate
 * localStorage cache từ data đã được server component fetch.
 *
 * Mục đích: tránh client-side refetch các reference data (users, departments,
 * labels, sources, products) trong các dialog/drawer khi user click. Page
 * /leads đã có đủ data từ server, hydrator chuyển nó vào cache để
 * LeadQuickActionsPanel, LeadEditDrawer, ... dùng getCached() là hit ngay.
 *
 * Render null - không có visual output.
 */
export function LeadsBootstrapHydrator({ users, departments, labels, sources, products }: Props) {
  useEffect(() => {
    void setLeadsBootstrap({ users, departments, labels, sources, products });
  }, [users, departments, labels, sources, products]);
  return null;
}
