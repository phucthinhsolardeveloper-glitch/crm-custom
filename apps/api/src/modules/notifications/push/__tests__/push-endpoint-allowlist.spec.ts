import { describe, it, expect } from 'vitest';
import { isAllowedPushEndpoint } from '../push-subscriptions.service';

// Validate chống SSRF: chỉ chấp nhận https + host của nhà cung cấp push hợp lệ.
describe('isAllowedPushEndpoint', () => {
  it('chấp nhận endpoint của các nhà cung cấp push chuẩn (https)', () => {
    const valid = [
      'https://fcm.googleapis.com/fcm/send/abc123',
      'https://updates.push.services.mozilla.com/wpush/v2/xyz',
      'https://db5p.notify.windows.com/w/?token=abc',
      'https://web.push.apple.com/QABC123',
    ];
    for (const e of valid) expect(isAllowedPushEndpoint(e)).toBe(true);
  });

  it('từ chối scheme không phải https', () => {
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
  });

  it('từ chối host nội bộ / không thuộc allowlist (chống SSRF)', () => {
    const bad = [
      'https://localhost:3010/api/v1/users',
      'https://127.0.0.1/admin',
      'https://169.254.169.254/latest/meta-data', // metadata endpoint
      'https://evil.com/collect',
      'https://fcm.googleapis.com.evil.com/send', // suffix giả mạo
    ];
    for (const e of bad) expect(isAllowedPushEndpoint(e)).toBe(false);
  });

  it('từ chối chuỗi không phải URL hợp lệ', () => {
    expect(isAllowedPushEndpoint('not-a-url')).toBe(false);
    expect(isAllowedPushEndpoint('')).toBe(false);
  });
});
