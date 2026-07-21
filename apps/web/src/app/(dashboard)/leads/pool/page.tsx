import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { KhoLeadsPage } from '@/components/leads/kho-page-content';

/** Kho Mới - lead POOL chưa phân phòng ban. MANAGER/SUPER_ADMIN only. */
export default async function KhoPoolPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const user = await getCurrentUser();
  if (user?.role !== 'MANAGER' && user?.role !== 'SUPER_ADMIN') redirect('/leads');
  return <KhoLeadsPage kho="pool" userRole={user.role} searchParams={await searchParams} />;
}
