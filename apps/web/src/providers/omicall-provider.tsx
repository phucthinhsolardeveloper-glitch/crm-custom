'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { CallOverlay } from '@/components/call/call-overlay';
import { CallMiniBar } from '@/components/call/call-mini-bar';
import { MicDeviceDialog, type MicPromptReason } from '@/components/call/mic-device-dialog';
import { api } from '@/lib/api-client';
import { sipConfigApi } from '@/lib/api/sip-config';

const OmiCallContext = createContext<OmiCallContextType>({
  status: 'idle',
  isReady: false,
  error: null,
  activeCalls: [],
  makeCall: () => {},
  acceptCall: () => {},
  endCall: () => {},
  declineCall: () => {},
  toggleMute: () => {},
  toggleHold: () => {},
  sendDtmf: () => {},
  minimizeCall: () => {},
  maximizeCall: () => {},
  updateNoteText: () => {},
  closeCall: () => {},
  flushNote: () => {},
  recheckMic: () => {},
});

// Khoa sessionStorage ghi nho user da bam "De sau" -> F5 khong hien lai popup
// (chi trong phien tab hien tai). Xoa khi ket noi thanh cong hoac bam "Kiem tra".
const MIC_DISMISS_KEY = 'omicall-mic-dismissed';
// Thoi gian toi thieu spinner "dang kiem tra" quay khi bam Kiem tra ket noi (ms).
const RECHECK_MIN_SPIN_MS = 1600;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SDK_VERSION = process.env.NEXT_PUBLIC_OMICALL_SDK_VERSION || '3.0.42';
const SDK_SRC = `https://cdn.omicrm.com/sdk/web/${SDK_VERSION}/core.min.js`;
const SCRIPT_ID = 'omicall-web-sdk';

function waitForSdk(timeoutMs = 10_000): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.OMICallSDK) return resolve(true);
    const start = Date.now();
    const timer = setInterval(() => {
      if (window.OMICallSDK) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, 200);
  });
}

function hideElement(el: HTMLElement) {
  el.style.cssText = 'display:none!important;visibility:hidden!important;width:0!important;height:0!important;overflow:hidden!important;pointer-events:none!important;position:fixed!important;left:-9999px!important;';
}

/**
 * An toan bo giao dien mac dinh SDK.
 * Snapshot body children truoc khi load SDK, sau do an moi
 * TOP-LEVEL div moi xuat hien (SDK inject) + chan CSS tu omicrm CDN.
 */
function hideSdkUi() {
  const existingChildren = new Set(Array.from(document.body.children));

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of Array.from(m.addedNodes)) {
        // Chan CSS tu CDN omicrm
        if (node instanceof HTMLLinkElement && node.href?.includes('omicrm.com')) {
          node.remove();
          continue;
        }
        // Chan style elements cua SDK (chua "omi-" css vars/classes)
        if (node instanceof HTMLStyleElement && /omi-font|omi-primary|omi-toastify/.test(node.textContent ?? '')) {
          node.remove();
          continue;
        }
        if (!(node instanceof HTMLElement)) continue;
        // Top-level body children: an neu la DIV moi (SDK inject) khong phai script
        if (m.target === document.body && !existingChildren.has(node) && node.tagName === 'DIV') {
          // Cho 1 tick de SDK render noi dung vao, roi check
          setTimeout(() => {
            const inner = node.innerHTML ?? '';
            if (/omi[-_]|omicall|omicrm/.test(inner + (node.className ?? '') + (node.id ?? ''))) {
              hideElement(node);
            }
          }, 100);
        }
      }
    }
  });
  observer.observe(document.head, { childList: true });
  observer.observe(document.body, { childList: true });
  setTimeout(() => observer.disconnect(), 120_000);
}

function loadSdkScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(SCRIPT_ID)) return resolve();
    hideSdkUi();
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SDK_SRC;
    script.async = true;
    script.setAttribute('omi-call-sdk', '');
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Khong tai duoc OmiCall SDK'));
    document.body.appendChild(script);
  });
}

async function fetchContactInfo(phone: string): Promise<CallContactInfo | null> {
  try {
    const res = await api.get<{ data: { type: 'LEAD' | 'CUSTOMER'; id: string; name: string; phone: string } | null }>(
      `/contacts/lookup?phone=${encodeURIComponent(phone)}`,
    );
    return res.data ?? null;
  } catch {
    return null;
  }
}

