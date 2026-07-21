const STATS = [
  { value: '10K+', label: 'Leads/tháng', description: 'Xử lý đồng thời' },
  { value: '< 500ms', label: 'API Response', description: 'Tốc độ trung bình' },
  { value: '99.5%', label: 'Uptime', description: 'Cam kết SLA' },
  { value: '200+', label: 'Users', description: 'Đa phòng ban' },
];

export function LandingStats() {
  return (
    <section id="stats" className="relative px-4 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-sky-900 to-sky-950 px-6 py-16 sm:px-12 lg:px-20">
          {/* Section header */}
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
              Được thiết kế cho{' '}
              <span className="bg-gradient-to-r from-sky-300 to-cyan-300 bg-clip-text text-transparent">hiệu suất cao</span>
            </h2>
            <p className="mt-4 text-lg text-sky-200">
              Kiến trúc monorepo hiện đại với NestJS + Next.js + PostgreSQL,
              tối ưu cho quy mô doanh nghiệp vừa và lớn.
            </p>
          </div>

          {/* Stats grid */}
          <div className="mt-14 grid grid-cols-2 gap-8 md:grid-cols-4">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-4xl font-extrabold text-white sm:text-5xl">{stat.value}</div>
                <div className="mt-2 text-sm font-semibold text-sky-200">{stat.label}</div>
                <div className="mt-0.5 text-xs text-sky-400">{stat.description}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
