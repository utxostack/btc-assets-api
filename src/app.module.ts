import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { TokenModule } from './modules/token/token.module';
import { BitcoinModule } from './modules/bitcoin/bitcoin.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { envSchema } from './env';
import { SentryModule } from '@ntegral/nestjs-sentry';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { CacheModule } from '@nestjs/cache-manager';
import type { RedisClientOptions } from 'redis';
import * as redisStore from 'cache-manager-redis-store';
import { StoreConfig } from 'cache-manager';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: envSchema.parse,
    }),
    CacheModule.registerAsync<RedisClientOptions>({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) =>
        ({
          store: redisStore,
          url: configService.get('REDIS_URL'),
          ttl: 10,
        }) as StoreConfig,
    }),
    SentryModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        dsn: configService.get('SENTRY_DSN'),
        environment: configService.get('NODE_ENV'),
        tracesSampleRate: 0.5,
        profilesSampleRate: 0.5,
        integrations: [nodeProfilingIntegration()],
        logLevels:
          configService.get('NODE_ENV') === 'production'
            ? ['warn', 'error']
            : ['debug', 'log', 'warn', 'error'],
        beforeSend: (event) => {
          if (event.level === 'error') {
            return event;
          }
          return null;
        },
      }),
    }),
    TokenModule,
    BitcoinModule,
  ],
  controllers: [],
  providers: [AppService],
})
export class AppModule {}
