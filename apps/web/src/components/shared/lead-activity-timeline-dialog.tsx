'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ActivityTimelineWithFilterTabs } from '@/components/shared/activity-timeline-with-filter-tabs';
import { api } from '@/lib/api-client';
import { Loader2 } from 'lucide-react';

interface Activity {
  id: string;
  type: string;
  content?: string;
  user?: { name: string };
  createdAt: string;
  metadata?: { type?: string; duration?: number; [key: string]: unknown } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
}

/**
 * Dialog showing activity timeline for a lead.
 * Wraps ActivityTimelineWithFilterTabs (presentational) with data fetching.
 * Reuses GET /leads/:id/activities endpoint.
 */
export function LeadActivityTimelineDialog({ open, onOpenChange, leadId }: Props) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .get<{ data: Activity[] }>(`/leads/${leadId}/activities`)
      .then((res) => setActivities(res.data || []))
      .catch(() => setActivities([]))
      .finally(() => setLoading(false));
  }, [open, leadId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lịch tương tác</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
          </div>
        ) : activities.length === 0 ? (
          <div className="py-12 text-center text-slate-400">Chưa có tương tác nào</div>
        ) : (
          <ActivityTimelineWithFilterTabs activities={activities} />
        )}
      </DialogContent>
    </Dialog>
  );
}
