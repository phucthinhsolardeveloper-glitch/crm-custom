import { Global, Module } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-ioredis-yet';
import { CacheService } from './cache.service';
import { CACHE_TTL } from './cache.constants';

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      useFactory: async (config: ConfigService) => {
        const redisUrl = config.get('REDIS_URL', 'redis://localhost:6380');
        const parsed = new URL(redisUrl);
        return {
          store: redisStore,
          host: parsed.hostname,
          port: parseInt(parsed.port || '6379'),
          ...(parsed.password && { password: parsed.password }),
          ttl: CACHE_TTL.MEDIUM * 1000,
          keyPrefix: 'crm:cache:',
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [CacheService],
  exports: [CacheService, NestCacheModule],
})
export class AppCacheModule {}
