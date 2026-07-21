/**
 * Helper Web Push phía client: đăng ký service worker, xin quyền, subscribe/unsubscribe.
 * Mọi lệnh gọi API đi qua proxy `/api/proxy` (xem api-client).
 */
import { api } from './api-client';

/** Trình duyệt có hỗ trợ Web Push không (Push API + Service Worker + Notification). */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Trạng thái quyền hiện tại: 'default' | 'granted' | 'denied'. */
export function getPermissionState(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

/** Đổi VAPID public key (base64url) sang Uint8Array cho pushManager.subscribe. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  // ArrayBuffer tường minh -> kiểu Uint8Array<ArrayBuffer> khớp BufferSource (không phải SharedArrayBuffer).
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/** Đăng ký service worker (idempotent - gọi lại trả về registration cũ). */
async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/sw.js');
  if (existing) return existing;
  return navigator.serviceWorker.register('/sw.js');
}

/** Lấy subscription hiện tại của thiết bị (null nếu chưa bật). */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

/**
 * Bật push: đăng ký SW -> xin quyền -> lấy VAPID key -> subscribe -> gửi lên server.
 * Ném lỗi khi: không hỗ trợ, user từ chối quyền, hoặc server chưa cấu hình VAPID.
 */
export async function enablePush(): Promise<void> {
  if (!isPushSupported()) throw new Error('Trình duyệt không hỗ trợ thông báo đẩy');

  const registration = await registerServiceWorker();

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Bạn chưa cho phép nhận thông báo');
  }

  const res = await api.get<{ data: { publicKey: string | null } }>(
    '/notifications/push/vapid-public-key',
  );
  const publicKey = res.data.publicKey;
  if (!publicKey) throw new Error('Máy chủ chưa cấu hình thông báo đẩy');

  // Tái dùng subscription cũ nếu có, nếu chưa thì tạo mới
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const json = subscription.toJSON();
  await api.post('/notifications/push/subscribe', {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
  });
}

/** Tắt push: huỷ subscription ở trình duyệt + báo server xoá. */
export async function disablePush(): Promise<void> {
  const subscription = await getCurrentSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe().catch(() => {});
  await api.post('/notifications/push/unsubscribe', { endpoint }).catch(() => {});
}
