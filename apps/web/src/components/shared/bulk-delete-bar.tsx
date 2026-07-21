'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { api } from '@/lib/api-client';

interface BulkDeleteBarProps {
  /** Số item đang được chọn. Bar ẩn nếu = 0. */
  count: number;
  /** IDs được chọn (string[] vì BigInt serialize qua JSON). */
  ids: string[];
  /** Backend endpoint: `/leads/bulk-delete`, `/customers/bulk-delete`, `/orders/bulk-delete`, `/users/bulk-delete`. */
  endpoint: string;
  /** Label tiếng Việt: "lead", "khách hàng", "đơn hàng", "người dùng". */
  entityLabel: string;
  /** Clear selection khi xóa xong hoặc click "Bỏ chọn". */
  onClear: () => void;
  /** Ghi chú đặc thù (vd orders chỉ xóa PENDING). */
  hint?: string;
}

/**
 * Fixed-bottom bar hiện khi có item được chọn. SA-only - caller chịu trách nhiệm
 * không render nếu không phải SUPER_ADMIN.
 *
 * Sau xóa: toast + router.refresh() + onClear() để reset checkbox state.
 */
export function BulkDeleteBar({ count, ids, endpoint, entityLabel, onClear, hint }: BulkDeleteBarProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (count === 0) return null;

  async function handleDelete() {
    setLoading(true);
    try {
      const res = await api.post<{ data: { deleted: number; skipped: number } }>(endpoint, { ids });
      const { deleted, skipped } = res.data;
      if (skipped > 0) {
        toast.success(`Đã xóa ${deleted}, bỏ qua ${skipped} (không đủ điều kiện hoặc đã xóa)`);
      } else {
        toast.success(`Đã xóa ${deleted} ${entityLabel}`);
      }
      onClear();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi không xác định');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-2.5 shadow-lg shadow-slate-900/10 backdrop-blur-sm">
      <span className="text-sm text-slate-700">
        Đã chọn <b className="text-sky-600">{count}</b> {entityLabel}
      </span>
      <button
        onClick={onClear}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      >
        <X size={14} /> Bỏ chọn
      </button>
      <ConfirmDialog
        trigger={
          <button className="flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">
            <Trash2 size={14} /> Xóa đã chọn
          </button>
        }
        title={`Xóa ${count} ${entityLabel}?`}
        description={hint
          ? `${hint} Thao tác này soft-delete - có thể restore từ DB nếu cần.`
          : `Thao tác này soft-delete ${count} ${entityLabel} đã chọn. Có thể restore từ DB nếu cần.`}
        confirmLabel="Xóa"
        onConfirm={handleDelete}
        isLoading={loading}
      />
    </div>
  );
}
