'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFormAction } from '@/hooks/use-form-action';
import { getLeadSources } from '@/lib/api/lead-form-bootstrap-cache';
import type { NamedEntity } from '@/types/entities';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName: string;
  currentSourceId?: string | null;
}

/**
 * Mini dialog đổi nguồn (lead source) cho lead.
 * - Backend: PATCH /leads/:id body { sourceId } - MANAGER+ only (UI gate ở caller)
 * - Audit log auto qua AuditLogInterceptor (action LEAD_UPDATE)
 * - Reuse getLeadSources() cache (4h TTL, populated by LeadsBootstrapHydrator)
 * - "Không có" option để clear sourceId (set null)
 */
export function LeadSourceQuickEditDialog({
  open, onOpenChange, leadId, leadName, currentSourceId,
}: Props) {
  const [sources, setSources] = useState<NamedEntity[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [selected, setSelected] = useState<string>(currentSourceId ?? '');
  const action = useFormAction({ successMessage: 'Đã đổi nguồn' });

  // Reset selected khi mở dialog
  useEffect(() => {
    if (open) setSelected(currentSourceId ?? '');
  }, [open, currentSourceId]);

  // Load sources khi mở
  useEffect(() => {
    if (!open) return;
    setLoadingSources(true);
    getLeadSources()
      .then(setSources)
      .catch(() => {})
      .finally(() => setLoadingSources(false));
  }, [open]);

  async function handleSave() {
    // selected='' → null (bỏ nguồn). PATCH body chỉ chứa sourceId field.
    const sourceId = selected || null;
    const result = await action.execute('patch', `/leads/${leadId}`, { sourceId });
    if (result) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Đổi nguồn lead</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-slate-500 truncate">
            Lead: <span className="font-medium text-slate-700">{leadName}</span>
          </p>
          <Select value={selected || '__none__'} onValueChange={(v) => setSelected(v === '__none__' ? '' : v)} disabled={loadingSources}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={loadingSources ? 'Đang tải...' : 'Chọn nguồn'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">- Bỏ nguồn -</SelectItem>
              {sources.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button disabled={action.isLoading} onClick={handleSave}>
            {action.isLoading ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
