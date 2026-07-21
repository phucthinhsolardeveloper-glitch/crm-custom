import Link from 'next/link';
import { ArrowRight, Users, TrendingUp, Shield, BarChart3, CheckCircle, Zap } from 'lucide-react';

export function LandingHero() {
  return (
    <section className="relative px-4 pt-20 pb-16 sm:px-6 lg:pb-24 lg:pt-28">
      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
        {/* Text column */}
        <div className="max-w-xl">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-sky-600 to-cyan-600 text-[10px] font-bold text-white">
              <Zap size={10} />
            </span>
            <span className="text-xs font-semibold text-sky-700">CRM nội bộ thế hệ mới</span>
          </div>

          {/* Headline with gradient */}
          <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Tốc độ &{' '}
            <span className="text-gradient">Hiệu suất</span>{' '}
            cho đội ngũ bán hàng
          </h1>

          <p className="mt-6 text-lg leading-relaxed text-slate-500">
            CRM-Custom giúp đội sales quản lý lead pipeline, theo dõi conversion,
            phân phối AI-based và xác minh thanh toán tự động - tất cả trong một hệ thống duy nhất.
          </p>

          {/* CTA buttons */}
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/login"
              className="group inline-flex h-12 items-center gap-2 rounded-lg bg-gradient-to-r from-sky-600 to-cyan-600 px-7 text-sm font-semibold text-white shadow-[0_4px_14px_0_rgba(14,165,233,0.3)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_0_rgba(14,165,233,0.4)]"
            >
              Bắt đầu ngay
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
            </Link>
            <a
              href="#features"
              className="inline-flex h-12 items-center rounded-lg border border-slate-200 bg-white px-7 text-sm font-semibold text-slate-700 transition-all duration-200 hover:border-slate-300 hover:bg-slate-50"
            >
              Tìm hiểu thêm
            </a>
          </div>

          {/* Trust indicators */}
          <div className="mt-10 flex items-center gap-6 text-sm text-slate-500">
            <span className="flex items-center gap-1.5">
              <CheckCircle size={16} className="text-emerald-500" /> Triển khai nhanh
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle size={16} className="text-emerald-500" /> Bảo mật cao
            </span>
          </div>
        </div>

        {/* Isometric mockup column */}
        <div className="relative hidden lg:block" style={{ perspective: '2000px' }}>
          <div
            className="relative rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_-15px_rgba(14,165,233,0.15)] transition-transform duration-500"
            style={{ transform: 'rotateX(5deg) rotateY(-8deg)' }}
          >
            {/* Mockup header */}
            <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
              <div className="h-3 w-3 rounded-full bg-red-400" />
              <div className="h-3 w-3 rounded-full bg-amber-400" />
              <div className="h-3 w-3 rounded-full bg-emerald-400" />
              <span className="ml-3 text-xs font-medium text-slate-400">CRM-Custom Dashboard</span>
            </div>

            {/* Mockup KPI row */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: 'Leads mới', value: '1.284', color: 'from-sky-500 to-sky-600', icon: Users },
                { label: 'Chuyển đổi', value: '89%', color: 'from-emerald-500 to-emerald-600', icon: TrendingUp },
                { label: 'Doanh thu', value: '2.4B ₫', color: 'from-cyan-500 to-cyan-600', icon: BarChart3 },
              ].map((kpi) => (
                <div key={kpi.label} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{kpi.label}</span>
                    <div className={`flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br ${kpi.color} text-white`}>
                      <kpi.icon size={12} />
                    </div>
                  </div>
                  <p className="mt-1 text-lg font-bold text-slate-900">{kpi.value}</p>
                </div>
              ))}
            </div>

            {/* Mockup chart placeholder */}
            <div className="rounded-xl border border-slate-100 p-4">
              <div className="mb-2 text-xs font-semibold text-slate-500">Doanh thu theo ngày</div>
              <div className="flex items-end gap-1.5 h-20">
                {[40, 65, 45, 80, 55, 90, 70, 95, 60, 85, 75, 100].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm bg-gradient-to-t from-sky-500 to-cyan-400 opacity-80"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Floating badge - top right */}
          <div className="absolute -right-4 -top-4 animate-pulse rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-[0_4px_20px_-2px_rgba(14,165,233,0.15)]" style={{ animationDuration: '4s' }}>
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-emerald-500" />
              <span className="text-xs font-semibold text-slate-700">IDOR Protected</span>
            </div>
          </div>

          {/* Floating badge - bottom left */}
          <div className="absolute -bottom-2 -left-4 animate-pulse rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-[0_4px_20px_-2px_rgba(14,165,233,0.15)]" style={{ animationDuration: '5s' }}>
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-sky-500" />
              <span className="text-xs font-semibold text-slate-700">AI Distribution</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
