import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { KhoLeadsPage } from '@/components/leads/kho-page-content';

/** Kho Thả Nổi - lead status FLOATING, ai cũng claim được. MANAGER/SUPER_ADMIN only (trang điều phối). */
export default async function KhoFloatingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const user = await getCurrentUser();
  if (user?.role !== 'MANAGER' && user?.role !== 'SUPER_ADMIN') redirect('/leads');
  return <KhoLeadsPage kho="floating" userRole={user.role} searchParams={await searchParams} />;
}
