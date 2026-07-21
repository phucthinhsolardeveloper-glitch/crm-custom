'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, RefreshCw, Pencil, Power } from 'lucide-react';
import type { CustomerTier } from '@/types/entities';
import { deactivateCustomerTier, triggerBulkRecalc } from '@/lib/api/customer-tiers';
import { TierFormDialog } from './tier-form-dialog';
import { TierBadge } from '@/components/customers/tier-badge';

/**
 * Client component cho Admin Tier Config.
 * Bỏ DnD reorder (sort order edit qua form), focus CRUD + bulk recalc.
 * DnD có thể thêm sau khi user cần.
 */
export function CustomerTiersClient({ initialTiers }: { initialTiers: CustomerTier[] }) {
  const [tiers, setTiers] = useState<CustomerTier[]>(
    [...initialTiers].sort((a, b) => a.sortOrder - b.sortOrder),
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerTier | null>(null);
  const [recalcRunning, setRecalcRunning] = useState(false);

  const handleCreateSuccess = (created: CustomerTier) => {
    setTiers((prev) => [...prev, created].sort((a, b) => a.sortOrder - b.sortOrder));
  };

  const handleEditSuccess = (updated: CustomerTier) => {
    setTiers((prev) => prev.map((t) => (t.id === updated.id ? updated : t)).sort((a, b) => a.sortOrder - b.sortOrder));
    setEditing(null);
  };

  const handleDeactivate = async (tier: CustomerTier) => {
    if (!confirm(`Vô hiệu hoá tier "${tier.name}"? KH đang ở tier này vẫn giữ badge nhưng tier không tham gia recalc.`)) {
      return;
    }
    try {
      await deactivateCustomerTier(tier.id);
      setTiers((prev) => prev.map((t) => (t.id === tier.id ? { ...t, isActive: false } : t)));
      toast.success(`Đã vô hiệu hoá "${tier.name}"`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi vô hiệu hoá');
    }
  };

  const handleBulkRecalc = async () => {
    if (!confirm('Tính lại hạng cho TẤT CẢ khách hàng? Quá trình chạy nền, có thể mất vài phút.')) return;
    setRecalcRunning(true);
    try {
      const res = await triggerBulkRecalc();
      toast.success(`Đã xử lý ${res.processed} khách hàng`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi bulk recalc');
    } finally {
      setRecalcRunning(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-slate-800">Danh sách Tier ({tiers.length})</h2>
          <p className="text-xs text-slate-500 mt-0.5">Thứ tự sortOrder ASC quyết định vị trí hiển thị</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleBulkRecalc}
            disabled={recalcRunning}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${recalcRunning ? 'animate-spin' : ''}`} />
            {recalcRunning ? 'Đang tính...' : 'Tính lại tất cả'}
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-sky-500 hover:bg-sky-600 rounded-lg"
          >
            <Plus className="w-4 h-4" />
            Thêm tier
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs font-bold text-slate-500 uppercase">
              <th className="px-5 py-3 w-16">Order</th>
              <th className="px-5 py-3">Tier</th>
              <th className="px-5 py-3">Ngưỡng (VND)</th>
              <th className="px-5 py-3 w-28">Màu</th>
              <th className="px-5 py-3 w-24">Trạng thái</th>
              <th className="px-5 py-3 w-32 text-right">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {tiers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400 text-sm">
                  Chưa có tier nào. Bấm <strong>+ Thêm tier</strong> để bắt đầu.
                </td>
              </tr>
            )}
            {tiers.map((tier) => (
              <tr key={tier.id} className={`border-t border-slate-100 hover:bg-sky-50/30 ${!tier.isActive ? 'opacity-60' : ''}`}>
                <td className="px-5 py-3 text-slate-500 font-mono">{tier.sortOrder}</td>
                <td className="px-5 py-3">
                  <TierBadge tier={tier} size="md" />
                </td>
                <td className="px-5 py-3 font-semibold text-slate-700">
                  {Number(tier.minSpending).toLocaleString('vi-VN')}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded border border-slate-300" style={{ backgroundColor: tier.color }} />
                    <code className="text-xs text-slate-500">{tier.color}</code>
                  </div>
                </td>
                <td className="px-5 py-3">
                  {tier.isActive ? (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700">Active</span>
                  ) : (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold bg-slate-200 text-slate-600">Inactive</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => setEditing(tier)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-sky-600 hover:bg-sky-50 rounded"
                    title="Sửa"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Sửa
                  </button>
                  {tier.isActive && (
                    <button
                      onClick={() => handleDeactivate(tier)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded ml-1"
                      title="Vô hiệu hoá"
                    >
                      <Power className="w-3.5 h-3.5" />
                      Tắt
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <TierFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleCreateSuccess}
      />
      {editing && (
        <TierFormDialog
          tier={editing}
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  );
}
