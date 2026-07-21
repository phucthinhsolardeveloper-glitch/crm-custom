import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { FileUploadService } from '../file-upload.service';

const UUID = '0f8fad5b-d9cb-469f-a165-70867728950e';

function makeService() {
  const config = { get: (_k: string, fallback?: string) => fallback ?? './uploads' };
  return new FileUploadService(config as never);
}

describe('FileUploadService.getSecurePath - safe path whitelist', () => {
  const service = makeService();

  it('path phang 3 segment (avatars) -> hop le', () => {
    expect(() => service.getSecurePath(`avatars/2026-06/${UUID}.jpg`)).not.toThrow();
  });

  it('path nested 4 segment (lead-documents/{leadId}) -> hop le', () => {
    expect(() => service.getSecurePath(`lead-documents/123/2026-06/${UUID}.pdf`)).not.toThrow();
  });

  it('path nested 5 segment (avatars/customer con) -> hop le', () => {
    expect(() => service.getSecurePath(`attachments/leads/123/2026-06/${UUID}.png`)).not.toThrow();
  });

  it('path traversal .. trong segment -> 403', () => {
    expect(() => service.getSecurePath(`lead-documents/../2026-06/${UUID}.pdf`)).toThrow(ForbiddenException);
    expect(() => service.getSecurePath(`../uploads/2026-06/${UUID}.pdf`)).toThrow(ForbiddenException);
    expect(() => service.getSecurePath(`lead-documents/123/../../etc/passwd`)).toThrow(ForbiddenException);
  });

  it('thieu thu muc YYYY-MM -> 403', () => {
    expect(() => service.getSecurePath(`avatars/${UUID}.jpg`)).toThrow(ForbiddenException);
  });

  it('ten file khong phai uuid -> 403', () => {
    expect(() => service.getSecurePath('avatars/2026-06/evil.php')).toThrow(ForbiddenException);
  });

  it('absolute path -> 403', () => {
    expect(() => service.getSecurePath(`/etc/passwd`)).toThrow(ForbiddenException);
    expect(() => service.getSecurePath(`C:/windows/system32/${UUID}.dll`)).toThrow(ForbiddenException);
  });
});
