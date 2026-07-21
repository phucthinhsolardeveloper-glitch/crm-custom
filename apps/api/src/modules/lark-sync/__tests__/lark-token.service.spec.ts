import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LarkTokenService } from '../lark-token.service';
import { LARK_TOKEN_CACHE_KEY } from '../lark-sync.constants';

function makeService(env: Record<string, string>) {
  const config = { get: (key: string) => env[key] };
  const cache = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
  };
  const service = new LarkTokenService(config as never, cache as never);
  service.onModuleInit();
  return { service, cache };
}

describe('LarkTokenService', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('isEnabled = false khi thieu env -> getToken throw, khong goi fetch', async () => {
    const { service } = makeService({});
    expect(service.isEnabled()).toBe(false);
    await expect(service.getToken()).rejects.toThrow('disabled');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cache hit -> tra token cache, khong goi auth API', async () => {
    const { service, cache } = makeService({ LARK_APP_ID: 'cli_x', LARK_APP_SECRET: 's' });
    cache.get.mockResolvedValue('cached-token');

    expect(await service.getToken()).toBe('cached-token');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cache miss -> fetch token moi, cache TTL = expire - 300', async () => {
    const { service, cache } = makeService({ LARK_APP_ID: 'cli_x', LARK_APP_SECRET: 's' });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ code: 0, msg: 'ok', tenant_access_token: 'fresh-token', expire: 7200 }),
    });

    expect(await service.getToken()).toBe('fresh-token');
    expect(cache.set).toHaveBeenCalledWith(LARK_TOKEN_CACHE_KEY, 'fresh-token', 6900);
  });

  it('auth tra code != 0 -> throw kem msg', async () => {
    const { service } = makeService({ LARK_APP_ID: 'cli_x', LARK_APP_SECRET: 's' });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ code: 10003, msg: 'invalid app_secret' }),
    });

    await expect(service.getToken()).rejects.toThrow('invalid app_secret');
  });

  it('invalidateToken xoa cache key', async () => {
    const { service, cache } = makeService({ LARK_APP_ID: 'cli_x', LARK_APP_SECRET: 's' });
    await service.invalidateToken();
    expect(cache.del).toHaveBeenCalledWith(LARK_TOKEN_CACHE_KEY);
  });

  it('getDefaultBaseToken doc tu env', () => {
    const { service } = makeService({
      LARK_APP_ID: 'cli_x',
      LARK_APP_SECRET: 's',
      LARK_BASE_TOKEN: 'base123',
    });
    expect(service.getDefaultBaseToken()).toBe('base123');
  });
});
