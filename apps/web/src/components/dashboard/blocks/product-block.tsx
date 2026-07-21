'use client';

import type { TopNResponse } from '@crm/types';
import type { ProductSlice } from '../constants';
import { BlockSectionLabel } from './block-section-label';
import { TopNBarsCard } from '../h1/top-n-bars-card';

/** Nhãn cảnh báo cho đơn không gắn sản phẩm (BE trả productId=null, name='Không rõ'). */
const NO_PRODUCT_LABEL = 'Đơn KHÔNG gắn SP';

/**
 * Convert ProductSlice[] (shape cũ của revenue/by-product) sang TopNResponse
 * để tái sử dụng TopNBarsCard. Đổi tên bucket null thành nhãn cảnh báo.
 */
function productSlicesToTopN(slices: ProductSlice[]): TopNResponse | null {
  if (slices.length === 0) return null;
  const total = slices.reduce((s, x) => s + x.revenue, 0);
  return {
    items: slices.map(s => ({
      id: s.productId,
      name: s.productId === null && s.name !== 'Khác' ? NO_PRODUCT_LABEL : s.name,
      revenue: s.revenue,
      pct: s.pct,
    })),
    other: null,
    total,
    totalGroups: slices.length,
  };
}

interface ProductBlockProps {
  byProduct: ProductSlice[];
  byProductGroup: TopNResponse | null;
  byOrderFormat: TopNResponse | null;
  loading: boolean;
}

/**
 * Block 2 - Sản phẩm: top SP theo DT (+ cảnh báo đơn không gắn SP),
 * nhóm SP + hình thức bán.
 */
export function ProductBlock({ byProduct, byProductGroup, byOrderFormat, loading }: ProductBlockProps) {
  const productTopN = productSlicesToTopN(byProduct);

  return (
    <section className="space-y-3">
      <BlockSectionLabel index={2} title="Sản phẩm" question="Bán cái gì ra tiền, hình thức nào, nhóm nào?" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopNBarsCard
          title="Top sản phẩm theo doanh thu"
          icon="📦"
          data={productTopN}
          loading={loading}
          infoTooltip="Doanh thu payment đã verify trong kỳ, gắn sản phẩm qua đơn hàng. Dòng đỏ = đơn không chọn sản phẩm."
          highlightNames={[NO_PRODUCT_LABEL]}
        />
        <div className="flex flex-col gap-4">
          <TopNBarsCard
            title="Nhóm sản phẩm"
            icon="🗂️"
            data={byProductGroup}
            loading={loading}
            infoTooltip="Doanh thu verified trong kỳ theo nhóm sản phẩm của đơn (orders.product_group_id)."
          />
          <TopNBarsCard
            title="Hình thức bán"
            icon="🎓"
            data={byOrderFormat}
            loading={loading}
            infoTooltip="Doanh thu verified trong kỳ theo hình thức đơn (orders.format_id)."
          />
        </div>
        {/* ponytail: card "Danh mục sản phẩm" đã ẩn - nghiệp vụ deprecated (không còn UI gán
            products.category_id). Endpoint/bảng giữ lại để tra cứu lịch sử. Bỏ ẩn nếu khôi phục danh mục. */}
      </div>
    </section>
  );
}
