import { Injectable, NestInterceptor, ExecutionContext, CallHandler, StreamableFile } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Serializes BigInt values to strings in all API responses.
 * Required because JSON.stringify cannot handle BigInt natively.
 */
@Injectable()
export class BigIntTransformInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => this.transformBigInts(data)));
  }

  private transformBigInts(data: unknown): unknown {
    if (data === null || data === undefined) return data;
    if (typeof data === 'bigint') return data.toString();
    if (data instanceof Date) return data;
    // Skip binary / stream payloads - iterating their props would break NestJS
    // streaming (StreamableFile) or corrupt Buffers.
    if (data instanceof StreamableFile) return data;
    if (Buffer.isBuffer(data)) return data;
    // Handle Prisma Decimal objects (have toNumber/toFixed methods and {s, e, d} shape)
    if (typeof data === 'object' && data !== null && 'toFixed' in data && 'd' in data) {
      return Number((data as { toFixed: (n: number) => string }).toFixed(2));
    }
    if (Array.isArray(data)) return data.map((item) => this.transformBigInts(item));
    if (typeof data === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        result[key] = this.transformBigInts(value);
      }
      return result;
    }
    return data;
  }
}
