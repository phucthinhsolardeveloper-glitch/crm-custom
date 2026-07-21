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
import { Plus, Copy, Trash2, ToggleLeft, ToggleRight, Key, CheckCircle, Bot } from 'lucide-react';
import { toast } from 'sonner';

const MCP_PERMISSIONS = [
  { key: 'mcp:*', label: 'Tất cả quyền MCP', description: 'Full access cho AI agent' },
  { key: 'mcp:leads:read', label: 'Đọc leads', description: 'Tìm kiếm, xem chi tiết lead' },
  { key: 'mcp:customers:read', label: 'Đọc khách hàng', description: 'Tìm kiếm, xem chi tiết khách hàng' },
  { key: 'mcp:orders:read', label: 'Đọc đơn hàng', description: 'Tìm kiếm, xem chi tiết đơn hàng' },
  { key: 'mcp:products:read', label: 'Đọc sản phẩm', description: 'Danh sách sản phẩm' },
  { key: 'mcp:stats:read', label: 'Thống kê', description: 'Dashboard KPIs, lead funnel' },
  { key: 'mcp:users:read', label: 'Danh sách NV', description: 'Tên, phòng ban, vai trò (không email/SĐT)' },
  { key: 'mcp:reference:read', label: 'Đọc dữ liệu tham chiếu', description: 'Nguồn, nhãn, phòng ban, hạng KH, loại thanh toán...' },
  { key: 'mcp:schema:read', label: 'Xem schema', description: 'Cấu trúc API, bộ lọc, enum values' },
] as const;

const LEGACY_PERMISSIONS = [
  { key: 'leads:create', label: 'Tạo lead (API cũ)', description: 'POST /external/leads' },
] as const;

interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix?: string;
  permissions?: string[];
  isActive: boolean;
  createdAt?: string;
  lastUsedAt?: string | null;
  creator?: { name: string } | null;
  key?: string;
}

interface ApiKeySettingsProps {
  apiKeys: ApiKeyItem[];
}

