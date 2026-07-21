import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { Request } from 'express';

/**
 * Guard for MCP endpoints - validates x-api-key header
 * and checks mcp:* permissions on the ApiKey record.
 * Attaches apiKey to request for per-tool permission checks.
 */
@Injectable()
export class McpAgentAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const rawKey = request.headers['x-api-key'] as string | undefined;

    if (!rawKey) {
      throw new UnauthorizedException('API key required (header x-api-key)');
    }

    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await this.prisma.apiKey.findFirst({
      where: { keyHash, isActive: true },
    });

    if (!apiKey) {
      throw new UnauthorizedException('Invalid or deactivated API key');
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new UnauthorizedException('API key expired');
    }

    // Check for any mcp:* permission
    const hasMcpPermission = apiKey.permissions.some(
      (p: string) => p === 'mcp:*' || p.startsWith('mcp:'),
    );
    if (!hasMcpPermission) {
      throw new ForbiddenException('API key lacks MCP permissions');
    }

    // Attach apiKey to request for per-tool permission checks
    (request as any).mcpApiKey = apiKey;

    // Update lastUsedAt (fire-and-forget)
    this.prisma.apiKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});

    return true;
  }
}

/** Check if an API key has a specific MCP permission */
export function hasPermission(
  permissions: string[],
  required: string,
): boolean {
  if (permissions.includes('mcp:*')) return true;
  return permissions.includes(required);
}
