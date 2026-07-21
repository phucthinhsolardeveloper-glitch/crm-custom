'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { traceApi, type AuditLogQuery, type CronRunQuery } from '@/lib/api/trace';
import type { AuditLogResponse, CronRunResponse } from '@crm/types';
import { TraceFilters } from './trace-filters';
import { AuditLogTable } from './audit-log-table';
import { CronRunTable } from './cron-run-table';

type TabValue = 'audit' | 'cron';

export function TracePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get('tab') as TabValue) || 'audit';

  const [auditLogs, setAuditLogs] = useState<AuditLogResponse[]>([]);
  const [auditNextCursor, setAuditNextCursor] = useState<string | undefined>();
  const [cronRuns, setCronRuns] = useState<CronRunResponse[]>([]);
  const [cronNextCursor, setCronNextCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const fromUrl = (key: string): string | undefined => searchParams.get(key) ?? undefined;

  const fetchAudit = useCallback(async (append = false) => {
    setLoading(true);
    try {
      const q: AuditLogQuery = {
        userId: fromUrl('userId'),
        action: fromUrl('action'),
        entityType: fromUrl('entityType'),
        entityId: fromUrl('entityId'),
        method: fromUrl('method'),
        statusCode: fromUrl('statusCode'),
        ipAddress: fromUrl('ipAddress'),
        from: fromUrl('from'),
        to: fromUrl('to'),
        cursor: append ? auditNextCursor : undefined,
      };
      const res = await traceApi.listAuditLogs(q);
      setAuditLogs(append ? [...auditLogs, ...res.data] : res.data);
      setAuditNextCursor(res.meta.nextCursor);
    } catch (err) {
      console.error('Audit fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [searchParams, auditNextCursor, auditLogs]);

  const fetchCron = useCallback(async (append = false) => {
    setLoading(true);
    try {
      const q: CronRunQuery = {
        jobName: fromUrl('jobName'),
        status: fromUrl('status') as CronRunQuery['status'],
        from: fromUrl('from'),
        to: fromUrl('to'),
        cursor: append ? cronNextCursor : undefined,
      };
      const res = await traceApi.listCronRuns(q);
      setCronRuns(append ? [...cronRuns, ...res.data] : res.data);
      setCronNextCursor(res.meta.nextCursor);
    } catch (err) {
      console.error('Cron fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [searchParams, cronNextCursor, cronRuns]);

  useEffect(() => {
    if (tab === 'audit') {
      setAuditNextCursor(undefined);
      fetchAudit(false);
    } else {
      setCronNextCursor(undefined);
      fetchCron(false);
    }
  }, [searchParams.toString()]);

  const setTab = (value: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set('tab', value);
    router.replace(`/trace?${sp.toString()}`, { scroll: false });
  };

  const refresh = () => {
    if (tab === 'audit') fetchAudit(false);
    else fetchCron(false);
  };

  return (
    <div className="mt-4">
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <TabsList>
            <TabsTrigger value="audit">Audit Log</TabsTrigger>
            <TabsTrigger value="cron">Cron Runs</TabsTrigger>
          </TabsList>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
        </div>

        <TraceFilters tab={tab} />

        <TabsContent value="audit">
          <AuditLogTable
            rows={auditLogs}
            nextCursor={auditNextCursor}
            onLoadMore={() => fetchAudit(true)}
            loading={loading}
          />
        </TabsContent>
        <TabsContent value="cron">
          <CronRunTable
            rows={cronRuns}
            nextCursor={cronNextCursor}
            onLoadMore={() => fetchCron(true)}
            loading={loading}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
