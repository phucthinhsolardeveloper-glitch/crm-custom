import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { API_KEY_AUTH } from '../decorators/api-key-auth.decorator';

/** Guard that validates x-api-key header against hashed keys in DB. */
@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Only activate on endpoints decorated with @ApiKeyAuth()
    const metadata = this.reflector.getAllAndOverride<boolean | string>(API_KEY_AUTH, [
      context.getHandler(), context.getClass(),
    ]);
    if (!metadata) return true;

    const request = context.switchToHttp().getRequest();
    const rawKey = request.headers['x-api-key'];

    if (!rawKey) {
      throw new UnauthorizedException('API key bắt buộc (header x-api-key)');
    }

    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await this.prisma.apiKey.findFirst({
      where: { keyHash, isActive: true },
    });

    if (!apiKey) {
      throw new UnauthorizedException('API key không hợp lệ hoặc đã bị vô hiệu');
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new UnauthorizedException('API key đã hết hạn');
    }

    // Check permission scope if a specific scope is required
    const requiredScope = typeof metadata === 'string' ? metadata : null;
    if (requiredScope) {
      const permissions = (apiKey.permissions as string[]) || [];
      if (!permissions.includes(requiredScope) && !permissions.includes('*')) {
        throw new ForbiddenException(`API key thiếu quyền: ${requiredScope}`);
      }
    }

    // Attach API key to request for downstream use
    request.apiKey = apiKey;

    // Update lastUsedAt (fire-and-forget)
    this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    }).catch(() => {});

    return true;
  }
}
