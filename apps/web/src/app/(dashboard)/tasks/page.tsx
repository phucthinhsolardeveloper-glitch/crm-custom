import { serverFetch } from '@/lib/auth';
import { TaskListClient } from '@/components/tasks/tasks-management-list-with-create-dialog';
import type { TaskRecord, ApiListResponse } from '@/types/entities';

/** Tasks management page - shows user's tasks with create/complete/cancel actions + numbered pagination. */
export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const qp = new URLSearchParams(params);
  qp.delete('cursor');
  const query = qp.toString();

  let data: TaskRecord[] = [];
  let meta: ApiListResponse<TaskRecord>['meta'] = {};
  try {
    const result = await serverFetch<ApiListResponse<TaskRecord>>(`/tasks?${query}`);
    data = result.data;
    meta = result.meta;
  } catch { /* empty list on error */ }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Công việc</h1>
        <p className="text-sm text-slate-500">Quản lý và theo dõi công việc của bạn</p>
      </div>
      <TaskListClient
        initialTasks={data as unknown as Parameters<typeof TaskListClient>[0]['initialTasks']}
        meta={meta}
      />
    </div>
  );
}
