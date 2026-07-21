'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { traceApi } from '@/lib/api/trace';

interface Props {
  tab: 'audit' | 'cron';
}

const ENTITY_TYPES = ['LEAD', 'CUSTOMER', 'ORDER', 'PAYMENT', 'USER', 'TASK', 'AUTH'];
const STATUS_CODE_PRESETS = ['', '2xx', '4xx', '5xx'];
const METHODS = ['', 'POST', 'PUT', 'PATCH', 'DELETE'];
const CRON_STATUSES = ['', 'RUNNING', 'SUCCESS', 'FAILED'];

/**
 * Filter bar - writes to URL search params; the parent page reads URL on every
 * change and refetches. URL-based state means filters are shareable.
 */
export function TraceFilters({ tab }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [actions, setActions] = useState<string[]>([]);
  const [jobs, setJobs] = useState<string[]>([]);

  useEffect(() => {
    if (tab === 'audit') {
      traceApi.listAuditLogActions().then((r) => setActions(r.data)).catch(() => {});
    } else {
      traceApi.listCronJobs().then((r) => setJobs(r.data)).catch(() => {});
    }
  }, [tab]);

  const update = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === '' || v === undefined) next.delete(k);
      else next.set(k, v);
    }
    next.delete('cursor');
    router.replace(`/trace?${next.toString()}`, { scroll: false });
  };

  const clearAll = () => {
    const next = new URLSearchParams();
    next.set('tab', tab);
    router.replace(`/trace?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="mt-3 p-3 rounded-lg border border-slate-200 bg-white">
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {tab === 'audit' && (
          <>
            <select
              className="h-9 rounded-md border border-slate-300 px-2 text-sm"
              value={sp.get('action') ?? ''}
              onChange={(e) => update({ action: e.target.value })}
            >
              <option value="">Tất cả action</option>
              {actions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-slate-300 px-2 text-sm"
              value={sp.get('entityType') ?? ''}
              onChange={(e) => update({ entityType: e.target.value })}
            >
              <option value="">Tất cả entity type</option>
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-slate-300 px-2 text-sm"
              value={sp.get('method') ?? ''}
              onChange={(e) => update({ method: e.target.value })}
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>{m || 'Tất cả method'}</option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-slate-300 px-2 text-sm"
              value={sp.get('statusCode') ?? ''}
              onChange={(e) => update({ statusCode: e.target.value })}
            >
              {STATUS_CODE_PRESETS.map((s) => (
                <option key={s} value={s}>{s || 'Tất cả status code'}</option>
              ))}
            </select>
            <Input
              placeholder="User ID"
              className="h-9"
              defaultValue={sp.get('userId') ?? ''}
              onBlur={(e) => update({ userId: e.target.value })}
            />
            <Input
              placeholder="Entity ID"
              className="h-9"
              defaultValue={sp.get('entityId') ?? ''}
              onBlur={(e) => update({ entityId: e.target.value })}
            />
            <Input
              placeholder="IP address"
              className="h-9"
              defaultValue={sp.get('ipAddress') ?? ''}
              onBlur={(e) => update({ ipAddress: e.target.value })}
            />
          </>
        )}

        {tab === 'cron' && (
          <>
            <select
              className="h-9 rounded-md border border-slate-300 px-2 text-sm"
              value={sp.get('jobName') ?? ''}
              onChange={(e) => update({ jobName: e.target.value })}
            >
              <option value="">Tất cả job</option>
              {jobs.map((j) => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-slate-300 px-2 text-sm"
              value={sp.get('status') ?? ''}
              onChange={(e) => update({ status: e.target.value })}
            >
              {CRON_STATUSES.map((s) => (
                <option key={s} value={s}>{s || 'Tất cả status'}</option>
              ))}
            </select>
          </>
        )}

        <Input
          type="datetime-local"
          className="h-9"
          defaultValue={sp.get('from') ?? ''}
          onBlur={(e) => update({ from: e.target.value })}
          placeholder="Từ ngày"
        />
        <Input
          type="datetime-local"
          className="h-9"
          defaultValue={sp.get('to') ?? ''}
          onBlur={(e) => update({ to: e.target.value })}
          placeholder="Đến ngày"
        />
      </div>
      <div className="mt-3 flex justify-end">
        <Button variant="outline" size="sm" onClick={clearAll}>
          Xoá bộ lọc
        </Button>
      </div>
    </div>
  );
}
