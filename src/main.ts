import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { Env } from './config/env.validation';

async function bootstrap() {
  // bufferLogs so early logs are flushed through pino once it's ready.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // Drain in-flight work (relay/consumer/DB) cleanly on SIGTERM/SIGINT (ADR-010).
  app.enableShutdownHooks();

  const config = app.get(ConfigService<Env, true>);
  const port = config.get('PORT', { infer: true });
  const role = config.get('APP_ROLE', { infer: true });

  await app.listen(port);
  app
    .get(Logger)
    .log(`Flash-sale engine listening on :${port} (APP_ROLE=${role})`);
}

void bootstrap();
