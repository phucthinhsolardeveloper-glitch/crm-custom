import Link from 'next/link';
import { Zap } from 'lucide-react';

export function LandingNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-600 to-cyan-600 shadow-[0_2px_8px_-2px_rgba(14,165,233,0.4)]">
            <Zap size={18} className="text-white" />
          </div>
          <span className="text-xl font-extrabold text-gradient">CRM-Custom</span>
        </Link>

        {/* Nav links */}
        <div className="hidden items-center gap-8 md:flex">
          <a href="#features" className="text-sm font-medium text-slate-600 transition-colors hover:text-sky-600">
            Tính năng
          </a>
          <a href="#stats" className="text-sm font-medium text-slate-600 transition-colors hover:text-sky-600">
            Hiệu suất
          </a>
        </div>

        {/* CTA */}
        <Link
          href="/login"
          className="inline-flex h-10 items-center rounded-lg bg-gradient-to-r from-sky-600 to-cyan-600 px-5 text-sm font-semibold text-white shadow-[0_4px_14px_0_rgba(14,165,233,0.3)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_0_rgba(14,165,233,0.4)]"
        >
          Đăng nhập
        </Link>
      </div>
    </nav>
  );
}
