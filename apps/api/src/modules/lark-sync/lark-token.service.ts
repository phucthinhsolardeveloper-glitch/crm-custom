import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../../common/cache/cache.service';
import { LARK_AUTH_URL, LARK_TOKEN_CACHE_KEY } from './lark-sync.constants';

/** Response envelope of tenant_access_token/internal endpoint. */
interface LarkTokenResponse {
  code: number;
  msg: string;
  tenant_access_token?: string;
  expire?: number; // seconds, max 7200
}

/**
 * Manages Lark tenant_access_token lifecycle.
 *
 * Token max-age is 2h; we cache in Redis with TTL = expire - 300s so a fresh
 * token is fetched before expiry. One token works for ALL bases of the tenant
 * (the app must be added as collaborator on each base).
 *
 * Disabled at runtime when LARK_APP_ID / LARK_APP_SECRET env vars are missing,
 * letting dev / CI run without Lark credentials.
 */
@Injectable()
export class LarkTokenService implements OnModuleInit {
  private readonly logger = new Logger(LarkTokenService.name);
  private appId = '';
  private appSecret = '';
  private enabled = false;

  constructor(
    private readonly config: ConfigService,
    private readonly cache: CacheService,
  ) {}

  onModuleInit(): void {
    this.appId = this.config.get<string>('LARK_APP_ID') || '';
    this.appSecret = this.config.get<string>('LARK_APP_SECRET') || '';
    this.enabled = Boolean(this.appId && this.appSecret);
    if (!this.enabled) {
      this.logger.warn('Lark sync disabled: missing LARK_APP_ID or LARK_APP_SECRET');
    } else {
      this.logger.log(`Lark sync enabled (appId=${this.appId.slice(0, 8)}...)`);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Default base token when a mapping does not specify its own. */
  getDefaultBaseToken(): string {
    return this.config.get<string>('LARK_BASE_TOKEN') || '';
  }

  /**
   * Get a valid tenant_access_token, from Redis cache or fresh from Lark.
   * Cached with TTL = expire - 300s (refresh 5 min before expiry).
   */
  async getToken(): Promise<string> {
    if (!this.enabled) {
      throw new Error('Lark sync disabled (missing env)');
    }
    const cached = await this.cache.get<string>(LARK_TOKEN_CACHE_KEY);
    if (cached) return cached;

    const { token, expire } = await this.fetchToken();
    const ttl = Math.max(expire - 300, 60);
    await this.cache.set(LARK_TOKEN_CACHE_KEY, token, ttl);
    return token;
  }

  /** Drop cached token (call when Lark reports token expired/invalid). */
  async invalidateToken(): Promise<void> {
    await this.cache.del(LARK_TOKEN_CACHE_KEY);
  }

  private async fetchToken(): Promise<{ token: string; expire: number }> {
    const res = await fetch(LARK_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: this.appId, app_secret: this.appSecret }),
    });
    if (!res.ok) {
      throw new Error(`Lark auth HTTP ${res.status}`);
    }
    const data = (await res.json()) as LarkTokenResponse;
    if (data.code !== 0 || !data.tenant_access_token) {
      // msg only - never log app_secret or token
      throw new Error(`Lark auth error: ${data.msg || 'unknown'} (code ${data.code})`);
    }
    this.logger.log(`Fetched new tenant_access_token (expire=${data.expire}s)`);
    return { token: data.tenant_access_token, expire: data.expire ?? 7200 };
  }
}
