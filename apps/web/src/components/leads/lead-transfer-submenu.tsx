'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronLeft, Waves, Ban, Building2, Loader2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { getDepartmentsCached } from '@/lib/api/lead-form-bootstrap-cache';
import type { NamedEntity } from '@/types/entities';

interface Props {
  leadId: string;
  leadName?: string;
  /** Dept hiện tại - để highlight + disable (không cho chuyển vào chính nó). */
  currentDeptId?: string | null;
  /** Status hiện tại - dùng để disable option Thả nổi nếu đã FLOATING. */
  currentStatus?: string;
  /** Callback quay lại main menu (không đóng popover cha). */
  onBack: () => void;
  /** Callback khi transfer thành công - đóng popover. */
  onSuccess: () => void;
}

/**
 * Submenu chuyển lead - thay cho dialog cũ (LeadTransferDepartmentDialog) hardcode DEPARTMENT.
 *
 * UX: 1-click action - user click option → POST transfer ngay → toast undo 5s.
 * Hỗ trợ 3 targetType: FLOATING (thả nổi), UNASSIGN (bỏ assign về kho mới),
 * DEPARTMENT (chuyển sang dept cụ thể).
 *
 * Render inline trong cùng popover của LeadActionMenu (không phải popover lồng -
 * tránh z-index issue, đảm bảo keyboard accessibility).
 */
export function LeadTransferSubmenu({
  leadId, leadName, currentDeptId, currentStatus, onBack, onSuccess,
}: Props) {
  const router = useRouter();
  const [departments, setDepartments] = useState<NamedEntity[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLoadingDepts(true);
    getDepartmentsCached()
      .then((list) => setDepartments(list))
      .catch(() => toast.error('Không tải được danh sách phòng ban'))
      .finally(() => setLoadingDepts(false));
  }, []);

  async function handleTransfer(
    targetType: 'FLOATING' | 'UNASSIGN' | 'DEPARTMENT',
    targetDeptId: string | undefined,
    targetLabel: string,
  ) {
    if (submitting) return;
    setSubmitting(true);

    // Capture old state TRƯỚC khi transfer để hỗ trợ undo
    const oldDeptId = currentDeptId ?? null;
    const oldStatus = currentStatus ?? null;

    try {
      await api.post(`/leads/${leadId}/transfer`, {
        targetType,
        ...(targetType === 'DEPARTMENT' ? { targetDeptId } : {}),
      });

      const nameStr = leadName ? `"${leadName}" ` : '';
      toast.success(`Đã chuyển lead ${nameStr}sang ${targetLabel}`, {
        action: {
          label: 'Hoàn tác',
          onClick: () => undoTransfer(oldDeptId, oldStatus),
        },
        duration: 5000,
      });
      onSuccess();
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi chuyển lead';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  /** Hoàn tác: chuyển lead về dept cũ (nếu có) hoặc về trạng thái cũ. */
  async function undoTransfer(oldDeptId: string | null, oldStatus: string | null) {
    try {
      if (oldDeptId) {
        await api.post(`/leads/${leadId}/transfer`, {
          targetType: 'DEPARTMENT',
          targetDeptId: oldDeptId,
        });
      } else if (oldStatus === 'FLOATING') {
        await api.post(`/leads/${leadId}/transfer`, { targetType: 'FLOATING' });
      } else {
        await api.post(`/leads/${leadId}/transfer`, { targetType: 'UNASSIGN' });
      }
      toast.success('Đã hoàn tác');
      router.refresh();
    } catch {
      toast.error('Lỗi hoàn tác - kiểm tra lại trạng thái lead');
    }
  }

  return (
    <div className="p-1 max-h-[400px] overflow-y-auto">
      <button
        type="button"
        onClick={onBack}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
        disabled={submitting}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Quay lại
      </button>
      <div className="my-1 h-px bg-slate-100" />
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Chuyển sang
      </div>

      <TransferOption
        icon={<Waves className="h-4 w-4 text-cyan-500" />}
        label="Thả nổi (FLOATING)"
        onClick={() => handleTransfer('FLOATING', undefined, 'Kho thả nổi')}
        disabled={submitting || currentStatus === 'FLOATING'}
        hint={currentStatus === 'FLOATING' ? '(hiện tại)' : undefined}
      />
      <TransferOption
        icon={<Ban className="h-4 w-4 text-slate-400" />}
        label="Bỏ assign (về Kho mới)"
        onClick={() => handleTransfer('UNASSIGN', undefined, 'Kho mới')}
        disabled={submitting}
      />

      <div className="my-1 h-px bg-slate-100" />

      {loadingDepts && (
        <div className="px-2 py-2 text-xs text-slate-400 inline-flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          Đang tải phòng ban...
        </div>
      )}
      {!loadingDepts && departments.length === 0 && (
        <div className="px-2 py-1.5 text-xs text-slate-400">Chưa có phòng ban</div>
      )}
      {departments.map((d) => {
        const isCurrent = !!currentDeptId && String(d.id) === String(currentDeptId);
        return (
          <TransferOption
            key={d.id}
            icon={<Building2 className="h-4 w-4 text-emerald-500" />}
            label={d.name}
            onClick={() => handleTransfer('DEPARTMENT', String(d.id), `phòng ${d.name}`)}
            disabled={submitting || isCurrent}
            hint={isCurrent ? '(hiện tại)' : undefined}
          />
        );
      })}

      {submitting && (
        <div className="px-2 py-2 text-xs text-sky-600 inline-flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          Đang chuyển...
        </div>
      )}
    </div>
  );
}

interface OptionProps {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
}

function TransferOption({ icon, label, hint, onClick, disabled }: OptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-sky-50 hover:text-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-700"
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 text-left truncate">{label}</span>
      {hint && <span className="text-[10px] text-slate-400 shrink-0">{hint}</span>}
    </button>
  );
}
