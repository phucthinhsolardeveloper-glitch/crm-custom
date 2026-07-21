import { DataTableSkeleton } from '@/components/shared/data-table-skeleton';

export default function OrdersLoading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-36 animate-pulse rounded bg-slate-200" />
      <DataTableSkeleton rows={10} cols={6} />
    </div>
  );
}
