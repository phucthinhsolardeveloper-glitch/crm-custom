'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import NoteDialog from '@/components/shared/note-dialog';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { ExternalLink, Phone, Mail, User, Building, Tag, Calendar, Package, Loader2, MessageSquarePlus, Tags, CreditCard } from 'lucide-react';
import { formatVND } from '@/lib/utils';
import { CreateOrderDialog } from '@/components/orders/create-order-dialog';
import { CreatePaymentDialog } from '@/components/payments/create-payment-dialog';
import type { LabelEntity } from '@/types/entities';

/** Minimal activity shape used for preview. */
interface PreviewActivity {
  id: string;
  type: string;
  content?: string | null;
  user?: { name: string } | null;
  createdAt: string;
}

/** Nested label as returned by API (ll.label or ll itself). */
interface NestedOrFlatLabel {
  label?: LabelEntity;
  id?: string;
  name?: string;
  color?: string;
}

/** Minimal order shape for the payment quick-action. */
interface PreviewOrder {
  id: string;
  status: string;
  totalAmount: number;
  vatRate?: number | string | null;
  larkSyncId?: string | null;
  product?: { name?: string } | null;
}

/** Entity data returned by GET /leads/:id or /customers/:id. */
interface PreviewEntityData {
  name: string;
  phone?: string | null;
  email?: string | null;
  status: string;
  source?: { name: string } | null;
  product?: { name: string } | null;
  assignedUser?: { name: string } | null;
  department?: { name: string } | null;
  // Lead: single label via FK; Customer: multi-label via junction
  label?: { id: string; name: string; color: string; textColor: string } | null;
  labels?: NestedOrFlatLabel[];
  leadLabels?: NestedOrFlatLabel[];
  customerLabels?: NestedOrFlatLabel[];
  orders?: PreviewOrder[];
  customerId?: string | null;
  createdAt: string;
}

interface PreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: 'lead' | 'customer';
  entityId: string | null;
}

const CACHE_PREFIX = 'crm_preview_';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/** Read from localStorage with TTL check. */
function readCache(key: string) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > CACHE_TTL) { localStorage.removeItem(CACHE_PREFIX + key); return null; }
    return parsed;
  } catch { return null; }
}

/** Write to localStorage with timestamp. data/activities can be any serializable value. */
function writeCache(key: string, data: unknown, activities: unknown[]) {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, activities, ts: Date.now() })); } catch { /* quota */ }
}

/** Invalidate cache for a specific entity. Call after update/edit. */
export function invalidatePreviewCache(entityType: string, entityId: string) {
  try { localStorage.removeItem(CACHE_PREFIX + `${entityType}:${entityId}`); } catch { /* */ }
}

