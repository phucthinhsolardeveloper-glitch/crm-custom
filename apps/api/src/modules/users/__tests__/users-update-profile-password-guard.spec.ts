import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';

const bcryptMock = vi.hoisted(() => ({
  compare: vi.fn(),
  hash: vi.fn(),
}));
vi.mock('bcrypt', () => ({ ...bcryptMock, default: bcryptMock }));

import { UsersService } from '../users.service';

/**
 * Test guard đổi password self-service: bắt buộc currentPassword đúng
 * mới được set passwordHash mới (chống account takeover khi mất phiên).
 */
function makeService() {
  const repo = {
    findById: vi.fn().mockResolvedValue({ id: 1n, role: 'USER' }),
    update: vi.fn().mockResolvedValue({ id: 1n, name: 'A' }),
  };
  const prisma = {
    user: {
      findFirst: vi.fn().mockResolvedValue({ passwordHash: '$2b$12$currenthash' }),
    },
  };
  const authService = { revokeAllUserTokens: vi.fn() };
  const cacheService = { del: vi.fn() };
  // Constructor: (repo, prisma, authService, dashboardService, cacheService).
  // dashboardService không dùng trong updateProfile -> undefined đủ.
  const service = new UsersService(
    repo as never, prisma as never, authService as never,
    undefined as never, cacheService as never,
  );
  return { service, repo, prisma, authService, cacheService };
}

describe('UsersService.updateProfile - password change guard', () => {
  beforeEach(() => {
    bcryptMock.compare.mockReset();
    bcryptMock.hash.mockReset();
    bcryptMock.hash.mockResolvedValue('$2b$12$newhash');
  });

  it('doi password khong gui currentPassword -> 400', async () => {
    const { service, repo } = makeService();
    await expect(
      service.updateProfile(1n, { password: 'newpass123' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('currentPassword sai -> 400 (khong dung 401 vi api-client redirect /login), khong revoke token', async () => {
    bcryptMock.compare.mockResolvedValue(false);
    const { service, repo, authService } = makeService();
    await expect(
      service.updateProfile(1n, { password: 'newpass123', currentPassword: 'WRONG' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.update).not.toHaveBeenCalled();
    expect(authService.revokeAllUserTokens).not.toHaveBeenCalled();
  });

  it('currentPassword dung -> doi password + revoke moi refresh token', async () => {
    bcryptMock.compare.mockResolvedValue(true);
    const { service, repo, authService } = makeService();
    await service.updateProfile(1n, { password: 'newpass123', currentPassword: 'CORRECT' });

    expect(bcryptMock.compare).toHaveBeenCalledWith('CORRECT', '$2b$12$currenthash');
    expect(repo.update).toHaveBeenCalledWith(1n, expect.objectContaining({ passwordHash: '$2b$12$newhash' }));
    expect(authService.revokeAllUserTokens).toHaveBeenCalledWith(1n);
  });

  it('update name/phone khong doi password -> khong can currentPassword', async () => {
    const { service, repo, authService } = makeService();
    await service.updateProfile(1n, { name: 'Ten Moi', phone: '0900000000' });
    expect(repo.update).toHaveBeenCalled();
    expect(authService.revokeAllUserTokens).not.toHaveBeenCalled();
  });
});
