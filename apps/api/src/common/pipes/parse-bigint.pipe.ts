import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

/**
 * Parses string route params to BigInt.
 * Usage: @Param('id', ParseBigIntPipe) id: bigint
 */
@Injectable()
export class ParseBigIntPipe implements PipeTransform<string, bigint> {
  transform(value: string): bigint {
    try {
      const parsed = BigInt(value);
      if (parsed <= 0n) {
        throw new Error();
      }
      return parsed;
    } catch {
      throw new BadRequestException(`ID không hợp lệ: ${value}`);
    }
  }
}
