import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { Request, Response } from 'express';
import { AuditLogService } from './audit-log.service';
import { sanitize } from './audit-log.sanitizer';
import { SKIP_METHODS, SKIP_PATH_PREFIXES } from './audit-log.constants';

/**
 * Logs every mutation request (POST/PUT/PATCH/DELETE) to audit_logs.
 *
 * Fire-and-forget: writes are scheduled via `setImmediate` so the response
 * never waits on the audit insert. A failure inside the interceptor is logged
 * but never thrown - auditing must not break the API.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(private readonly auditLogService: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: { id: bigint; role?: string } }>();

    if (this.shouldSkip(req)) return next.handle();

    const startedAt = Date.now();
    const action = this.inferAction(req.method, req.path ?? req.url);
    const baseMetadata = this.captureRequestMetadata(req);

    return next.handle().pipe(
      tap((body) => {
        const res = http.getResponse<Response>();
        this.enqueue(req, action, res.statusCode, baseMetadata, startedAt, body);
      }),
      catchError((err) => {
        const status = (err && typeof err === 'object' && 'status' in err && typeof (err as { status: unknown }).status === 'number')
          ? (err as { status: number }).status
          : 500;
        this.enqueue(req, action, status, baseMetadata, startedAt, undefined, err);
        return throwError(() => err);
      }),
    );
  }

  /** Detect webhook path - audit fires nhưng body bị redact ở captureRequestMetadata */
  private isWebhookPath(req: Request): boolean {
    const path = req.path ?? req.url ?? '';
    return path.startsWith('/api/v1/webhooks') || path.startsWith('/webhooks');
  }

  private shouldSkip(req: Request): boolean {
    if (SKIP_METHODS.has(req.method)) return true;
    const path = req.path ?? req.url ?? '';

    // Webhook không skip - phải audit cho forensic (C-4 fix).
    // Body sẽ bị redact trong captureRequestMetadata thay vì skip hoàn toàn.
    if (this.isWebhookPath(req)) return false;

    return SKIP_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
  }

  private captureRequestMetadata(req: Request & { user?: { id: bigint } }): Record<string, unknown> {
    // Webhook body chứa vendor data nhạy cảm (senderAccount, rawData...).
    // Chỉ log identifiers an toàn để giữ forensic trail mà không leak PII.
    if (this.isWebhookPath(req)) {
      const body = req.body as Record<string, unknown> | undefined;
      return {
        webhook: true,
        externalId: body?.externalId,
        amount: body?.amount,
        bodyRedacted: true,
      };
    }

    return {
      body: sanitize(req.body),
      query: sanitize(req.query),
      params: sanitize(req.params),
    };
  }

  private enqueue(
    req: Request & { user?: { id: bigint } },
    action: string,
    statusCode: number,
    baseMetadata: Record<string, unknown>,
    startedAt: number,
    _responseBody: unknown,
    error?: unknown,
  ) {
    setImmediate(() => {
      try {
        const userId = req.user?.id ?? null;
        const path = req.path ?? req.url ?? '';
        const entityIdRaw = (req.params as Record<string, string> | undefined)?.id;
        const entityId = entityIdRaw && /^\d+$/.test(entityIdRaw) ? BigInt(entityIdRaw) : null;
        const entityType = this.inferEntityType(path);

        const metadata: Record<string, unknown> = {
          ...baseMetadata,
          durationMs: Date.now() - startedAt,
        };
        if (error) {
          metadata.error = error instanceof Error ? error.message : String(error);
        }

        void this.auditLogService.create({
          userId,
          action,
          entityType,
          entityId,
          method: req.method,
          path,
          statusCode,
          ipAddress: this.extractIp(req),
          userAgent: req.headers['user-agent'],
          metadata,
        });
      } catch (err) {
        this.logger.error(`Audit interceptor enqueue failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  /**
   * `POST /api/v1/leads/:id/transfer`  → `LEAD_TRANSFER`
   * `POST /api/v1/leads`               → `LEAD_CREATE`
   * `PATCH /api/v1/leads/:id`          → `LEAD_UPDATE`
   * `DELETE /api/v1/leads/:id`         → `LEAD_DELETE`
   * `POST /api/v1/auth/login`          → `USER_LOGIN`
   * Fallback: `${METHOD}_${SEGMENT}`
   */
  private inferAction(method: string, path: string): string {
    const clean = path.replace(/^\/api\/v\d+\//, '').replace(/\?.*$/, '');
    const segments = clean.split('/').filter(Boolean);
    if (segments.length === 0) return `${method}_ROOT`;

    const resource = segments[0];

    if (resource === 'auth') {
      const subAction = segments[1] ?? 'unknown';
      if (subAction === 'login') return 'USER_LOGIN';
      if (subAction === 'logout') return 'USER_LOGOUT';
      if (subAction === 'refresh') return 'USER_REFRESH';
      return `AUTH_${subAction.toUpperCase()}`;
    }

    const entity = this.singularize(resource).toUpperCase();

    // Custom action segment after :id (e.g. /leads/123/transfer)
    if (segments.length >= 3 && /^\d+$/.test(segments[1])) {
      return `${entity}_${segments[2].toUpperCase().replace(/-/g, '_')}`;
    }

    if (method === 'POST') return `${entity}_CREATE`;
    if (method === 'PUT' || method === 'PATCH') return `${entity}_UPDATE`;
    if (method === 'DELETE') return `${entity}_DELETE`;
    return `${entity}_${method}`;
  }

  private inferEntityType(path: string): string | null {
    const clean = path.replace(/^\/api\/v\d+\//, '');
    const first = clean.split('/').filter(Boolean)[0];
    if (!first || first === 'auth') return null;
    return this.singularize(first).toUpperCase();
  }

  private singularize(word: string): string {
    // CRM resources: leads → lead, customers → customer, activities → activity, categories → category
    if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
    if (word.endsWith('s')) return word.slice(0, -1);
    return word;
  }

  private extractIp(req: Request): string | undefined {
    // trust proxy đã bật ở main.ts nên req.ip là IP client thật (Express tự parse
    // X-Forwarded-For theo số hop tin cậy). Tự đọc header thô ở đây sẽ tin cả
    // giá trị spoof từ client kết nối thẳng - không làm.
    return req.ip;
  }
}
