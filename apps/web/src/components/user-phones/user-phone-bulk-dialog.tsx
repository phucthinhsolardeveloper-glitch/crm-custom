'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { userPhonesApi } from '@/lib/api/user-phones';
import type { UserRecord, BulkUserPhoneResponse } from '@/types/entities';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: UserRecord[];
}

interface ParsedRow {
  raw: string;
  phone: string;
  email: string;
  userId?: string;
  error?: string;
}

const MAX_ROWS = 500;

function parseRows(text: string, users: UserRecord[]): ParsedRow[] {
  const userMap = new Map(users.map((u) => [u.email.toLowerCase(), String(u.id)]));
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((raw) => {
      const parts = raw.split(/[,;\t]/).map((s) => s.trim());
      const [phone, email] = parts;
      if (!phone || !email) {
        return { raw, phone: phone ?? '', email: email ?? '', error: 'Thiếu phone hoặc email' };
      }
      const userId = userMap.get(email.toLowerCase());
      if (!userId) {
        return { raw, phone, email, error: 'Email không tồn tại' };
      }
      return { raw, phone, email, userId };
    });
}

export function UserPhoneBulkDialog({ open, onOpenChange, users }: Props) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkUserPhoneResponse | null>(null);

  const parsed = parseRows(text, users);
  const validRows = parsed.filter((r) => r.userId && !r.error);
  const invalidRows = parsed.filter((r) => r.error);
  const tooMany = parsed.length > MAX_ROWS;

  async function submit() {
    if (validRows.length === 0 || tooMany) return;
    setSubmitting(true);
    try {
      const res = await userPhonesApi.bulkCreate({
        items: validRows.map((r) => ({ phone: r.phone, userId: r.userId! })),
      });
      setResult(res.data);
      toast.success(`Đã xử lý ${validRows.length} dòng`);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Có lỗi xảy ra';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setText('');
    setResult(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); else onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nhập SĐT hàng loạt</DialogTitle>
          <DialogDescription>
            Mỗi dòng 1 mapping <code className="text-xs">phone,email</code>. Tối đa {MAX_ROWS} dòng/lần.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-2 text-sm">
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex justify-between"><span>Đã tạo</span><span className="font-medium text-emerald-600">{result.created.length}</span></div>
              <div className="flex justify-between"><span>Bỏ qua (đã tồn tại)</span><span className="font-medium text-amber-600">{result.skipped.length}</span></div>
              <div className="flex justify-between"><span>Lỗi</span><span className="font-medium text-red-600">{result.failed.length}</span></div>
            </div>
            {result.failed.length > 0 && (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-red-100 bg-red-50 p-2 text-xs">
                {result.failed.map((f, i) => (
                  <div key={i}>{f.phone} - {f.reason}</div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label htmlFor="bulk">Danh sách (phone,email mỗi dòng)</Label>
              <Textarea
                id="bulk"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                placeholder={'0901234567,nguyen@example.com\n0907654321,tran@example.com'}
                className="font-mono text-xs"
              />
            </div>
            {parsed.length > 0 && (
              <div className="text-xs text-slate-500">
                Hợp lệ: <span className="font-medium text-emerald-600">{validRows.length}</span>
                {' / '}
                Lỗi: <span className="font-medium text-red-600">{invalidRows.length}</span>
                {tooMany && <span className="ml-2 text-red-600">Quá {MAX_ROWS} dòng - vui lòng chia nhỏ</span>}
              </div>
            )}
            {invalidRows.length > 0 && (
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-amber-100 bg-amber-50 p-2 text-xs">
                {invalidRows.slice(0, 10).map((r, i) => (
                  <div key={i}>{r.raw} - {r.error}</div>
                ))}
                {invalidRows.length > 10 && <div className="italic">...và {invalidRows.length - 10} lỗi khác</div>}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={reset}>Đóng</Button>
          ) : (
            <>
              <Button variant="outline" onClick={reset} disabled={submitting}>Hủy</Button>
              <Button onClick={submit} disabled={submitting || validRows.length === 0 || tooMany}>
                {submitting ? 'Đang xử lý...' : `Tạo ${validRows.length} SĐT`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
