import { Injectable, Logger } from '@nestjs/common';
import { LarkTokenService } from './lark-token.service';
import { LARK_API_BASE, LARK_TOKEN_EXPIRED_CODES } from './lark-sync.constants';

/** Response envelope of Bitable create-record endpoint. */
interface LarkCreateRecordResponse {
  code: number;
  msg: string;
  data?: { record?: { record_id?: string } };
}

/**
 * Thin HTTP client for Lark Bitable record APIs.
 *
 * Multi-base: baseToken is passed per call (mapping.baseToken ?? env default),
 * the tenant token is shared across bases of the same tenant.
 *
 * Caller is the BullMQ processor - this class throws on errors so the queue
 * retries with exponential backoff. Token-expired errors drop the cached
 * token first so the retry fetches a fresh one.
 */
@Injectable()
export class LarkBaseClient {
  private readonly logger = new Logger(LarkBaseClient.name);

  constructor(private readonly tokenService: LarkTokenService) {}

  /**
   * Create one record in a Bitable table.
   * @returns recordId assigned by Lark.
   */
  async createRecord(
    baseToken: string,
    tableId: string,
    fields: Record<string, unknown>,
  ): Promise<{ recordId: string }> {
    const token = await this.tokenService.getToken();
    const url = `${LARK_API_BASE}/bitable/v1/apps/${baseToken}/tables/${tableId}/records`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) {
      // 401 also signals stale token - drop cache so retry re-authenticates
      if (res.status === 401) {
        await this.tokenService.invalidateToken();
      }
      throw new Error(`Lark create-record HTTP ${res.status} (table ${tableId})`);
    }

    const data = (await res.json()) as LarkCreateRecordResponse;
    if (data.code !== 0) {
      if (LARK_TOKEN_EXPIRED_CODES.includes(data.code)) {
        await this.tokenService.invalidateToken();
      }
      throw new Error(
        `Lark create-record error: ${data.msg || 'unknown'} (code ${data.code}, table ${tableId})`,
      );
    }

    const recordId = data.data?.record?.record_id;
    if (!recordId) {
      throw new Error(`Lark create-record returned no record_id (table ${tableId})`);
    }
    return { recordId };
  }

  /**
   * Update one existing record in a Bitable table (PUT).
   * Dung khi payment doi trang thai sau khi da tao record Lark.
   */
  async updateRecord(
    baseToken: string,
    tableId: string,
    recordId: string,
    fields: Record<string, unknown>,
  ): Promise<void> {
    const token = await this.tokenService.getToken();
    const url = `${LARK_API_BASE}/bitable/v1/apps/${baseToken}/tables/${tableId}/records/${recordId}`;

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) {
      if (res.status === 401) {
        await this.tokenService.invalidateToken();
      }
      throw new Error(`Lark update-record HTTP ${res.status} (table ${tableId}, record ${recordId})`);
    }

    const data = (await res.json()) as LarkCreateRecordResponse;
    if (data.code !== 0) {
      if (LARK_TOKEN_EXPIRED_CODES.includes(data.code)) {
        await this.tokenService.invalidateToken();
      }
      throw new Error(
        `Lark update-record error: ${data.msg || 'unknown'} (code ${data.code}, record ${recordId})`,
      );
    }
  }
}
