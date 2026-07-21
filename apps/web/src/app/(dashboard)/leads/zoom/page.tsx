import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { KhoLeadsPage } from '@/components/leads/kho-page-content';

/** Kho Zoom - lead status ZOOM. MANAGER/SUPER_ADMIN only. */
export default async function KhoZoomPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const user = await getCurrentUser();
  if (user?.role !== 'MANAGER' && user?.role !== 'SUPER_ADMIN') redirect('/leads');
  return <KhoLeadsPage kho="zoom" userRole={user.role} searchParams={await searchParams} />;
}
