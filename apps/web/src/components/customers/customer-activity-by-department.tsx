'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { Phone, MessageSquare, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeptActivity {
  id: string;
  type: string;
  content: string | null;
  createdAt: string;
  user: { id: string; name: string; departmentName: string | null } | null;
}

interface DeptStatGroup {
  departmentId: string | null;
  departmentName: string;
  count: number;
  activities: DeptActivity[];
}

interface StatsResponse {
  data: DeptStatGroup[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPT_COLORS = [
  { bar: '#0891b2', badge: 'bg-cyan-100 text-cyan-800' },       // teal
  { bar: '#059669', badge: 'bg-emerald-100 text-emerald-800' },  // emerald
  { bar: '#d97706', badge: 'bg-amber-100 text-amber-800' },      // amber
  { bar: '#be123c', badge: 'bg-rose-100 text-rose-800' },        // rose
  { bar: '#0ea5e9', badge: 'bg-sky-100 text-sky-800' },          // sky
  { bar: '#06b6d4', badge: 'bg-teal-100 text-teal-800' },    // violet
  { bar: '#db2777', badge: 'bg-pink-100 text-pink-800' },        // pink
];

const PAGE_SIZE = 10;

// ─── Sub-components ───────────────────────────────────────────────────────────

function ActivityTypeBadge({ type }: { type: string }) {
  if (type === 'CALL') {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-700">
        <Phone className="h-2.5 w-2.5" />
        Gọi
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700">
      <MessageSquare className="h-2.5 w-2.5" />
      Ghi chú
    </span>
  );
}

function ActivityRow({ activity }: { activity: DeptActivity }) {
  return (
    <div className="flex gap-3 border-b border-slate-50 pb-2 last:border-0 last:pb-0">
      <div className="mt-0.5 shrink-0">
        {activity.type === 'CALL'
          ? <Phone className="h-3.5 w-3.5 text-green-500" />
          : <MessageSquare className="h-3.5 w-3.5 text-amber-500" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-slate-700">{activity.user?.name || '-'}</span>
          <ActivityTypeBadge type={activity.type} />
          <span className="text-[10px] text-slate-400 ml-auto whitespace-nowrap">
            {formatDateTime(activity.createdAt)}
          </span>
        </div>
        {activity.content && (
          <p className="mt-0.5 text-xs text-slate-600 line-clamp-2">{activity.content}</p>
        )}
      </div>
    </div>
  );
}

function DeptRow({
  group,
  color,
  maxCount,
  expanded,
  onToggle,
}: {
  group: DeptStatGroup;
  color: { bar: string; badge: string };
  maxCount: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [shownCount, setShownCount] = useState(PAGE_SIZE);
  const barWidth = maxCount > 0 ? Math.max(4, Math.round((group.count / maxCount) * 100)) : 4;
  const visibleActivities = group.activities.slice(0, shownCount);
  const hasMore = group.activities.length > shownCount;

  return (
    <div className="rounded-lg border border-slate-100 overflow-hidden">
      {/* Bar row - clickable */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left"
        type="button"
      >
        {/* Dept name */}
        <span className="w-28 shrink-0 text-xs font-medium text-slate-700 truncate">
          {group.departmentName}
        </span>

        {/* Bar */}
        <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${barWidth}%`, backgroundColor: color.bar }}
          />
        </div>

        {/* Count */}
        <span className="w-8 shrink-0 text-right text-xs font-semibold text-slate-600">
          {group.count}
        </span>

        {/* Toggle icon */}
        {expanded
          ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        }
      </button>

      {/* Expanded activity list */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-2.5 space-y-2">
          {visibleActivities.map(act => (
            <ActivityRow key={act.id} activity={act} />
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShownCount(c => c + PAGE_SIZE); }}
              className="mt-1 text-xs text-sky-600 hover:text-sky-700 font-medium"
            >
              Xem thêm ({group.activities.length - shownCount} còn lại)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  entityType: 'CUSTOMER' | 'LEAD';
  entityId: string;
}

export function CustomerActivityByDepartment({ entityType, entityId }: Props) {
  const [groups, setGroups] = useState<DeptStatGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDept, setExpandedDept] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get<StatsResponse>(`/activities/stats/by-department?entityType=${entityType}&entityId=${entityId}`)
      .then(res => {
        if (!cancelled) setGroups(res.data);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Lỗi tải dữ liệu');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [entityType, entityId]);

  const maxCount = groups.reduce((m, g) => Math.max(m, g.count), 0);
  const totalInteractions = groups.reduce((s, g) => s + g.count, 0);

  const toggleDept = (key: string) =>
    setExpandedDept(prev => (prev === key ? null : key));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900">Tương tác theo phòng ban</h3>
        {!loading && totalInteractions > 0 && (
          <span className="text-xs text-slate-400">{totalInteractions} tương tác</span>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      )}

      {!loading && error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      {!loading && !error && groups.length === 0 && (
        <p className="text-sm text-slate-400">Chưa có tương tác</p>
      )}

      {!loading && !error && groups.length > 0 && (
        <div className="space-y-2">
          {groups.map((group, idx) => {
            const color = DEPT_COLORS[idx % DEPT_COLORS.length];
            const key = group.departmentId ?? '__unknown__';
            return (
              <DeptRow
                key={key}
                group={group}
                color={color}
                maxCount={maxCount}
                expanded={expandedDept === key}
                onToggle={() => toggleDept(key)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
