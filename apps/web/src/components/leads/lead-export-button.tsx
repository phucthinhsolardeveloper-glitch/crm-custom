'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useKhoBaseParams } from '@/components/leads/kho-base-params-context';
import { mergeKhoParams } from '@/components/leads/kho-config';

/**
 * Nút "Xuất CSV" cho trang leads (chỉ render cho manager+ qua prop showExportButton
 * ở LeadsToolbarRow). Forward TOÀN BỘ filter hiện tại trên URL sang endpoint export
 * → file CSV khớp đúng những lead đang xem. BE đã xử lý phân quyền + sanitize.
 *
 * Tải file: fetch qua /api/proxy (kèm cookie auth httpOnly), nhận blob rồi tạo
 * thẻ <a download>. FE tự đặt tên file nên không phụ thuộc header server.
 */
export function LeadExportButton() {
  const searchParams = useSearchParams();
  // Trang kho: merge điều kiện scope kho (fix cứng trong code) vào query export.
  const khoBaseParams = useKhoBaseParams();
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    if (loading) return;
    setLoading(true);
    try {
      // Bỏ cursor (chỉ dùng cho infinite scroll); giữ mọi filter khác.
      const qp = mergeKhoParams(new URLSearchParams(searchParams.toString()), khoBaseParams);
      qp.delete('cursor');
      const qs = qp.toString();

      const res = await fetch(`/api/proxy/leads/export-csv${qs ? `?${qs}` : ''}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const date = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads-export-${date}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Đã xuất file CSV');
    } catch {
      toast.error('Xuất CSV thất bại, vui lòng thử lại');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={handleExport} disabled={loading} className="gap-1.5">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      Xuất CSV
    </Button>
  );
}