export function ApiKeySettings({ apiKeys: initialKeys }: ApiKeySettingsProps) {
  const [keys, setKeys] = useState<ApiKeyItem[]>(initialKeys);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [newKeyPerms, setNewKeyPerms] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const deleteAction = useFormAction({ successMessage: 'Đã xóa API key' });

  function togglePerm(perm: string) {
    setSelectedPerms(prev => {
      const next = new Set(prev);
      if (perm === 'mcp:*') {
        // Toggle all MCP permissions
        if (next.has('mcp:*')) {
          MCP_PERMISSIONS.forEach(p => next.delete(p.key));
        } else {
          MCP_PERMISSIONS.forEach(p => next.add(p.key));
        }
      } else {
        if (next.has(perm)) next.delete(perm); else next.add(perm);
        // If all individual perms selected, auto-select wildcard
        const allIndividual = MCP_PERMISSIONS.filter(p => p.key !== 'mcp:*').every(p => next.has(p.key));
        if (allIndividual) next.add('mcp:*'); else next.delete('mcp:*');
      }
      return next;
    });
  }

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const permissions = [...selectedPerms];
      const res = await api.post<{ data: ApiKeyItem }>('/api-keys', {
        name: name.trim(),
        permissions: permissions.length > 0 ? permissions : undefined,
      });
      setNewKey(res.data.key ?? null);
      setNewKeyPerms(permissions);
      setKeys(prev => [{ ...res.data, permissions }, ...prev]);
      setName('');
      toast.success('Đã tạo API key');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Lỗi tạo API key');
    }
    setCreating(false);
  }

  async function toggleActive(id: string, isActive: boolean) {
    try {
      await api.patch(`/api-keys/${id}/${isActive ? 'deactivate' : 'activate'}`);
      setKeys(prev => prev.map(k => k.id === id ? { ...k, isActive: !isActive } : k));
      toast.success(isActive ? 'Đã vô hiệu' : 'Đã kích hoạt');
    } catch { /* */ }
  }

  async function handleDelete(id: string) {
    await deleteAction.execute('delete', `/api-keys/${id}`);
    setKeys(prev => prev.filter(k => k.id !== id));
  }

  function copyKey() {
    if (newKey) { navigator.clipboard.writeText(newKey); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }

  function closeCreateDialog() {
    setCreateOpen(false);
    setNewKey(null);
    setNewKeyPerms([]);
    setCopied(false);
    setName('');
    setSelectedPerms(new Set());
  }

  const hasMcpPerms = (perms?: string[]) => perms?.some((p: string) => p.startsWith('mcp:'));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">Quản lý API key cho tích hợp bên thứ 3 và AI Agent (MCP)</p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />Tạo API Key
        </Button>
      </div>

      {/* Keys list */}
      {keys.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400">Chưa có API key nào</div>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
              {hasMcpPerms(k.permissions) ? (
                <Bot className="h-4 w-4 text-sky-500 shrink-0" />
              ) : (
                <Key className="h-4 w-4 text-slate-400 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{k.name}</span>
                  <code className="text-xs text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">{k.keyPrefix}...</code>
                  {hasMcpPerms(k.permissions) && (
                    <span className="text-xs text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded font-medium">MCP</span>
                  )}
                  {!k.isActive && <span className="text-xs text-red-500 font-medium">Vô hiệu</span>}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Tạo {k.createdAt ? formatDate(k.createdAt) : '-'}
                  {k.lastUsedAt && <> · Dùng lần cuối {formatDate(k.lastUsedAt)}</>}
                  {k.creator?.name && <> · bởi {k.creator.name}</>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleActive(String(k.id), k.isActive)}
                  title={k.isActive ? 'Vô hiệu' : 'Kích hoạt'}>
                  {k.isActive ? <ToggleRight className="h-4 w-4 text-emerald-500" /> : <ToggleLeft className="h-4 w-4 text-slate-400" />}
                </Button>
                <ConfirmDialog
                  trigger={<Button variant="ghost" size="icon" className="h-8 w-8"><Trash2 className="h-4 w-4 text-red-400" /></Button>}
                  title="Xóa API Key" description={`Xóa "${k.name}"? Không thể hoàn tác.`}
                  confirmLabel="Xóa" onConfirm={() => handleDelete(String(k.id))} isLoading={deleteAction.isLoading}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={closeCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{newKey ? 'API Key đã tạo' : 'Tạo API Key'}</DialogTitle></DialogHeader>

          {newKey ? (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-800 mb-2">Sao chép key ngay - sẽ không hiện lại!</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-white rounded px-2 py-1.5 border border-amber-200 break-all select-all">{newKey}</code>
                  <Button size="sm" variant="outline" onClick={copyKey}>
                    {copied ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="text-xs text-slate-500 space-y-2">
                <p>Header: <code className="bg-slate-100 px-1">x-api-key: {'{key}'}</code></p>

                {newKeyPerms.some((p: string) => p.startsWith('mcp:')) && (
                  <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 space-y-1.5">
                    <p className="font-medium text-sky-800 flex items-center gap-1.5">
                      <Bot className="h-3.5 w-3.5" /> Kết nối MCP Server
                    </p>
                    <p className="text-sky-700">Endpoint: <code className="bg-white px-1 rounded border border-sky-200">POST {typeof window !== 'undefined' ? window.location.origin.replace(':3011', ':3010') : ''}/api/v1/mcp</code></p>
                    <p className="text-sky-700">Transport: Streamable HTTP (stateless)</p>
                    <p className="text-sky-700 mt-1">Cấu hình trong Claude Desktop / MCP client:</p>
                    <pre className="bg-white rounded border border-sky-200 p-2 text-[11px] leading-relaxed overflow-x-auto">{`{
  "mcpServers": {
    "crm": {
      "url": "${typeof window !== 'undefined' ? window.location.origin.replace(':3011', ':3010') : 'http://localhost:3010'}/api/v1/mcp",
      "headers": {
        "x-api-key": "${newKey}"
      }
    }
  }
}`}</pre>
                  </div>
                )}

                {!newKeyPerms.some((p: string) => p.startsWith('mcp:')) && (
                  <div>
                    <p>Endpoints được phép:</p>
                    <ul className="list-disc pl-4">
                      <li><code>POST /api/v1/external/leads</code> - Tạo lead</li>
                      <li><code>POST /api/v1/call-logs/ingest</code> - Gửi log cuộc gọi</li>
                      <li><code>POST /api/v1/webhooks/bank-transactions</code> - Webhook ngân hàng</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <FormField label="Tên key" required>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="VD: Claude AI Agent, Website lead form" autoFocus />
              </FormField>

              {/* MCP Permissions */}
              <div>
                <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5 mb-2">
                  <Bot className="h-4 w-4 text-sky-500" /> Quyền MCP (AI Agent)
                </label>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                  {MCP_PERMISSIONS.map((p) => (
                    <label key={p.key} className="flex items-start gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={selectedPerms.has(p.key)}
                        onChange={() => togglePerm(p.key)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-gray-700 group-hover:text-gray-900">{p.label}</span>
                        <span className="text-xs text-gray-400 ml-1.5">{p.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Legacy permissions */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Quyền API truyền thống</label>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                  {LEGACY_PERMISSIONS.map((p) => (
                    <label key={p.key} className="flex items-start gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={selectedPerms.has(p.key)}
                        onChange={() => {
                          setSelectedPerms(prev => {
                            const next = new Set(prev);
                            if (next.has(p.key)) next.delete(p.key); else next.add(p.key);
                            return next;
                          });
                        }}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-gray-700 group-hover:text-gray-900">{p.label}</span>
                        <span className="text-xs text-gray-400 ml-1.5">{p.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            {newKey ? (
              <Button onClick={closeCreateDialog}>Đóng</Button>
            ) : (
              <>
                <Button variant="outline" onClick={closeCreateDialog}>Hủy</Button>
                <Button onClick={handleCreate} disabled={creating || !name.trim()}>{creating ? 'Đang tạo...' : 'Tạo'}</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
