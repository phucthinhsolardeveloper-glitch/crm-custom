import { serverFetch } from '@/lib/auth';
import type { RefundRecord, ApiListResponse } from '@/types/entities';
import { PaginationControls } from '@/components/shared/pagination-controls';
import { CreateRefundDialog } from '@/components/refunds/create-refund-dialog';
import { RefundTable } from '@/components/refunds/refund-table';

/** Bảng hoàn tiền nhập tay - mỗi dòng = 1 lần hoàn tiền khách. Self-scope theo người tạo. */
export default async function RefundsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const qp = new URLSearchParams(params);
  qp.delete('cursor');
  if (!qp.get('page')) qp.set('page', '1');
  const query = qp.toString();

  let data: RefundRecord[] = [];
  let meta: ApiListResponse<RefundRecord>['meta'] = {};
  try {
    const result = await serverFetch<ApiListResponse<RefundRecord>>(`/refunds?${query}`);
    data = result.data;
    meta = result.meta;
  } catch { /* empty */ }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Hoàn tiền</h1>
          <p className="text-sm text-slate-500">Bảng ghi hoàn tiền cho khách - mỗi dòng = 1 lần hoàn</p>
        </div>
        <CreateRefundDialog />
      </div>

      <div className="mt-4">
        <RefundTable refunds={data} />
      </div>
      <PaginationControls total={meta?.total} page={meta?.page} limit={meta?.limit} totalPages={meta?.totalPages} />
    </div>
  );
}
