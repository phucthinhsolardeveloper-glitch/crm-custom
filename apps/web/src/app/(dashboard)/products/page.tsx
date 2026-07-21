import { serverFetch } from '@/lib/auth';
import { ProductListClient } from '@/components/products/product-list-client';
import type { ProductRecord, ApiListResponse, ProductTypeCounts } from '@/types/entities';

/** Products page with dialog-based CRUD + numbered pagination. Lọc theo loại (combo/thường/đã tắt). */
export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const activeType = params.type ?? 'all';

  const qp = new URLSearchParams(params);
  qp.delete('cursor');
  // Tab "Đã tắt" cần lấy cả SP inactive; các tab còn lại chỉ SP đang bán.
  qp.set('includeInactive', activeType === 'inactive' ? 'true' : 'false');
  const query = qp.toString();

  let products: ProductRecord[] = [];
  let meta: ApiListResponse<ProductRecord>['meta'] = {};
  let counts: ProductTypeCounts = { all: 0, combo: 0, normal: 0, inactive: 0 };

  try {
    const [prodRes, cnt] = await Promise.all([
      serverFetch<ApiListResponse<ProductRecord>>(`/products?${query}`),
      serverFetch<{ data: ProductTypeCounts }>('/products/type-counts').then((r) => r.data).catch(() => null),
    ]);
    products = prodRes.data;
    meta = prodRes.meta;
    if (cnt) counts = cnt;
  } catch { /* empty */ }

  return <ProductListClient products={products} meta={meta} counts={counts} activeType={activeType} />;
}