/** Quick preview dialog for lead/customer - shows key info + quick actions. */
export function EntityQuickPreviewDialog({ open, onOpenChange, entityType, entityId }: PreviewDialogProps) {
  const router = useRouter();
  const [data, setData] = useState<PreviewEntityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activities, setActivities] = useState<PreviewActivity[]>([]);
  // Quick action states
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const [allLabels, setAllLabels] = useState<LabelEntity[]>([]);
  const [labelSaving, setLabelSaving] = useState(false);
  // Payment quick action: chọn đơn -> mở CreatePaymentDialog (form đầy đủ, validate
  // bắt buộc loại TT/đợt TT/nội dung CK/Ngày CK - khớp quy tắc chung toàn app).
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [pmtOrderId, setPmtOrderId] = useState('');
  const [pmtDialogOpen, setPmtDialogOpen] = useState(false);

  useEffect(() => {
    if (!open || !entityId) return;

    const cacheKey = `${entityType}:${entityId}`;
    const cached = readCache(cacheKey);

    if (cached) {
      setData(cached.data);
      setActivities(cached.activities);
      setLoading(false);
      return;
    }

    setLoading(true);
    const endpoint = entityType === 'lead' ? `/leads/${entityId}` : `/customers/${entityId}`;
    const activitiesEndpoint = `/${entityType === 'lead' ? 'leads' : 'customers'}/${entityId}/activities`;

    Promise.all([
      api.get<{ data: PreviewEntityData }>(endpoint),
      api.get<{ data: PreviewActivity[] }>(activitiesEndpoint).catch(() => ({ data: [] as PreviewActivity[] })),
    ])
      .then(([entityRes, actRes]) => {
        const d = entityRes.data;
        const a = actRes.data || [];
        setData(d);
        setActivities(a);
        writeCache(cacheKey, d, a);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [open, entityId, entityType]);

  const detailUrl = entityType === 'lead' ? `/leads/${entityId}` : `/customers/${entityId}`;
  // Lead: data.label (single). Customer: data.labels / data.customerLabels (junction array).
  const labels: NestedOrFlatLabel[] =
    entityType === 'lead'
      ? (data?.label ? [{ label: data.label }] : [])
      : (data?.labels || data?.customerLabels || []);
  const currentLabelIds = new Set(labels.map((ll) => String((ll.label || ll).id)));

  // Quick label toggle - lead uses PATCH single, customer uses junction add/remove
  async function toggleLabel(labelId: string) {
    if (!entityId) return;
    setLabelSaving(true);
    // Track whether we're clearing or setting - drives toast wording
    const wasActive = currentLabelIds.has(labelId);
    try {
      if (entityType === 'lead') {
        const next = wasActive ? null : labelId;
        await api.patch(`/leads/${entityId}/label`, { labelId: next });
      } else if (wasActive) {
        await api.delete(`/customers/${entityId}/labels/${labelId}`);
      } else {
        await api.post(`/customers/${entityId}/labels`, { labelIds: [labelId] });
      }
      invalidatePreviewCache(entityType, entityId);
      const res = await api.get<{ data: PreviewEntityData }>(entityType === 'lead' ? `/leads/${entityId}` : `/customers/${entityId}`);
      setData(res.data);
      router.refresh();
      toast.success(wasActive ? 'Đã bỏ nhãn' : 'Đã gắn nhãn');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể cập nhật nhãn';
      toast.error(message);
    }
    setLabelSaving(false);
  }

  // Sau khi tạo payment qua CreatePaymentDialog: reset + refresh entity data.
  async function handlePaymentCreated() {
    setPmtOrderId(''); setPmtDialogOpen(false); setPaymentOpen(false);
    if (entityId) invalidatePreviewCache(entityType, entityId);
    try {
      const res = await api.get<{ data: PreviewEntityData }>(entityType === 'lead' ? `/leads/${entityId}` : `/customers/${entityId}`);
      setData(res.data);
    } catch { /* */ }
    router.refresh();
  }

  const pendingOrders = (data?.orders || []).filter((o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && o.status !== 'REFUNDED');

  // Fetch labels list (cached in localStorage 24h)
  useEffect(() => {
    if (!labelPickerOpen || allLabels.length > 0) return;
    const cached = readCache('_all_labels');
    if (cached?.data) { setAllLabels(cached.data); return; }
    api.get<{ data: LabelEntity[] }>('/labels').then(r => {
      setAllLabels(r.data || []);
      writeCache('_all_labels', r.data || [], []);
    }).catch(() => {});
  }, [labelPickerOpen, allLabels.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto p-0">
        <DialogTitle className="sr-only">
          {entityType === 'lead' ? 'Chi tiết Lead' : 'Chi tiết Khách hàng'}
        </DialogTitle>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
          </div>
        ) : data ? (
          <div>
            {/* Header */}
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-slate-900 truncate">{data.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <Phone className="h-3.5 w-3.5 text-slate-400" />
                    <a href={`tel:${data.phone}`} className="text-sm text-sky-600 hover:underline">{data.phone}</a>
                  </div>
                </div>
                <StatusBadge status={data.status} />
              </div>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-4">
              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {data.email && (
                  <InfoRow icon={Mail} label="Email" value={data.email} />
                )}
                {data.source?.name && (
                  <InfoRow icon={Tag} label="Nguồn" value={data.source.name} />
                )}
                {data.product?.name && (
                  <InfoRow icon={Package} label="Sản phẩm" value={data.product.name} />
                )}
                {data.assignedUser?.name && (
                  <InfoRow icon={User} label="Nhân viên" value={data.assignedUser.name} />
                )}
                {data.department?.name && (
                  <InfoRow icon={Building} label="Phòng ban" value={data.department.name} />
                )}
                <InfoRow icon={Calendar} label="Ngày tạo" value={formatDate(data.createdAt)} />
              </div>

              {/* Labels */}
              {labels.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-slate-500 uppercase">Nhãn</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {labels.map((ll) => {
                      const label = (ll.label || ll) as LabelEntity;
                      return (
                        <span
                          key={label.id}
                          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: label.color || '#6b7280', color: label.textColor || '#ffffff' }}
                        >
                          {label.name}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Notes & Activities */}
              {activities.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-slate-500 uppercase">
                    Ghi chú & Hoạt động ({activities.length})
                  </span>
                  <div className="mt-1.5 space-y-1.5 max-h-40 overflow-y-auto">
                    {activities.slice(0, 5).map((a) => (
                      <div key={a.id} className="text-xs bg-slate-50 rounded-md px-2.5 py-2 border border-slate-100">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="font-medium text-slate-700">{a.user?.name || '-'}</span>
                          <span className="text-slate-300">·</span>
                          <span className="text-slate-400">{a.type === 'NOTE' ? 'Ghi chú' : a.type === 'CALL' ? 'Cuộc gọi' : a.type}</span>
                          <span className="text-slate-300">·</span>
                          <span className="text-slate-400">{formatDate(a.createdAt)}</span>
                        </div>
                        <p className="text-slate-600 whitespace-pre-line">
                          {a.content?.substring(0, 120)}{(a.content?.length ?? 0) > 120 ? '...' : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="border-t border-slate-100 px-5 py-3 space-y-2">
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setNoteDialogOpen(true); setLabelPickerOpen(false); setPaymentOpen(false); }}>
                  <MessageSquarePlus className="h-3.5 w-3.5 mr-1" />Ghi chú
                </Button>
                <Button size="sm" variant={labelPickerOpen ? 'default' : 'outline'} onClick={() => { setLabelPickerOpen(!labelPickerOpen); setPaymentOpen(false); }}>
                  <Tags className="h-3.5 w-3.5 mr-1" />Nhãn
                </Button>
                {entityType === 'lead' && (
                  <Button size="sm" variant={paymentOpen ? 'default' : 'outline'} onClick={() => { setPaymentOpen(!paymentOpen); setLabelPickerOpen(false); }}>
                    <CreditCard className="h-3.5 w-3.5 mr-1" />Thêm giao dịch
                  </Button>
                )}
                {entityType === 'lead' && (
                  <CreateOrderDialog customerId={data.customerId ? String(data.customerId) : ''} leadId={entityId || undefined} products={[]} paymentTypes={[]} />
                )}
              </div>

              {entityId && (
                <NoteDialog
                  open={noteDialogOpen}
                  onOpenChange={setNoteDialogOpen}
                  entityType={entityType}
                  entityId={entityId}
                  onSuccess={() => {
                    if (!entityId) return;
                    invalidatePreviewCache(entityType, entityId);
                    api.get<{ data: PreviewActivity[] }>(`/${entityType === 'lead' ? 'leads' : 'customers'}/${entityId}/activities`)
                      .then(r => setActivities(r.data || []))
                      .catch(() => {});
                    router.refresh();
                  }}
                />
              )}

              {/* Inline label picker */}
              {labelPickerOpen && (
                <div className="flex flex-wrap gap-1.5">
                  {allLabels.length === 0 && <span className="text-xs text-slate-400">Đang tải...</span>}
                  {allLabels.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => toggleLabel(String(l.id))}
                      disabled={labelSaving}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                        currentLabelIds.has(String(l.id))
                          ? 'ring-2 ring-offset-1 ring-slate-400'
                          : 'opacity-50 hover:opacity-80'
                      }`}
                      style={{ backgroundColor: l.color || '#6b7280', color: l.textColor || '#ffffff' }}
                    >
                      {l.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Quick payment: chọn đơn -> mở CreatePaymentDialog (form đủ trường bắt buộc) */}
              {paymentOpen && (
                <div className="space-y-2">
                  {pendingOrders.length === 0 ? (
                    <p className="text-xs text-slate-400">Chưa có đơn hàng - hãy tạo đơn hàng trước</p>
                  ) : (
                    <>
                      <div className="space-y-1">
                        <p className="text-xs text-slate-500">Chọn đơn hàng:</p>
                        {pendingOrders.map((o) => (
                          <label key={o.id} className={`flex items-center gap-2 rounded border px-2 py-1.5 cursor-pointer text-xs ${
                            pmtOrderId === String(o.id) ? 'border-sky-400 bg-sky-50' : 'border-slate-200'}`}>
                            <input type="radio" name="pmtOrder" checked={pmtOrderId === String(o.id)} onChange={() => setPmtOrderId(String(o.id))} />
                            <span>#{o.id} - {o.product?.name || 'N/A'} - {formatVND(Number(o.totalAmount))}</span>
                            <StatusBadge status={o.status} />
                          </label>
                        ))}
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setPaymentOpen(false)}>Hủy</Button>
                        <Button size="sm" onClick={() => setPmtDialogOpen(true)} disabled={!pmtOrderId}>Thêm giao dịch</Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* CreatePaymentDialog cho đơn đã chọn - validate đầy đủ như mọi nơi khác */}
              {pmtOrderId && (() => {
                const selected = pendingOrders.find(o => String(o.id) === pmtOrderId);
                return (
                  <CreatePaymentDialog
                    orderId={pmtOrderId}
                    open={pmtDialogOpen}
                    onOpenChange={setPmtDialogOpen}
                    onSuccess={handlePaymentCreated}
                    vatRate={selected?.vatRate != null ? Number(selected.vatRate) : 0}
                    orderSummary={selected ? {
                      totalAmount: Number(selected.totalAmount),
                      paidAmount: 0,
                      productName: selected.product?.name,
                    } : undefined}
                    defaultLarkSyncId={selected?.larkSyncId ?? undefined}
                  />
                );
              })()}
            </div>

            {/* Footer - Detail button */}
            <div className="sticky bottom-0 border-t border-slate-200 bg-slate-50 px-5 py-3 flex justify-between items-center">
              <span className="text-xs text-slate-400">
                {entityType === 'lead' ? 'Lead' : 'Khách hàng'} #{entityId}
              </span>
              <Link href={detailUrl} onClick={() => onOpenChange(false)}>
                <Button size="sm">
                  <ExternalLink className="h-4 w-4 mr-1" />Xem chi tiết
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="py-16 text-center text-slate-400">Không tìm thấy dữ liệu</div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Single info row for the preview grid */
function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-xs text-slate-400">{label}</div>
        <div className="text-slate-900 truncate">{value}</div>
      </div>
    </div>
  );
}
