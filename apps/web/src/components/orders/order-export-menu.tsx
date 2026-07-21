'use client';

import { Button } from '@/components/ui/button';
import { Download, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

interface OrderExportMenuProps {
  exportQuery: string; // query string filter hiện tại (đã bỏ page/limit/cursor)
}

/**
 * Nút xuất CSV cho trang /orders với 2 lựa chọn:
 * - "Tải dạng hiện tại": khuôn 39 cột nội bộ (exportFiltered).
 * - "Tải dạng kế toán": khuôn 22 cột khớp file đối soát (format=accounting).
 * Cả 2 mở endpoint qua /api/proxy để kèm cookie auth; forward filter đang lọc.
 */
export function OrderExportMenu({ exportQuery }: OrderExportMenuProps) {
  const base = `/api/proxy/payments/export-csv`;
  const currentUrl = `${base}${exportQuery ? `?${exportQuery}` : ''}`;
  const accountingUrl = `${base}?${exportQuery ? `${exportQuery}&` : ''}format=accounting`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-1" />
          Xuất CSV
          <ChevronDown className="h-4 w-4 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => window.open(currentUrl, '_blank')}>
          Tải dạng hiện tại
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.open(accountingUrl, '_blank')}>
          Tải dạng kế toán
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