async function fetchLeadDetail(contact: CallContactInfo): Promise<CallLeadDetail | null> {
  try {
    const endpoint = contact.type === 'LEAD' ? `/leads/${contact.id}` : `/customers/${contact.id}`;
    const res = await api.get<{ data: any }>(endpoint);
    const d = res.data;
    if (!d) return null;

    let recentNotes: CallLeadDetail['recentNotes'] = [];
    try {
      const actEndpoint = contact.type === 'LEAD'
        ? `/leads/${contact.id}/activities`
        : `/customers/${contact.id}/activities`;
      const actRes = await api.get<{ data: any[] }>(actEndpoint);
      recentNotes = (actRes.data ?? [])
        .filter((a: any) => a.type === 'NOTE')
        .slice(0, 3)
        .map((a: any) => ({
          content: a.content ?? '',
          createdAt: a.createdAt ?? '',
          userName: a.user?.name ?? a.createdByName ?? '',
        }));
    } catch { /* notes optional */ }

    return {
      id: d.id,
      name: d.name ?? contact.name,
      phone: d.phone ?? null,
      email: d.email ?? null,
      companyName: d.companyName ?? null,
      status: d.status ?? '',
      source: d.source ?? null,
      product: d.product ?? null,
      label: d.label ?? null,
      recentNotes,
    };
  } catch {
    return null;
  }
}

async function saveCallNote(contact: CallContactInfo, noteText: string): Promise<void> {
  if (!noteText.trim()) return;
  try {
    const endpoint = contact.type === 'LEAD'
      ? `/leads/${contact.id}/activities`
      : `/customers/${contact.id}/activities`;
    await api.post(endpoint, { content: noteText.trim() });
  } catch { /* fire-and-forget */ }
}

// Log call removed (2026-06-04): webhook OmiCall (POST /webhooks/omicall/call) la nguon
// duy nhat tao call_logs. Web SDK chi xu ly UI (popup, ringing, mute, hold, end).

