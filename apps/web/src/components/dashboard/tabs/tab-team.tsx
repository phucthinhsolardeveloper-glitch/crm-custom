'use client';

import { ChartCard } from '../widgets/chart-card';
import { COLORS, fmtVND } from '../constants';
import type { TeamTabData } from '../hooks/use-tab-data';

interface TabTeamProps {
  data: TeamTabData | null;
  loading: boolean;
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-[250px] animate-pulse rounded-xl bg-slate-100" />
      ))}
    </div>
  );
}

export function TabTeam({ data, loading }: TabTeamProps) {
  if (loading || !data) return <LoadingSkeleton />;

  const maxDeptRev = data.depts.length > 0 ? Math.max(...data.depts.map(x => x.revenue), 1) : 1;
  const maxTeamRev = data.teams.length > 0 ? Math.max(...data.teams.map(x => x.revenue), 1) : 1;

  return (
    <div className="space-y-4">
      {/* Top Performers */}
      {data.performers.length > 0 && (
        <ChartCard title="Top nhân viên trong kỳ">
          <div className="space-y-2.5">
            {data.performers.map((p, i) => {
              const maxRev = data.performers[0]?.revenue || 1;
              const barWidth = Math.max(p.revenue / maxRev * 100, 8);
              return (
                <div key={p.userId} className="flex items-center gap-3">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shrink-0 ${
                    i === 0 ? 'bg-amber-400 text-white'
                    : i === 1 ? 'bg-slate-300 text-white'
                    : i === 2 ? 'bg-orange-300 text-white'
                    : 'bg-slate-100 text-slate-500'
                  }`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-sm font-medium text-slate-700 truncate">{p.name}</span>
                      <span className="text-xs text-slate-500 ml-2 shrink-0">{p.converted} convert</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${barWidth}%`, background: `linear-gradient(to right, ${COLORS.primary}, ${COLORS.purple})` }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-bold text-cyan-600 tabular-nums shrink-0 w-24 text-right">
                    {fmtVND(p.revenue)}
                  </span>
                </div>
              );
            })}
          </div>
        </ChartCard>
      )}

      {/* Dept + Team side by side */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Department Performance */}
        {data.depts.length > 0 && (
          <ChartCard title="Hiệu suất phòng ban">
            <div className="space-y-3">
              {data.depts.map(d => {
                const barW = Math.max(d.revenue / maxDeptRev * 100, 4);
                return (
                  <div key={d.deptId} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{d.name}</span>
                      <div className="flex gap-3 text-xs text-slate-500">
                        <span>{d.leads} leads</span>
                        <span className="text-emerald-600">{d.converted} convert</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${barW}%`, background: `linear-gradient(to right, ${COLORS.primary}, ${COLORS.teal})` }}
                        />
                      </div>
                      <span className="text-sm font-bold text-teal-600 tabular-nums w-28 text-right">{fmtVND(d.revenue)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </ChartCard>
        )}

        {/* Team Performance */}
        {data.teams.length > 0 && (
          <ChartCard title="Hiệu suất team">
            <div className="space-y-3">
              {data.teams.map(t => {
                const barW = Math.max(t.revenue / maxTeamRev * 100, 4);
                return (
                  <div key={t.teamId} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div>
                        <span className="font-medium text-slate-700">{t.name}</span>
                        <span className="ml-1.5 text-xs text-slate-400">{t.dept} · {t.members} NV</span>
                      </div>
                      <div className="flex gap-3 text-xs text-slate-500">
                        <span>{t.leads} leads</span>
                        <span className="text-emerald-600">{t.converted} convert</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${barW}%`, background: `linear-gradient(to right, ${COLORS.indigo}, ${COLORS.purple})` }}
                        />
                      </div>
                      <span className="text-sm font-bold text-sky-600 tabular-nums w-28 text-right">{fmtVND(t.revenue)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </ChartCard>
        )}
      </div>
    </div>
  );
}
