import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth';
import { AuthProvider } from '@/providers/auth-provider';
import { OmiCallProvider } from '@/providers/omicall-provider';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { AppHeader } from '@/components/layout/app-header';
import { MobileSidebarProvider } from '@/components/layout/mobile-sidebar-provider';
import { PageTransition } from '@/components/layout/page-transition';

/** Dashboard layout: responsive sidebar + header + main content.
 *  AppSidebar dùng useSearchParams (active highlight cho sub-link Leads),
 *  cần Suspense boundary để Next.js prerender static page (vd /settings/customer-tiers)
 *  không bị CSR bailout error lúc build. */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <AuthProvider initialUser={user}>
      <OmiCallProvider>
        <MobileSidebarProvider>
          <div className="flex h-dvh overflow-hidden">
            <Suspense fallback={null}>
              <AppSidebar />
            </Suspense>
            <div className="flex flex-1 flex-col overflow-hidden">
              <AppHeader />
              <main className="flex-1 overflow-auto bg-slate-50 p-1 sm:p-2">
                <PageTransition>{children}</PageTransition>
              </main>
            </div>
          </div>
        </MobileSidebarProvider>
      </OmiCallProvider>
    </AuthProvider>
  );
}