export function OmiCallProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<OmiCallStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [, forceUpdate] = useState(0);
  const callsRef = useRef<Map<string, CallState>>(new Map());
  const initStarted = useRef(false);

  // Trang thai popup thiet bi mic (null = an). Cac ref giup goi lai connect()
  // tu nut "Thu lai" hoac tu dong khi cam/rut tai nghe ma khong reload trang.
  const [micPrompt, setMicPrompt] = useState<MicPromptReason | null>(null);
  const connectRef = useRef<((isRetry?: boolean) => Promise<void>) | null>(null);
  const credsRef = useRef<{ sipRealm: string; sipUser: string; sipPassword: string } | null>(null);
  const sdkInitedRef = useRef(false);   // init() chi chay 1 lan
  const connectingRef = useRef(false);  // chong goi connect() chong cheo
  const awaitingMicRef = useRef(false); // dang cho mic -> cho phep tu dong do thiet bi

  const updateCall = useCallback((uid: string, patch: Partial<CallState>) => {
    const map = callsRef.current;
    const existing = map.get(uid);
    if (existing) {
      map.set(uid, { ...existing, ...patch });
    }
    forceUpdate((n) => n + 1);
  }, []);

  const removeCall = useCallback((uid: string) => {
    callsRef.current.delete(uid);
    forceUpdate((n) => n + 1);
  }, []);

  useEffect(() => {
    if (initStarted.current) return;
    initStarted.current = true;
    let cancelled = false;

    async function setup() {
      // Helpers de tra ve visibility: log moi buoc + toast 10s khi co loi.
      const debug = (label: string, data?: unknown) => {
        if (data !== undefined) console.log(`[OmiCall] ${label}`, data);
        else console.log(`[OmiCall] ${label}`);
      };
      const fail = (msg: string) => {
        if (cancelled) return;
        setStatus('error');
        setError(msg);
        toast.error(msg, { duration: 10_000 });
        console.warn('[OmiCall]', msg);
      };

      debug('1) Fetching SIP credentials');
      let creds;
      try {
        const res = await sipConfigApi.getMyCredentials();
        creds = res.data;
      } catch (e) { creds = null; debug('creds fetch FAILED', e); }
      if (!creds || cancelled) {
        debug(cancelled ? 'cancelled' : 'no SIP config - user chua duoc gan tong dai');
        setStatus('idle');
        return;
      }
      debug('2) creds OK', { sipUser: creds.sipUser, sipRealm: creds.sipRealm });
      credsRef.current = creds; // luu lai de connect() dung lai khi "Thu lai"

      setStatus('loading');
      debug('3) Loading SDK script...');
      try { await loadSdkScript(); } catch (e) {
        debug('loadSdkScript FAILED', e);
        fail('Khong tai duoc OmiCall SDK');
        return;
      }

      const ready = await waitForSdk();
      if (!ready || !window.OMICallSDK || cancelled) {
        if (cancelled) return;
        fail('OmiCall SDK khong kha dung sau khi tai script');
        return;
      }
      debug('4) SDK ready');

      // Kiem tra thiet bi mic. Tra ve:
      // - 'ok':        co mic dung duoc
      // - 'not-found': khong co thiet bi (chua cam tai nghe) -> NotFoundError
      // - 'blocked':   bi chan quyen -> denied / NotAllowedError
      // KHONG dua hoan toan vao permission state: 'granted' khong dam bao co mic
      // that (vd chua cam tai nghe -> getUserMedia van throw NotFoundError).
      const checkMic = async (): Promise<'ok' | 'not-found' | 'blocked'> => {
        try {
          const micPerm = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          if (micPerm.state === 'denied') return 'blocked';
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((t) => t.stop());
          return 'ok';
        } catch (e) {
          const name = (e as DOMException)?.name;
          if (name === 'NotAllowedError' || name === 'SecurityError') return 'blocked';
          return 'not-found'; // NotFoundError / DevicesNotFoundError / OverconstrainedError
        }
      };

      // Gan cac event handler cua SDK - chi chay 1 lan sau khi init() thanh cong.
      const attachEvents = (sdk: OmiCallSDKType) => {
        sdk.on('register', (data: OmiCallRegisterData) => {
          debug('SDK event "register" ->', data.status);
          if (data.status === 'connected') setStatus('connected');
          else if (data.status === 'connecting') setStatus('connecting');
          else if (data.status === 'disconnect') setStatus('disconnected');
        });

        sdk.on('connecting', (data: OmiCallData) => {
          const state: CallState = {
            uid: data.uid,
            callData: data,
            phase: 'connecting',
            direction: data.isOutbound ? 'outbound' : 'inbound',
            contactInfo: null,
            leadDetail: null,
            isMuted: false,
            isOnHold: false,
            isMinimized: false,
            noteText: '',
          };
          callsRef.current.set(data.uid, state);
          forceUpdate((n) => n + 1);
          fetchContactInfo(data.remoteNumber).then((info) => {
            if (info) {
              updateCall(data.uid, { contactInfo: info });
              fetchLeadDetail(info).then((detail) => {
                if (detail) updateCall(data.uid, { leadDetail: detail });
              });
            }
          });
        });

        sdk.on('ringing', (data: OmiCallData) => {
          const existing = callsRef.current.get(data.uid);
          if (existing) {
            updateCall(data.uid, { phase: 'ringing', callData: data });
          } else {
            const state: CallState = {
              uid: data.uid,
              callData: data,
              phase: 'ringing',
              direction: data.isOutbound ? 'outbound' : 'inbound',
              contactInfo: null,
              leadDetail: null,
              isMuted: false,
              isOnHold: false,
              isMinimized: false,
              noteText: '',
            };
            callsRef.current.set(data.uid, state);
            forceUpdate((n) => n + 1);
            fetchContactInfo(data.remoteNumber).then((info) => {
              if (info) {
                updateCall(data.uid, { contactInfo: info });
                fetchLeadDetail(info).then((detail) => {
                  if (detail) updateCall(data.uid, { leadDetail: detail });
                });
              }
            });
          }
        });

        sdk.on('accepted', (data: OmiCallData) => {
          updateCall(data.uid, { phase: 'accepted', callData: data });
        });

        sdk.on('on_calling', (data: OmiCallData) => {
          updateCall(data.uid, { callData: data });
        });

        sdk.on('ended', (data: OmiCallData) => {
          const call = callsRef.current.get(data.uid);
          if (call) {
            updateCall(data.uid, { phase: 'ended', callData: data });
            // SDT la (khong contact) hoac dang thu nho -> khong co UI ghi chu,
            // luu note neu co roi dong nhanh sau 3s nhu cu.
            // Co contact + dang mo -> CallEnded component lo countdown 30s + luu + dong.
            if (!call.contactInfo || call.isMinimized) {
              if (call.contactInfo && call.noteText.trim()) {
                saveCallNote(call.contactInfo, call.noteText);
              }
              setTimeout(() => removeCall(data.uid), 3000);
            }
          }
          // KHONG goi logCall - webhook OmiCall la nguon duy nhat tao call_logs row.
        });
      };

      // Kiem tra mic -> init (1 lan) -> dang nhap tong dai. Tach rieng de goi lai
      // duoc tu nut "Thu lai" trong popup hoac tu dong khi cam tai nghe.
      const connect = async (isRetry = false) => {
        if (cancelled || connectingRef.current) return;
        connectingRef.current = true;
        try {
          if (isRetry) setMicPrompt('retrying');
          const creds = credsRef.current;
          const sdk = window.OMICallSDK;
          if (!creds || !sdk) {
            if (!sdk) fail('OmiCall SDK khong kha dung');
            return;
          }

          debug('5) checking mic device...');
          // Khi bam "Kiem tra ket noi" (isRetry): cho spinner quay it nhat
          // RECHECK_MIN_SPIN_MS de user thay app dang lam viec, roi moi bao ket qua.
          const mic = isRetry
            ? (await Promise.all([checkMic(), delay(RECHECK_MIN_SPIN_MS)]))[0]
            : await checkMic();
          if (cancelled) return;
          if (mic !== 'ok') {
            awaitingMicRef.current = true; // bat che do tu dong do khi cam tai nghe
            setStatus('error');
            // Da bam "De sau" truoc do -> KHONG hien popup khi tu dong chay lai
            // (F5 / devicechange). Nhung neu user chu dong bam Kiem tra (isRetry)
            // thi van hien ket qua + thong bao ro la VAN chua ket noi duoc.
            let dismissed = false;
            try { dismissed = sessionStorage.getItem(MIC_DISMISS_KEY) === '1'; } catch { /* noop */ }
            setMicPrompt(dismissed && !isRetry ? null : mic);
            if (isRetry) {
              toast.error(
                mic === 'blocked'
                  ? 'Micro vẫn đang bị chặn. Hãy cấp quyền micro trong trình duyệt rồi thử lại.'
                  : 'Vẫn chưa kết nối được mic. Hãy cắm tai nghe/micro vào máy rồi thử lại.',
                { duration: 6_000 },
              );
            }
            debug('mic check FAILED ->', mic);
            return;
          }
          awaitingMicRef.current = false;
          try { sessionStorage.removeItem(MIC_DISMISS_KEY); } catch { /* noop */ }
          setMicPrompt(null);
          if (isRetry) toast.success('Đã nhận micro, đang kết nối tổng đài...');
          debug('6) mic device OK');

          if (!sdkInitedRef.current) {
            setStatus('loading');
            debug('7) Calling sdk.init()...');
            let initOk = false;
            try {
              initOk = await sdk.init({
                lng: 'vi',
                ui: { toggleDial: 'hide', minimizeNewCall: true },
                searchRemoteContact: async (callData) => {
                  const info = await fetchContactInfo(callData.remoteNumber);
                  if (info) {
                    const call = callsRef.current.get(callData.uid);
                    if (call) {
                      call.contactInfo = info;
                      fetchLeadDetail(info).then((detail) => {
                        if (detail) updateCall(callData.uid, { leadDetail: detail });
                      });
                    }
                    return { name: `${info.name} - ${info.type === 'LEAD' ? 'Lead' : 'Khach hang'}` };
                  }
                  return null;
                },
              });
            } catch (e) {
              debug('sdk.init() THREW', e);
              fail('Khoi tao OmiCall that bai');
              return;
            }
            if (!initOk) {
              fail('Khoi tao OmiCall that bai (init tra ve false)');
              return;
            }
            sdkInitedRef.current = true;
            attachEvents(sdk);
            debug('8) sdk.init() OK');
          }

          setStatus('connecting');
          debug('9) Calling sdk.register()...');
          try {
            const result = await sdk.register({
              sipRealm: creds.sipRealm,
              sipUser: creds.sipUser,
              sipPassword: creds.sipPassword,
            });
            debug('sdk.register() result', result);
            if (!result.status && !cancelled) {
              fail(result.error || result.message || 'Dang nhap tong dai that bai');
            }
          } catch (e) {
            debug('sdk.register() THREW', e);
            fail('Dang nhap tong dai that bai');
          }
        } finally {
          connectingRef.current = false;
        }
      };

      connectRef.current = connect;
      await connect(false);
    }

    setup();

    // Tu dong ket noi lai khi co thay doi thiet bi audio (cam/rut tai nghe),
    // nhung CHI khi dang cho mic (awaitingMicRef) de tranh re-register luc tong
    // dai dang khoe. Nho do ban cam tai nghe la ket noi lai ngay, khong reload.
    const onDeviceChange = () => {
      if (awaitingMicRef.current) connectRef.current?.(false);
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);

    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
      try { window.OMICallSDK?.unregister(); } catch { /* noop */ }
    };
  }, [updateCall, removeCall]);

  // Warn user before closing tab during active call
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const hasActive = Array.from(callsRef.current.values()).some(
        (c) => c.phase === 'accepted' || c.phase === 'ringing' || c.phase === 'connecting',
      );
      if (hasActive) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Bam vao chip "Chua ket noi mic" -> mo lai popup va kiem tra lai ket noi.
  const recheckMic = useCallback(() => {
    try { sessionStorage.removeItem(MIC_DISMISS_KEY); } catch { /* noop */ }
    connectRef.current?.(true);
  }, []);

  const makeCall = useCallback((phone: string, contactName?: string) => {
    if (!window.OMICallSDK || status !== 'connected') {
      toast.error('Tong dai chua ket noi');
      return;
    }
    window.OMICallSDK.makeCall(phone, contactName ? { remoteContact: { name: contactName } } : undefined);
  }, [status]);

  const acceptCall = useCallback((uid: string) => {
    callsRef.current.get(uid)?.callData.accept();
  }, []);

  const endCall = useCallback((uid: string) => {
    callsRef.current.get(uid)?.callData.end();
  }, []);

  const declineCall = useCallback((uid: string) => {
    callsRef.current.get(uid)?.callData.decline();
  }, []);

  const toggleMute = useCallback((uid: string) => {
    const call = callsRef.current.get(uid);
    if (!call) return;
    call.callData.mute(() => {
      const newVal = !call.isMuted;
      updateCall(uid, { isMuted: newVal });
      return newVal;
    });
  }, [updateCall]);

  const toggleHold = useCallback((uid: string) => {
    const call = callsRef.current.get(uid);
    if (!call) return;
    call.callData.hold(() => {
      const newVal = !call.isOnHold;
      updateCall(uid, { isOnHold: newVal });
      return newVal;
    });
  }, [updateCall]);

  const sendDtmf = useCallback((uid: string, tone: string) => {
    callsRef.current.get(uid)?.callData.dtmf(tone);
  }, []);

  const minimizeCall = useCallback((uid: string) => {
    updateCall(uid, { isMinimized: true });
  }, [updateCall]);

  const maximizeCall = useCallback((uid: string) => {
    updateCall(uid, { isMinimized: false });
  }, [updateCall]);

  const updateNoteText = useCallback((uid: string, text: string) => {
    const call = callsRef.current.get(uid);
    if (call) call.noteText = text;
  }, []);

  // Luu note hien tai cua cuoc goi roi xoa khoi map (dung khi het 30s o man ket thuc).
  const flushNote = useCallback((uid: string) => {
    const call = callsRef.current.get(uid);
    if (call?.contactInfo && call.noteText.trim()) {
      saveCallNote(call.contactInfo, call.noteText);
    }
  }, []);

  const activeCalls = Array.from(callsRef.current.values());

  return (
    <OmiCallContext.Provider value={{
      status, isReady: status === 'connected', error, activeCalls,
      makeCall, acceptCall, endCall, declineCall,
      toggleMute, toggleHold, sendDtmf,
      minimizeCall, maximizeCall, updateNoteText,
      closeCall: removeCall, flushNote, recheckMic,
    }}>
      {children}
      <CallOverlay />
      <CallMiniBar />
      {micPrompt && (
        <MicDeviceDialog
          reason={micPrompt}
          onRetry={() => connectRef.current?.(true)}
          onDismiss={() => {
            try { sessionStorage.setItem(MIC_DISMISS_KEY, '1'); } catch { /* noop */ }
            setMicPrompt(null);
          }}
        />
      )}
      {/* Hidden video elements required by SDK for WebRTC */}
      {activeCalls.map((call) => (
        <div key={call.uid} style={{ display: 'none' }}>
          <video id={`${call.uid}-local`} playsInline autoPlay muted />
          <video id={`${call.uid}-remote`} playsInline autoPlay />
        </div>
      ))}
    </OmiCallContext.Provider>
  );
}

export function useOmiCall() {
  return useContext(OmiCallContext);
}
