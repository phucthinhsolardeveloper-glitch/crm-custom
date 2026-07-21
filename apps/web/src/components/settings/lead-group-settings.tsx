'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SettingsCrudTable } from '@/components/settings/settings-crud-table';
import { LeadGroupBulkMoveDialog } from '@/components/settings/lead-group-bulk-move-dialog';
import { invalidateLeadFormBootstrap } from '@/lib/api/lead-form-bootstrap-cache';
import type { SettingsItem } from '@/types/entities';

interface LeadGroupSettingsProps {
  /** Tất cả nhóm (mỗi nhóm có sourceId trỏ Nguồn cha). */
  groups: SettingsItem[];
  /** Danh sách Nguồn cha để chọn. */
  sources: SettingsItem[];
  canEdit: boolean;
}

/**
 * Quản lý Nhóm nguồn theo từng Nguồn cha. Chọn 1 Nguồn -> CRUD các nhóm con của nó.
 * Nhóm = MANAGER+ được sửa (canEdit). sourceId tự inject vào body khi tạo qua extraBody.
 */
export function LeadGroupSettings({ groups, sources, canEdit }: LeadGroupSettingsProps) {
  const [selectedSourceId, setSelectedSourceId] = useState<string>(sources[0]?.id ?? '');
  // State cho hộp thoại đổi nguồn hàng loạt.
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [pendingGroupIds, setPendingGroupIds] = useState<string[]>([]);
  const [clearTableSelection, setClearTableSelection] = useState<() => void>(() => () => {});

  const filteredGroups = groups.filter((g) => String(g.sourceId) === selectedSourceId);

  if (sources.length === 0) {
    return <p className="text-sm text-slate-400">Chưa có Nguồn nào. Tạo Nguồn trước khi thêm Nhóm.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Chọn Nguồn   </label>
        <select
          value={selectedSourceId}
          onChange={(e) => setSelectedSourceId(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
        >
          {sources.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <SettingsCrudTable
        data={filteredGroups}
        endpoint="/lead-groups"
        entityName="Nhóm nguồn"
        canEdit={canEdit}
        extraBody={{ sourceId: selectedSourceId }}
        onMutate={invalidateLeadFormBootstrap}
        selectable={canEdit}
        renderBulkBar={(selectedIds, clear) => (
          <Button
            size="sm"
            onClick={() => {
              setPendingGroupIds(selectedIds);
              setClearTableSelection(() => clear);
              setMoveDialogOpen(true);
            }}
          >
            Đổi nguồn
          </Button>
        )}
        fields={[
          { key: 'name', label: 'Tên nhóm', required: true, placeholder: 'VD: Facebook Ads - Chiến dịch T6' },
          { key: 'description', label: 'Mô tả', placeholder: 'Mô tả nhóm nguồn' },
          {
            key: 'skipPool', label: 'Định tuyến vào pool', type: 'select',
            options: [
              { value: '', label: 'Theo Nguồn cha (mặc định)' },
              { value: 'true', label: 'Bỏ qua Kho Mới (tự động phân phối)' },
              { value: 'false', label: 'Luôn vào Kho Mới' },
            ],
          },
        ]}
        columns={[
          { key: 'name', label: 'Tên nhóm', className: 'font-medium text-slate-800' },
          {
            key: 'description', label: 'Mô tả',
            render: (item) => item.description
              ? <span className="text-slate-500">{String(item.description)}</span>
              : <span className="text-slate-300">-</span>,
          },
          {
            key: 'skipPool', label: 'Phân phối', className: 'w-32',
            // Tri-state: null = theo Nguồn cha; true = Auto (skip pool); false = ép vào pool.
            render: (item) => item.skipPool === true
              ? <span className="inline-flex text-xs bg-sky-100 text-sky-700 rounded-full px-2 py-0.5 font-medium">Auto</span>
              : item.skipPool === false
                ? <span className="inline-flex text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">Vào pool</span>
                : <span className="inline-flex text-xs bg-amber-50 text-amber-600 rounded-full px-2 py-0.5">Theo nguồn</span>,
          },
        ]}
      />

      <LeadGroupBulkMoveDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        groupIds={pendingGroupIds}
        sources={sources}
        currentSourceId={selectedSourceId}
        onSuccess={() => {
          invalidateLeadFormBootstrap();
          clearTableSelection();
        }}
      />
    </div>
  );
}
