import { serverFetch } from '@/lib/auth';
import { CsvImportPageClient } from '@/components/import/csv-import-upload-with-job-status';

/** CSV import page - upload leads/customers CSV files and track job status. */
export default async function ImportPage() {
  let history: Record<string, unknown>[] = [];
  try {
    const result = await serverFetch<{ data: Record<string, unknown>[] }>('/imports');
    history = result.data;
  } catch { /* empty on error */ }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Nhập dữ liệu</h1>
        <p className="text-sm text-slate-500">Import leads và khách hàng từ file CSV</p>
      </div>
      <CsvImportPageClient initialHistory={history as unknown as Parameters<typeof CsvImportPageClient>[0]['initialHistory']} />
    </div>
  );
}
