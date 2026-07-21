import { redirect } from 'next/navigation';
import { serverFetch, getCurrentUser } from '@/lib/auth';
import { CallLogListClient } from '@/components/call-logs/call-log-list-client';
import type { CallLogRecord, SaleSummary } from '@/types/entities';

interface ApiList<T> {
  data: T[];
  meta?: { total?: number; page?: number; limit?: number; totalPages?: number };
}

/**
 * Trang danh sach cuoc goi.
 * Mo cho moi role, scope o backend:
 * - USER: chi cuoc goi cua minh; LEADER: cuoc goi team; MANAGER+: tat ca.
 * Chi can dam bao da dang nhap.
 */
export default async function CallLogsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await getCurrentUser();
  if (!me) redirect('/login');

  const params = await searchParams;
  const qp = new URLSearchParams(params);
  qp.delete('cursor');
  const query = qp.toString();

  // Fetch song song: logs + sales list (cho dropdown filter).
  const [logsResult, salesResult] = await Promise.allSettled([
    serverFetch<ApiList<CallLogRecord>>(`/call-logs?${query}`),
    serverFetch<{ data: SaleSummary[] }>('/call-logs/sales'),
  ]);

  const logs = logsResult.status === 'fulfilled' ? logsResult.value.data : [];
  const meta = logsResult.status === 'fulfilled' ? logsResult.value.meta ?? {} : {};
  const sales = salesResult.status === 'fulfilled' ? salesResult.value.data : [];

  return <CallLogListClient callLogs={logs} meta={meta} sales={sales} />;
}
