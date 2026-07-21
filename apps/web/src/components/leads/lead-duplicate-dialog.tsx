'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useKhoBaseParams } from '@/components/leads/kho-base-params-context';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { LabelPill } from '@/components/leads/label-pill';
import { api } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { toast } from 'sonner';

interface DuplicateLead {
  id: string;
  name: string;
  phone: string;
  status: string;
  createdAt: string;
  product?: { id: string; name: string } | null;
  source?: { id: string; name: string } | null;
  group?: { id: string; name: string } | null;
  assignedUser?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
  label?: { id: string; name: string; color: string; textColor?: string | null } | null;
  _count?: { orders: number };
  /** Ghi chú mới nhất của lead (Activity type NOTE gần nhất), null nếu chưa có note. */
  note?: string | null;
  /** PRIMARY = trùng qua chính SĐT chính của lead; SECONDARY = trùng qua SĐT phụ (bridge customer_phones). */
  matchedBy?: 'PRIMARY' | 'SECONDARY';
}

interface DuplicateHistoryItem {
  id: string;
  entityId: string;
  createdAt: string;
  reason?: string | null;
  fromUser?: { id: string; name: string } | null;
  toUser?: { id: string; name: string } | null;
  fromDepartment?: { id: string; name: string } | null;
  toDepartment?: { id: string; name: string } | null;
  assignedByUser?: { id: string; name: string } | null;
}

interface DuplicateResponse {
  data: { phone: string; leads: DuplicateLead[]; history: DuplicateHistoryItem[] };
}

interface LeadDuplicateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phone: string;
  currentLeadId?: string;
}

