/**
 * Type declarations cho OmiCall Web SDK v3 globals.
 * Load qua CDN script -> window.OMICallSDK + window.OMICallUI.
 * Docs: https://api.omicall.com/sdk/web-sdk/v3-integration
 */

interface OmiCallRemoteContact {
  name: string;
  avatar?: string;
  gender?: 'male' | 'female' | 'other';
}

interface OmiCallDuration {
  value: number;
  text: string;
}

interface OmiCallData {
  uid: string;
  uuid?: string;
  state: 'connecting' | 'ringing' | 'accepted' | 'ended';
  direction: 'outbound' | 'inbound';
  isVideo: boolean;
  isOutbound: boolean;
  isInternal: boolean;
  isHangup?: boolean;
  sipNumber?: { number: string };
  remoteContact?: OmiCallRemoteContact;
  remoteNumber: string;
  displayNumber: string;
  startTs: number;
  startAt: string;
  held: boolean;
  audio: boolean;
  video: boolean;
  ringingDuration: OmiCallDuration;
  callingDuration: OmiCallDuration;
  userData?: string;
  end: () => void;
  decline: () => void;
  accept: () => void;
  mute: (cb?: () => boolean) => void;
  hold: (cb?: () => boolean) => void;
  dtmf: (tone: string) => void;
  transfer: (target: string) => void;
}

interface OmiCallRegisterData {
  status: 'connecting' | 'connected' | 'disconnect';
  name: string;
}

interface OmiCallRegisterConfig {
  sipRealm: string;
  sipUser: string;
  sipPassword: string;
  isGuest?: boolean;
}

interface OmiCallRegisterResult {
  status: boolean;
  message?: string;
  error?: string;
}

interface OmiCallMakeCallOptions {
  isVideo?: boolean;
  sipNumber?: { number: string };
  remoteContact?: OmiCallRemoteContact;
  userData?: string;
}

interface OmiCallUIConfigs {
  toggleDial?: 'show' | 'hide';
  dialPosition?: 'left' | 'right';
  theme?: Record<string, string>;
  minimizeNewCall?: boolean;
}

interface OmiCallInitConfig {
  lng?: 'vi' | 'en' | 'km';
  ui?: OmiCallUIConfigs;
  ringtoneVolume?: number;
  searchRemoteContact?: (callData: OmiCallData) => Promise<OmiCallRemoteContact | null>;
  validateCallOut?: (
    remoteNumber: string,
    options: OmiCallMakeCallOptions,
  ) => Promise<{ status: boolean; reason?: string }>;
  rootBody?: HTMLElement;
}

type OmiCallEventName =
  | 'register'
  | 'connecting'
  | 'ringing'
  | 'on_ringing'
  | 'accepted'
  | 'on_calling'
  | 'set_sip_number'
  | 'ended';

interface OmiCallSDKType {
  init: (config: OmiCallInitConfig) => Promise<boolean>;
  register: (config: OmiCallRegisterConfig) => Promise<OmiCallRegisterResult>;
  unregister: () => void;
  makeCall: (remoteNumber: string, options?: OmiCallMakeCallOptions) => void;
  remoteCall: (remoteNumber: string, sipNumber?: string) => void;
  on: (event: OmiCallEventName, callback: (data: any) => void) => void;
  off: (event: OmiCallEventName, callback: (data: any) => void) => void;
}

interface OmiCallUIType {
  toggleDial: () => void;
}

// Custom types cho CRM-Custom call UI

interface CallContactInfo {
  type: 'LEAD' | 'CUSTOMER';
  id: string;
  name: string;
  phone?: string;
}

interface CallLeadDetail {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  companyName: string | null;
  status: string;
  source: { id: string; name: string } | null;
  product: { id: string; name: string } | null;
  label: { id: string; name: string; color: string; textColor: string } | null;
  recentNotes: Array<{
    content: string;
    createdAt: string;
    userName: string;
  }>;
}

type CallPhase = 'connecting' | 'ringing' | 'accepted' | 'ended';

interface CallState {
  uid: string;
  callData: OmiCallData;
  phase: CallPhase;
  direction: 'inbound' | 'outbound';
  contactInfo: CallContactInfo | null;
  leadDetail: CallLeadDetail | null;
  isMuted: boolean;
  isOnHold: boolean;
  isMinimized: boolean;
  noteText: string;
}

type OmiCallStatus = 'idle' | 'loading' | 'connecting' | 'connected' | 'disconnected' | 'error';

interface OmiCallContextType {
  status: OmiCallStatus;
  isReady: boolean;
  error: string | null;
  activeCalls: CallState[];
  makeCall: (phone: string, contactName?: string) => void;
  acceptCall: (uid: string) => void;
  endCall: (uid: string) => void;
  declineCall: (uid: string) => void;
  toggleMute: (uid: string) => void;
  toggleHold: (uid: string) => void;
  sendDtmf: (uid: string, tone: string) => void;
  minimizeCall: (uid: string) => void;
  maximizeCall: (uid: string) => void;
  updateNoteText: (uid: string, text: string) => void;
  closeCall: (uid: string) => void;
  flushNote: (uid: string) => void;
  recheckMic: () => void;
}

interface Window {
  OMICallSDK?: OmiCallSDKType;
  OMICallUI?: OmiCallUIType;
}
