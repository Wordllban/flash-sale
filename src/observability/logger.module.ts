import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import type { Env } from '../config/env.validation';

/**
 * Structured (pino) logging with a per-request id. Pretty-printed in dev,
 * JSON in prod. Sensitive auth headers are redacted.
 */
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const isDev = config.get('NODE_ENV', { infer: true }) === 'development';
        return {
          pinoHttp: {
            level: config.get('LOG_LEVEL', { infer: true }),
            autoLogging: true,
            genReqId: (req) =>
              (req.headers['x-request-id'] as string) ?? randomUUID(),
            redact: [
              'req.headers.authorization',
              'req.headers["x-session-id"]',
              'req.headers["x-idempotency-key"]',
            ],
            transport: isDev
              ? {
                  target: 'pino-pretty',
                  options: { singleLine: true, translateTime: 'SYS:standard' },
                }
              : undefined,
          },
        };
      },
    }),
  ],
})
export class LoggerModule {}
