'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FormField } from '@/components/shared/form-field';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useFormAction } from '@/hooks/use-form-action';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { Plus, Copy, Trash2, ToggleLeft, ToggleRight, Webhook, CheckCircle, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';

interface WebhookEndpointItem {
  id: string;
  name: string;
  slug: string;
  secretPrefix?: string;
  isActive: boolean;
  lastTriggeredAt?: string | null;
  triggerCount?: number;
  createdAt?: string;
  creator?: { name: string } | null;
  secret?: string;
}

interface WebhookEndpointSettingsProps {
  endpoints: WebhookEndpointItem[];
}

function buildWebhookUrl(slug: string): string {
  if (typeof window === 'undefined') return `/api/v1/webhooks/in/${slug}`;
  // API thuong chay cung domain hoac port khac. Default thay ':3011' bang ':3010' khi local.
  const origin = window.location.origin.replace(':3011', ':3010');
  return `${origin}/api/v1/webhooks/in/${slug}`;
}

export function WebhookEndpointSettings({ endpoints: initialEndpoints }: WebhookEndpointSettingsProps) {
  const [endpoints, setEndpoints] = useState<WebhookEndpointItem[]>(initialEndpoints);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newEndpoint, setNewEndpoint] = useState<WebhookEndpointItem | null>(null);
  const [copiedField, setCopiedField] = useState<'url' | 'secret' | null>(null);
  const deleteAction = useFormAction({ successMessage: 'Da xoa webhook' });

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await api.post<{ data: WebhookEndpointItem }>('/webhook-endpoints', { name: name.trim() });
      setNewEndpoint(res.data);
      setEndpoints(prev => [res.data, ...prev]);
      setName('');
      toast.success('Da tao webhook');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Loi tao webhook');
    }
    setCreating(false);
  }

  async function toggleActive(id: string, isActive: boolean) {
    try {
      await api.patch(`/webhook-endpoints/${id}/${isActive ? 'deactivate' : 'activate'}`);
      setEndpoints(prev => prev.map(e => e.id === id ? { ...e, isActive: !isActive } : e));
      toast.success(isActive ? 'Da vo hieu' : 'Da kich hoat');
    } catch { /* */ }
  }

  async function handleDelete(id: string) {
    await deleteAction.execute('delete', `/webhook-endpoints/${id}`);
    setEndpoints(prev => prev.filter(e => e.id !== id));
  }

  function copy(field: 'url' | 'secret', value: string) {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  function closeCreateDialog() {
    setCreateOpen(false);
    setNewEndpoint(null);
    setCopiedField(null);
    setName('');
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">
          Webhook URL nhan du lieu tu ben thu 3 (vd: OmiCall ban CDR cuoc goi vao).
          Moi webhook co URL + secret rieng, co the xoa khi khong dung.
        </p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />Tao Webhook
        </Button>
      </div>

      {endpoints.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400">
          Chua co webhook nao
        </div>
      ) : (
        <div className="space-y-2">
          {endpoints.map((e) => (
            <div key={e.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
              <Webhook className="h-4 w-4 text-sky-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-900">{e.name}</span>
                  <code className="text-xs text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded">
                    /webhooks/in/{e.slug}
                  </code>
                  {e.secretPrefix && (
                    <code className="text-xs text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
                      {e.secretPrefix}...
                    </code>
                  )}
                  {!e.isActive && <span className="text-xs text-red-500 font-medium">Vo hieu</span>}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Tao {e.createdAt ? formatDate(e.createdAt) : '-'}
                  {typeof e.triggerCount === 'number' && <> · Trigger {e.triggerCount} lan</>}
                  {e.lastTriggeredAt && <> · Last {formatDate(e.lastTriggeredAt)}</>}
                  {e.creator?.name && <> · boi {e.creator.name}</>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => copy('url', buildWebhookUrl(e.slug))}
                  title="Copy URL"
                >
                  <LinkIcon className="h-4 w-4 text-slate-400" />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => toggleActive(String(e.id), e.isActive)}
                  title={e.isActive ? 'Vo hieu' : 'Kich hoat'}
                >
                  {e.isActive ? <ToggleRight className="h-4 w-4 text-emerald-500" /> : <ToggleLeft className="h-4 w-4 text-slate-400" />}
                </Button>
                <ConfirmDialog
                  trigger={<Button variant="ghost" size="icon" className="h-8 w-8"><Trash2 className="h-4 w-4 text-red-400" /></Button>}
                  title="Xoa Webhook"
                  description={`Xoa "${e.name}"? URL nay se khong nhan duoc du lieu nua. Khong the hoan tac.`}
                  confirmLabel="Xoa"
                  onConfirm={() => handleDelete(String(e.id))}
                  isLoading={deleteAction.isLoading}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={closeCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{newEndpoint ? 'Webhook da tao' : 'Tao Webhook'}</DialogTitle>
          </DialogHeader>

          {newEndpoint ? (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-800 mb-2">
                  Sao chep secret ngay - se khong hien lai!
                </p>

                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-slate-600 mb-1 block">URL Webhook</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-white rounded px-2 py-1.5 border border-amber-200 break-all select-all">
                        {buildWebhookUrl(newEndpoint.slug)}
                      </code>
                      <Button size="sm" variant="outline" onClick={() => copy('url', buildWebhookUrl(newEndpoint.slug))}>
                        {copiedField === 'url' ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-slate-600 mb-1 block">Secret (header x-webhook-secret)</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-white rounded px-2 py-1.5 border border-amber-200 break-all select-all">
                        {newEndpoint.secret}
                      </code>
                      <Button size="sm" variant="outline" onClick={() => copy('secret', newEndpoint.secret || '')}>
                        {copiedField === 'secret' ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-slate-700 space-y-1.5">
                <p className="font-medium text-sky-800">Cach dung tren OmiCall dashboard</p>
                <p>1. Vao <strong>Cau hinh &gt; Doanh nghiep &gt; Tich hop &gt; WEBHOOK</strong></p>
                <p>2. Dan URL o tren vao o URL webhook</p>
                <p>3. Them custom header:</p>
                <pre className="bg-white rounded border border-sky-200 p-2 text-[11px]">x-webhook-secret: {newEndpoint.secret}</pre>
                <p>4. Chon event/state: <code className="bg-white px-1">cdr</code> (khi cuoc goi ket thuc)</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <FormField label="Ten webhook" required>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="VD: OmiCall Production, OmiCall Staging"
                  autoFocus
                />
              </FormField>
              <p className="text-xs text-slate-500">
                Sau khi tao, ban se nhan URL + secret de dan vao OmiCall dashboard.
                Secret chi hien 1 lan - copy ngay sau khi tao.
              </p>
            </div>
          )}

          <DialogFooter>
            {newEndpoint ? (
              <Button onClick={closeCreateDialog}>Dong</Button>
            ) : (
              <>
                <Button variant="outline" onClick={closeCreateDialog}>Huy</Button>
                <Button onClick={handleCreate} disabled={creating || !name.trim()}>
                  {creating ? 'Dang tao...' : 'Tao'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
