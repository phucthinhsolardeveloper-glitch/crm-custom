import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { TracePage } from './_components/trace-page';

/** Trace page - SUPER_ADMIN only. */
export default async function Trace() {
  const user = await getCurrentUser();
  if (user?.role !== 'SUPER_ADMIN') {
    redirect('/dashboard');
  }
  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Trace hệ thống</h1>
        <p className="text-sm text-slate-500">Audit log mutation, lịch sử chạy cron - chỉ super admin</p>
      </div>
      <TracePage />
    </div>
  );
}
