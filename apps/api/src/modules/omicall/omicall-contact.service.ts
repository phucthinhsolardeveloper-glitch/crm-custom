import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Shape of OmiCall response envelope (verified against staging stg instance).
 *
 * status_code 9999 = success, -9999 = business error (e.g. phone duplicate).
 * Network/HTTP errors throw before this layer.
 */
interface OmicallEnvelope<T> {
  status_code: number;
  message?: string;
  payload: T;
}

interface OmicallSearchItem {
  id: string;
  ref_id: string;
  user_owner_id?: string;
  attribute_structure?: Array<{
    field_code: string;
    value?: Array<{ display_value: string; data_type?: string }>;
  }>;
}

interface OmicallSearchPayload {
  items: OmicallSearchItem[];
  total_items: number;
}

/**
 * Minimal contact shape returned by searchByPhone, decoupled from OmiCall internals.
 * Consumers only need refId (to call /update) and the current owner (to decide skip).
 */
export interface OmicallContactRef {
  id: string;
  refId: string;
  currentOwnerId?: string;
}

export interface OmicallCreateContactInput {
  refId: string;
  fullName: string;
  phone: string;
  userOwnerEmail: string;
  note?: string;
}

/**
 * HTTP client wrapper for OmiCall Contact API (group "khach-hang").
 *
 * Auth header: x-api-key (verified against staging; doc says Bearer but is wrong).
 * Base URL + key come from env: OMICALL_API_URL, OMICALL_API_KEY.
 *
 * Caller is the BullMQ processor - this class throws on non-9999 status_code
 * so the queue can retry with exponential backoff.
 */
@Injectable()
export class OmicallContactService implements OnModuleInit {
  private readonly logger = new Logger(OmicallContactService.name);
  private baseUrl = '';
  private apiKey = '';
  private enabled = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.baseUrl = (this.config.get<string>('OMICALL_API_URL') || '').replace(/\/$/, '');
    this.apiKey = this.config.get<string>('OMICALL_API_KEY') || '';
    this.enabled = Boolean(this.baseUrl && this.apiKey);
    this.logger.log(`[init] baseUrl='${this.baseUrl}' apiKeyLen=${this.apiKey.length} enabled=${this.enabled}`);
    if (!this.enabled) {
      this.logger.warn('OmiCall integration disabled: missing OMICALL_API_URL or OMICALL_API_KEY');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Lookup an OmiCall contact by phone number (already normalized by caller).
   * Returns the first match (OmiCall enforces phone uniqueness so >1 is unexpected).
   */
  async searchByPhone(phone: string): Promise<OmicallContactRef | null> {
    const env = await this.post<OmicallSearchPayload>('/api/v2/contact/search', { keyword: phone });
    if (!env.payload?.items?.length) return null;
    const item = env.payload.items[0];
    return { id: item.id, refId: item.ref_id, currentOwnerId: item.user_owner_id };
  }

  /**
   * Create a new contact. Will fail with `phone_or_email_assigned_on_other_contact`
   * if the phone already exists - caller MUST search first.
   */
  async addContact(input: OmicallCreateContactInput): Promise<void> {
    await this.post('/api/v2/contact/add', {
      refId: input.refId,
      fullName: input.fullName,
      phones: [{ data: input.phone, type: 'personal', valueType: 'Ca nhan' }],
      userOwnerEmail: input.userOwnerEmail,
      ...(input.note ? { note: input.note } : {}),
    });
  }

  /**
   * Update owner of an existing contact identified by refId (or _id).
   * Only sends userOwnerEmail - other fields are preserved on OmiCall side.
   */
  async updateOwner(refId: string, userOwnerEmail: string): Promise<void> {
    await this.post('/api/v2/contact/update', { refId, userOwnerEmail });
  }

  /** Low-level POST wrapper with auth + envelope validation. */
  private async post<T>(path: string, body: unknown): Promise<OmicallEnvelope<T>> {
    if (!this.enabled) {
      throw new Error('OmiCall integration disabled (missing env)');
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`OmiCall ${path} HTTP ${res.status}`);
    }
    const env = (await res.json()) as OmicallEnvelope<T>;
    if (env.status_code !== 9999) {
      throw new Error(`OmiCall ${path} business error: ${env.message || 'unknown'} (code ${env.status_code})`);
    }
    return env;
  }
}
