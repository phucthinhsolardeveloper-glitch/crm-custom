'use client';

import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SettingsCrudTable } from '@/components/settings/settings-crud-table';
import { invalidateLeadFormBootstrap } from '@/lib/api/lead-form-bootstrap-cache';
import type { SettingsItem } from '@/types/entities';

interface LeadSourceSettingsProps {
  data: SettingsItem[];
  canEdit: boolean;
}

export function LeadSourceSettings({ data, canEdit }: LeadSourceSettingsProps) {
  function handleManualRefresh() {
    invalidateLeadFormBootstrap();
    toast.success('Đã làm mới cache form lead - lần mở drawer kế tiếp sẽ tải data mới');
  }

  return (
    <div className="space-y-3">
      {/* Manual refresh - dùng khi data nguồn/sản phẩm đổi từ tab/thiết bị khác,
          hoặc khi user muốn force reload không đợi TTL 4h hết hạn. */}
      <div className="flex items-center justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleManualRefresh}
          title="Xóa cache nguồn + sản phẩm trên trình duyệt này"
          className="text-slate-600"
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Làm mới cache form
        </Button>
      </div>

      <SettingsCrudTable
        data={data}
        endpoint="/lead-sources"
        entityName="Nguồn lead"
        canEdit={canEdit}
        // Auto-invalidate cache sau khi CRUD source -> drawer next time tải fresh data
        onMutate={invalidateLeadFormBootstrap}
        fields={[
          { key: 'name', label: 'Tên nguồn', required: true, placeholder: 'VD: Facebook Ads' },
          { key: 'description', label: 'Mô tả', placeholder: 'Mô tả nguồn lead' },
          { key: 'skipPool', label: 'Bỏ qua Kho Mới', type: 'checkbox', placeholder: 'Tự động phân phối AI, không vào pool' },
        ]}
        columns={[
          { key: 'name', label: 'Tên nguồn', className: 'font-medium text-slate-800' },
          {
            key: 'description', label: 'Mô tả',
            render: (item) => item.description
              ? <span className="text-slate-500">{String(item.description)}</span>
              : <span className="text-slate-300">-</span>,
          },
          {
            key: 'skipPool', label: 'Phân phối', className: 'w-32',
            render: (item) => item.skipPool
              ? <span className="inline-flex text-xs bg-sky-100 text-sky-700 rounded-full px-2 py-0.5 font-medium">Auto</span>
              : <span className="inline-flex text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">Vào pool</span>,
          },
        ]}
      />
    </div>
  );
}
