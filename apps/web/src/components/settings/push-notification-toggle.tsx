'use client';

import { useEffect, useState } from 'react';
import { BellRing, BellOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  isPushSupported,
  getPermissionState,
  getCurrentSubscription,
  enablePush,
  disablePush,
} from '@/lib/push-notifications';

type State = 'loading' | 'unsupported' | 'denied' | 'off' | 'on';

export function PushNotificationToggle() {
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);

  // Xác định trạng thái ban đầu khi mount
  useEffect(() => {
    (async () => {
      if (!isPushSupported()) return setState('unsupported');
      if (getPermissionState() === 'denied') return setState('denied');
      const sub = await getCurrentSubscription();
      setState(sub ? 'on' : 'off');
    })();
  }, []);

  async function handleEnable() {
    setBusy(true);
    try {
      await enablePush();
      setState('on');
      toast.success('Đã bật thông báo đẩy trên thiết bị này');
    } catch (err) {
      // User từ chối quyền -> trình duyệt chuyển sang denied
      if (getPermissionState() === 'denied') setState('denied');
      toast.error(err instanceof Error ? err.message : 'Không bật được thông báo');
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    try {
      await disablePush();
      setState('off');
      toast.success('Đã tắt thông báo đẩy trên thiết bị này');
    } catch {
      toast.error('Không tắt được thông báo');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Thông báo đẩy</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-500">
          Nhận thông báo ngay cả khi không mở web - trên máy tính và điện thoại. Bật riêng cho từng thiết bị bạn đang dùng.
        </p>

        {state === 'loading' && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 size={16} className="animate-spin" /> Đang kiểm tra...
          </div>
        )}

        {state === 'unsupported' && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
            Trình duyệt này không hỗ trợ thông báo đẩy. Trên iPhone, hãy &quot;Thêm vào màn hình chính&quot; rồi mở lại từ icon.
          </p>
        )}

        {state === 'denied' && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Bạn đã chặn quyền thông báo. Mở cài đặt trình duyệt cho trang này, đổi quyền Thông báo thành &quot;Cho phép&quot;, rồi tải lại trang.
          </p>
        )}

        {state === 'off' && (
          <Button onClick={handleEnable} disabled={busy} className="h-11 min-w-44">
            {busy ? <Loader2 size={16} className="mr-2 animate-spin" /> : <BellRing size={16} className="mr-2" />}
            {busy ? 'Đang bật...' : 'Bật thông báo đẩy'}
          </Button>
        )}

        {state === 'on' && (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
              <BellRing size={14} /> Đang bật trên thiết bị này
            </span>
            <Button onClick={handleDisable} disabled={busy} variant="outline" className="h-11">
              {busy ? <Loader2 size={16} className="mr-2 animate-spin" /> : <BellOff size={16} className="mr-2" />}
              Tắt
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
