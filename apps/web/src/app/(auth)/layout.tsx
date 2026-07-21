/** Auth layout: split-screen - branded panel + form panel. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Left panel - branded visual (hidden on mobile) */}
      <div className="relative hidden w-1/2 overflow-hidden bg-gradient-to-br from-sky-600 via-sky-500 to-cyan-500 lg:flex lg:flex-col lg:items-center lg:justify-center lg:px-12">
        {/* Decorative circles */}
        <div className="absolute -left-20 -top-20 h-80 w-80 rounded-full bg-white/10" />
        <div className="absolute -bottom-16 -right-16 h-64 w-64 rounded-full bg-white/10" />
        <div className="absolute left-1/2 top-1/4 h-40 w-40 rounded-full bg-white/5" />

        {/* Content */}
        <div className="relative z-10 max-w-md text-center text-white">
          {/* Logo */}
          <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm shadow-lg">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>

          <h1 className="text-4xl font-extrabold leading-tight">
            CRM-Custom
          </h1>
          <p className="mt-3 text-lg font-medium text-sky-100">
            Tốc độ & Hiệu suất cho đội ngũ bán hàng
          </p>

          {/* Feature highlights */}
          <div className="mt-10 space-y-4 text-left">
            {[
              { title: 'Lead Pipeline', desc: 'Quản lý 3 kho lead thông minh' },
              { title: 'Auto Verification', desc: 'Xác minh thanh toán tự động' },
              { title: 'AI Distribution', desc: 'Phân phối lead bằng AI scoring' },
            ].map((f) => (
              <div key={f.title} className="flex items-start gap-3 rounded-xl bg-white/10 p-4 backdrop-blur-sm">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold">{f.title}</p>
                  <p className="text-xs text-sky-100">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex w-full items-center justify-center bg-slate-50 px-4 py-8 lg:w-1/2">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
