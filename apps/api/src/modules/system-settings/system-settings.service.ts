import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/** Well-known setting keys. */
export const SETTING_KEYS = {
  AI_API_KEY: 'ai_api_key',
  AI_MODEL: 'ai_model',
  AI_CALL_ANALYSIS_PROMPT: 'ai_call_analysis_prompt',
  AI_CUSTOMER_ANALYSIS_PROMPT: 'ai_customer_analysis_prompt',
} as const;

// Defense by default: any setting whose key ends with these suffixes is treated as a secret
// and its value is masked when listed via getAll(). New secret settings (e.g. webhook_secret,
// smtp_password) are masked automatically without code changes.
const SECRET_KEY_PATTERN = /(_key|_secret|_password|_token)$/;

@Injectable()
export class SystemSettingsService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Get a setting value by key. Returns null if not found. Returns RAW value - internal use only. */
  async get(key: string): Promise<string | null> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    return row?.value ?? null;
  }

  /** Get all settings as key-value object. Secret values masked to prevent plaintext exposure via API/devtools. */
  async getAll(): Promise<Record<string, string>> {
    const rows = await this.prisma.systemSetting.findMany();
    return Object.fromEntries(
      rows.map(r => [r.key, this.maskIfSecret(r.key, r.value)])
    );
  }

  /** Upsert a setting. */
  async set(key: string, value: string): Promise<void> {
    await this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  /** Mask secret values with bullets + last 4 chars (e.g. `••••a3f2`). Non-secrets and empty values pass through. */
  maskIfSecret(key: string, value: string): string {
    if (!SECRET_KEY_PATTERN.test(key) || !value) return value;
    return value.length <= 4 ? '••••' : `••••${value.slice(-4)}`;
  }
}
