import {
  Users, CreditCard, BarChart3, Zap,
  CheckSquare, Upload, Shield, Bell,
} from 'lucide-react';

const FEATURES = [
  {
    icon: Users,
    title: '3 Kho Lead thông minh',
    description: 'Kho Mới, Kho Phòng Ban, Kho Thả Nổi - phân phối lead công bằng, claim tự do, round-robin tự động.',
  },
  {
    icon: CreditCard,
    title: 'Xác minh thanh toán tự động',
    description: 'Auto-match webhook ngân hàng với payment, fuzzy cron 2h, partial payment tracking đến khi đủ.',
  },
  {
    icon: Zap,
    title: 'Phân phối AI-based',
    description: 'Weighted scoring: workload 30% + level 30% + performance 40%. Config per department, toggle on/off.',
  },
  {
    icon: BarChart3,
    title: 'Analytics Dashboard',
    description: 'KPI cards, conversion funnel, sales ranking, source chart, revenue trend - tất cả real-time.',
  },
  {
    icon: CheckSquare,
    title: 'Tasks & Reminders',
    description: 'Quick add bar với smart time parsing, reminder 1 lần, escalation quá hạn 1h → user, 24h → manager.',
  },
  {
    icon: Upload,
    title: 'Import CSV 10K+ rows',
    description: 'Background processing với BullMQ, dedup SĐT+nguồn+sản phẩm, progress tracking real-time.',
  },
  {
    icon: Shield,
    title: 'Bảo mật OWASP Top 10',
    description: 'IDOR prevention, bcrypt cost 12, JWT rotation, rate limiting, CSV formula injection sanitization.',
  },
  {
    icon: Bell,
    title: 'Thông báo In-app',
    description: 'Lead assigned, transfer, claim, payment verified, task reminder - polling 30s, auto cleanup.',
  },
];

export function LandingFeatures() {
  return (
    <section id="features" className="relative px-4 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-7xl">
        {/* Section header */}
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-wider text-sky-600">Tính năng</span>
          <h2 className="mt-3 text-3xl font-extrabold text-slate-900 sm:text-4xl">
            Mọi thứ đội sales{' '}
            <span className="text-gradient">cần trong một nơi</span>
          </h2>
          <p className="mt-4 text-lg text-slate-500">
            Từ quản lý lead pipeline đến xác minh thanh toán tự động, CRM-Custom
            cung cấp toàn bộ công cụ để tối ưu hiệu suất bán hàng.
          </p>
        </div>

        {/* Feature grid */}
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="card-hover group rounded-xl border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(14,165,233,0.08)]"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-sky-600 transition-colors group-hover:bg-gradient-to-br group-hover:from-sky-600 group-hover:to-cyan-600 group-hover:text-white">
                <feature.icon size={22} />
              </div>
              <h3 className="text-base font-bold text-slate-900">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{feature.description}</p>
              <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-sky-600 opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-1">
                Tìm hiểu thêm <span aria-hidden="true">&rarr;</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