export function LeadDuplicateDialog({ open, onOpenChange, phone, currentLeadId }: LeadDuplicateDialogProps) {
  const { user } = useAuth();
  // Chỉ MANAGER/SUPER_ADMIN được xóa lead (khớp @Roles của endpoint bulk-delete) -> ẩn checkbox+nút với role khác.
  const canDelete = user?.role === 'MANAGER' || user?.role === 'SUPER_ADMIN';

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DuplicateResponse['data'] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // Trang kho: chỉ hiện lead trùng THUỘC kho đang đứng, cuối bảng ghi số lead
  // còn lại ở kho khác. Trang /leads (không có provider) -> null -> hiện tất cả.
  const khoBaseParams = useKhoBaseParams();
  const khoStatuses = useMemo(() => {
    const s = khoBaseParams.status;
    if (!s) return null;
    return new Set(Array.isArray(s) ? s : [s]);
  }, [khoBaseParams]);

  // Tải danh sách lead trùng. Tách riêng để gọi lại được sau khi xóa.
  const loadData = useCallback(async () => {
    setLoading(true);
    setData(null);
    setSelectedIds(new Set());
    try {
      const res = await api.get<DuplicateResponse>(`/leads/duplicates?phone=${encodeURIComponent(phone)}`);
      setData(res.data);
    } catch {
      setData({ phone, leads: [], history: [] });
    } finally {
      setLoading(false);
    }
  }, [phone]);

  // Luôn fetch lại mỗi khi mở dialog -> tránh hiện dữ liệu cũ (vd: sale vừa được chia chưa hiện).
  useEffect(() => {
    if (!open || !phone) return;
    loadData();
  }, [open, phone, loadData]);

  // allLeads = danh sách hiển thị (đã lọc theo kho); hiddenCount = số lead trùng ở kho khác.
  const fetchedLeads = data?.leads || [];
  const allLeads = khoStatuses ? fetchedLeads.filter((l) => khoStatuses.has(l.status)) : fetchedLeads;
  const hiddenCount = fetchedLeads.length - allLeads.length;

  // Bật/tắt 1 lead trong danh sách đã chọn.
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Chọn tất cả / bỏ chọn tất cả.
  const allSelected = allLeads.length > 0 && selectedIds.size === allLeads.length;
  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(allLeads.map((l) => l.id)));
  };

  // Xóa hàng loạt các lead đã chọn rồi tải lại danh sách.
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      await api.post('/leads/bulk-delete', { ids: Array.from(selectedIds) });
      toast.success(`Đã xóa ${selectedIds.size} lead`);
      await loadData();
    } catch {
      toast.error('Xóa lead thất bại');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Lead trùng SĐT - {phone}</DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="py-8 text-center text-slate-400 text-sm">Đang tải...</div>
        )}

        {!loading && data && (
          <Tabs defaultValue="leads" className="w-full">
            <TabsList>
              <TabsTrigger value="leads">
                Các lead ({allLeads.length})
              </TabsTrigger>
              <TabsTrigger value="history">
                Lịch sử phân phối ({data.history.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="leads" className="mt-3">
              {allLeads.length === 0 ? (
                <div className="py-6 text-center text-sm text-slate-400">
                  {hiddenCount > 0
                    ? `Không có lead trùng nào trong kho này - toàn bộ ${hiddenCount} lead trùng nằm ở kho khác.`
                    : 'Không có lead trùng nào khác (có thể đã bị xóa).'}
                </div>
              ) : (
                <>
                {/* Thanh xóa hàng loạt: chỉ hiện cho MANAGER+ khi đã chọn ít nhất 1 lead. */}
                {canDelete && selectedIds.size > 0 && (
                  <div className="mb-2 flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2">
                    <span className="text-sm text-rose-700">Đã chọn {selectedIds.size} lead</span>
                    <ConfirmDialog
                      trigger={
                        <button className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700">
                          Xóa đã chọn ({selectedIds.size})
                        </button>
                      }
                      title="Xóa lead đã chọn?"
                      description={`Bạn chắc chắn muốn xóa ${selectedIds.size} lead đã chọn? Thao tác này không thể hoàn tác.`}
                      confirmLabel="Xóa"
                      isLoading={deleting}
                      onConfirm={handleBulkDelete}
                    />
                  </div>
                )}
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs text-slate-500">
                      <tr>
                        {canDelete && (
                          <th className="px-3 py-2 font-medium">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-rose-600"
                              checked={allSelected}
                              onChange={toggleAll}
                              aria-label="Chọn tất cả"
                            />
                          </th>
                        )}
                        <th className="px-3 py-2 font-medium">STT</th>
                        <th className="px-3 py-2 font-medium">Khách hàng</th>
                        <th className="px-3 py-2 font-medium">SĐT</th>
                        <th className="px-3 py-2 font-medium">Nguồn</th>
                        <th className="px-3 py-2 font-medium">Nhóm</th>
                        <th className="px-3 py-2 font-medium">Sản phẩm</th>
                        <th className="px-3 py-2 font-medium">Nhãn</th>
                        <th className="px-3 py-2 font-medium">Trạng thái</th>
                        <th className="px-3 py-2 font-medium">Sale</th>
                        <th className="px-3 py-2 font-medium">Phòng ban</th>
                        <th className="px-3 py-2 font-medium text-center">Đơn</th>
                        <th className="px-3 py-2 font-medium">Ghi chú</th>
                        <th className="px-3 py-2 font-medium">Ngày tạo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allLeads.map((l, i) => (
                        <tr key={l.id} className={`border-t border-slate-100 ${currentLeadId && l.id === currentLeadId ? 'bg-sky-50' : ''}`}>
                          {canDelete && (
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-rose-600"
                                checked={selectedIds.has(l.id)}
                                onChange={() => toggleOne(l.id)}
                                aria-label={`Chọn lead ${l.name}`}
                              />
                            </td>
                          )}
                          <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                          <td className="px-3 py-2 font-medium text-slate-800">{l.name}</td>
                          <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                            <span className="font-mono">{l.phone}</span>
                            {l.matchedBy === 'SECONDARY' && (
                              <span
                                className="ml-1.5 inline-block rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                                title={`Lead này trùng vì SĐT ${phone} là số phụ trong hồ sơ khách hàng`}
                              >
                                qua số phụ
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{l.source?.name || '-'}</td>
                          <td className="px-3 py-2 text-slate-600">{l.group?.name || '-'}</td>
                          <td className="px-3 py-2 text-slate-600">{l.product?.name || '-'}</td>
                          <td className="px-3 py-2">
                            {l.label ? <LabelPill label={l.label} size="sm" /> : <span className="text-slate-300">-</span>}
                          </td>
                          <td className="px-3 py-2"><StatusBadge status={l.status} /></td>
                          <td className="px-3 py-2 text-slate-600">{l.assignedUser?.name || '-'}</td>
                          <td className="px-3 py-2 text-slate-600">{l.department?.name || '-'}</td>
                          <td className="px-3 py-2 text-center">
                            {l._count && l._count.orders > 0 ? (
                              <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                {l._count.orders} đơn
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {l.note ? (
                              <span className="block max-w-[200px] truncate" title={l.note}>{l.note}</span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
                            {formatDateTime(l.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Ghi chú số lead trùng nằm ngoài kho hiện tại (bị lọc khỏi bảng trên). */}
                {hiddenCount > 0 && (
                  <p className="mt-2 text-xs text-slate-500">
                    Còn <span className="font-semibold text-amber-600">{hiddenCount}</span> lead
                    trùng SĐT này ở các kho khác (xem đầy đủ ở trang Tất cả).
                  </p>
                )}
                </>
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-3">
              {data.history.length === 0 ? (
                <div className="py-6 text-center text-sm text-slate-400">
                  Chưa có lịch sử phân phối.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Thời gian</th>
                        <th className="px-3 py-2 font-medium">Từ</th>
                        <th className="px-3 py-2 font-medium">Đến</th>
                        <th className="px-3 py-2 font-medium">Người phân</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.history.map(h => (
                        <tr key={h.id} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                            {formatDateTime(h.createdAt)}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {h.fromUser?.name || h.fromDepartment?.name || 'Kho mới'}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {h.toUser?.name || h.toDepartment?.name || '-'}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {h.assignedByUser?.name || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
