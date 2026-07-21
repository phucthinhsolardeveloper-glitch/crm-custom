import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export function LandingCta() {
  return (
    <section className="px-4 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-extrabold text-slate-900 sm:text-4xl">
          Sẵn sàng tăng tốc{' '}
          <span className="text-gradient">đội ngũ bán hàng?</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-slate-500">
          Triển khai CRM-Custom nhanh chóng với Docker Compose.
          Hỗ trợ 50-200 users, multi-department, phân quyền chi tiết.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/login"
            className="group inline-flex h-12 items-center gap-2 rounded-lg bg-gradient-to-r from-sky-600 to-cyan-600 px-8 text-sm font-semibold text-white shadow-[0_4px_14px_0_rgba(14,165,233,0.3)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_0_rgba(14,165,233,0.4)]"
          >
            Đăng nhập hệ thống
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}
