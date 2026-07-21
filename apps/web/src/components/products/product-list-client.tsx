'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { PaginationControls } from '@/components/shared/pagination-controls';
import { ProductFormDialog } from '@/components/products/product-form-dialog';
import { useFormAction } from '@/hooks/use-form-action';
import { useAuth } from '@/providers/auth-provider';
import { formatVND } from '@/lib/utils';
import { Plus, Pencil, Trash2, Power, Package, Layers, Search } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { invalidateLeadFormBootstrap } from '@/lib/api/lead-form-bootstrap-cache';
import type { ProductRecord, ApiListResponse, ProductTypeCounts } from '@/types/entities';

interface ProductListClientProps {
  products: ProductRecord[];
  meta?: ApiListResponse<ProductRecord>['meta'];
  /** Số lượng sản phẩm theo loại - cho sidebar lọc. */
  counts: ProductTypeCounts;
  /** Loại đang chọn: all | combo | normal | inactive. */
  activeType: string;
}

/** Trang Sản phẩm: sidebar lọc theo loại + grid card. Combo là SP có cờ isCombo. */
export function ProductListClient({ products, meta, counts, activeType }: ProductListClientProps) {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER' || user?.role === 'SUPER_ADMIN';
  const isAdmin = user?.role === 'SUPER_ADMIN';

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(null);
  const [viewingProduct, setViewingProduct] = useState<ProductRecord | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  // Tìm kiếm sản phẩm theo tên - lưu vào URL (?search=) để SSR tự fetch lại + chia sẻ được.
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchText, setSearchText] = useState(searchParams.get('search') ?? '');

  useEffect(() => {
    const current = searchParams.get('search') ?? '';
    if (searchText === current) return; // không đổi -> bỏ qua (tránh push lúc mount)
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (searchText.trim()) params.set('search', searchText.trim());
      else params.delete('search');
      params.delete('page'); // tìm mới -> về trang 1
      router.push(`/products?${params.toString()}`);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchText, searchParams, router]);

  const reload = () => {
    try { localStorage.removeItem('crm_order_products'); } catch { /* */ }
    invalidateLeadFormBootstrap();
    setTimeout(() => window.location.reload(), 300);
  };
  const deleteAction = useFormAction({ successMessage: 'Đã xóa sản phẩm', onSuccess: reload });

  async function toggleActive(p: ProductRecord) {
    setToggling(p.id);
    try {
      await api.patch(`/products/${p.id}`, { isActive: !p.isActive });
      toast.success(p.isActive ? 'Đã ẩn sản phẩm' : 'Đã kích hoạt sản phẩm');
      try { localStorage.removeItem('crm_order_products'); } catch { /* */ }
      invalidateLeadFormBootstrap();
      window.location.reload();
    } catch { toast.error('Lỗi cập nhật'); }
    setToggling(null);
  }

  function openCreate() {
    setEditingProduct(null);
    setDialogOpen(true);
  }
  function openEdit(p: ProductRecord) {
    setEditingProduct(p);
    setDialogOpen(true);
  }

  // Sidebar lọc theo loại sản phẩm.
  const sidebarItems = [
    { key: 'all', label: 'Tất cả', count: counts.all, href: '/products' },
    { key: 'normal', label: 'Đang bán', count: counts.normal, href: '/products?type=normal' },
    { key: 'combo', label: 'Combo', count: counts.combo, href: '/products?type=combo' },
    { key: 'inactive', label: 'Dừng bán', count: counts.inactive, href: '/products?type=inactive' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Sản phẩm</h1>
      <p className="text-sm text-slate-500 mb-4">Quản lý sản phẩm và combo</p>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Sidebar lọc loại */}
        <aside className="w-full flex-none lg:w-56">
          <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm lg:sticky lg:top-4">
            <p className="px-2 py-2 text-xs font-bold uppercase tracking-wide text-slate-400">Phân loại</p>
            <nav className="space-y-1">
              {sidebarItems.map((it) => {
                const active = activeType === it.key;
                return (
                  <Link
                    key={it.key}
                    href={it.href}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${active ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    <span className="truncate">{it.label}</span>
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{it.count}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Grid sản phẩm */}
        <main className="flex-1">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Tìm sản phẩm theo tên..."
                className="pl-9"
              />
            </div>
            {isManager && (
              <Button onClick={openCreate} className="flex-none">
                <Plus className="h-4 w-4 mr-1" />Thêm sản phẩm
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {products.length === 0 ? (
              <div className="col-span-full rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400">Không có sản phẩm nào</div>
            ) : products.map((p) => (
              <div key={p.id} className={`group relative flex flex-col overflow-hidden rounded-2xl border shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-sky-500/10 ${p.isActive ? 'border-slate-200 bg-white hover:border-sky-200' : 'border-slate-100 bg-slate-50 opacity-70'}`}>
                {/* Header band + badge trạng thái */}
                <div className="relative flex h-20 cursor-pointer items-center justify-center bg-gradient-to-br from-sky-50 to-cyan-50" onClick={() => setViewingProduct(p)}>
                  {p.isCombo ? <Layers className="h-7 w-7 text-sky-400" /> : <Package className="h-7 w-7 text-sky-400" />}
                  {p.isCombo && (
                    <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">COMBO</span>
                  )}
                  <span className={`absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-white shadow ${p.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-white/90"></span>
                    {p.isActive ? 'Đang bán' : 'Dừng bán'}
                  </span>
                </div>

                {/* Body */}
                <div className="flex flex-1 flex-col p-4">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    {p.isCombo ? `Combo - ${p.comboItems?.length ?? 0} sản phẩm` : 'Sản phẩm'}
                  </span>
                  <h3 className="mt-0.5 cursor-pointer font-bold text-slate-900" onClick={() => setViewingProduct(p)}>{p.name}</h3>
                  {p.description && <p className="mt-1 line-clamp-2 flex-1 text-sm text-slate-500">{p.description}</p>}

                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-extrabold text-sky-600">{formatVND(Number(p.price))}</span>
                      {Number(p.vatRate) > 0 && <span className="text-xs text-slate-400">+VAT {p.vatRate}%</span>}
                    </div>
                    {isManager && (
                      <div className="flex gap-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleActive(p)} disabled={toggling === p.id} title={p.isActive ? 'Dừng bán' : 'Mở bán lại'}>
                          <Power className={`h-3.5 w-3.5 ${p.isActive ? 'text-emerald-500' : 'text-slate-300'}`} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)} title="Sửa">
                          <Pencil className="h-3.5 w-3.5 text-slate-400" />
                        </Button>
                        {isAdmin && (
                          <ConfirmDialog
                            trigger={
                              <Button variant="ghost" size="icon" className="h-8 w-8" title="Xóa">
                                <Trash2 className="h-3.5 w-3.5 text-red-400" />
                              </Button>
                            }
                            title="Xóa sản phẩm"
                            description={`Bạn có chắc muốn xóa "${p.name}"?`}
                            confirmLabel="Xóa"
                            onConfirm={() => deleteAction.execute('delete', `/products/${p.id}`)}
                            isLoading={deleteAction.isLoading}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <PaginationControls total={meta?.total} page={meta?.page} limit={meta?.limit} totalPages={meta?.totalPages} />
        </main>
      </div>

      {/* View Product Detail Dialog */}
      <Dialog open={!!viewingProduct} onOpenChange={() => setViewingProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{viewingProduct?.name}</DialogTitle>
          </DialogHeader>
          {viewingProduct && (
            <div className="space-y-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Loại</span>
                <span className="font-medium">{viewingProduct.isCombo ? 'Combo' : 'Sản phẩm thường'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Giá</span>
                <span className="text-lg font-bold text-sky-600">{formatVND(Number(viewingProduct.price))}</span>
              </div>
              {Number(viewingProduct.vatRate) > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">VAT</span>
                  <span>{viewingProduct.vatRate}%</span>
                </div>
              )}
              {viewingProduct.isCombo && viewingProduct.comboItems && viewingProduct.comboItems.length > 0 && (
                <div>
                  <span className="text-slate-500">Sản phẩm con</span>
                  <ul className="mt-1 space-y-1">
                    {viewingProduct.comboItems.map((ci) => (
                      <li key={ci.child.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5">
                        <span className="text-slate-700">{ci.child.name}</span>
                        {ci.child.price ? <span className="text-xs text-slate-400">{formatVND(Number(ci.child.price))}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {viewingProduct.description && (
                <div>
                  <span className="text-slate-500">Mô tả</span>
                  <p className="mt-1 whitespace-pre-wrap text-slate-700">{viewingProduct.description}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingProduct(null)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Product Dialog */}
      <ProductFormDialog open={dialogOpen} editingProduct={editingProduct} onOpenChange={setDialogOpen} onSaved={reload} />
    </div>
  );
}
