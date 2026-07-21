import { Zap } from 'lucide-react';

export function LandingFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-600 to-cyan-600">
            <Zap size={14} className="text-white" />
          </div>
          <span className="text-sm font-bold text-gradient">CRM-Custom</span>
        </div>
        <p className="text-xs text-slate-400">
          NestJS 11 + Next.js 16 + PostgreSQL 16 + Prisma 6 - Built with Turborepo
        </p>
      </div>
    </footer>
  );
}
