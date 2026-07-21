import { DataTableSkeleton } from '@/components/shared/data-table-skeleton';

export default function DashboardLoading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
      <DataTableSkeleton rows={8} cols={5} />
    </div>
  );
}
