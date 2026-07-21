import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(email: string, password: string, userAgent?: string, ipAddress?: string) {
    // Generic error to prevent user enumeration
    const genericError = 'Email hoặc mật khẩu không đúng';

    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    if (!user) {
      throw new UnauthorizedException(genericError);
    }

    // Check account lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Tài khoản bị khóa tạm thời. Vui lòng thử lại sau.');
    }

    // Check if user is active
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException(genericError);
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      // Increment failed login count
      const newCount = user.failedLoginCount + 1;
      const updateData: Record<string, unknown> = { failedLoginCount: newCount };
      if (newCount >= MAX_FAILED_ATTEMPTS) {
        updateData.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      }
      await this.prisma.user.update({ where: { id: user.id }, data: updateData });
      throw new UnauthorizedException(genericError);
    }

    // Reset failed login count on success
    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    }

    return this.generateTokens(user.id, user.email, user.role, userAgent, ipAddress);
  }

  async refreshTokens(refreshToken: string, userAgent?: string, ipAddress?: string) {
    const tokenHash = this.hashToken(refreshToken);

    const storedToken = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null },
      include: { user: { select: { id: true, email: true, role: true, status: true, deletedAt: true } } },
    });

    if (!storedToken) {
      // Token không còn active - phân biệt race hợp lệ (đa tab / refresh song song)
      // với token bị tái sử dụng, xử lý tương ứng bên dưới.
      const revokedToken = await this.prisma.refreshToken.findFirst({
        where: { tokenHash, revokedAt: { not: null } },
        orderBy: { revokedAt: 'desc' },
        include: { user: { select: { id: true, email: true, role: true, status: true, deletedAt: true } } },
      });
      if (revokedToken) {
        const GRACE_MS = 30_000;
        const revokedAgoMs = Date.now() - (revokedToken.revokedAt as Date).getTime();
        const notExpired = revokedToken.expiresAt > new Date();
        const userActive = revokedToken.user.status === 'ACTIVE' && !revokedToken.user.deletedAt;
        if (revokedAgoMs <= GRACE_MS && notExpired && userActive) {
          return this.generateTokens(
            revokedToken.user.id,
            revokedToken.user.email,
            revokedToken.user.role,
            userAgent,
            ipAddress,
          );
        }
        await this.revokeAllUserTokens(revokedToken.userId);
      }
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }

    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token đã hết hạn');
    }

    if (storedToken.user.status !== 'ACTIVE' || storedToken.user.deletedAt) {
      throw new UnauthorizedException('Tài khoản không hoạt động');
    }

    // Revoke old token (rotation)
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    return this.generateTokens(
      storedToken.user.id,
      storedToken.user.email,
      storedToken.user.role,
      userAgent,
      ipAddress,
    );
  }

  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revoke all refresh tokens for a user (password change, deactivation, role change). */
  async revokeAllUserTokens(userId: bigint) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async generateTokens(
    userId: bigint,
    email: string,
    role: string,
    userAgent?: string,
    ipAddress?: string,
  ) {
    const payload = { sub: userId.toString(), email, role };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow('JWT_SECRET'),
      expiresIn: '1h',
    });

    const refreshToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(refreshToken);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        userAgent,
        ipAddress,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
