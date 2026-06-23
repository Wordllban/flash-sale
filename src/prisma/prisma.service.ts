import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Env } from '../config/env.validation';
import { PrismaClient } from '../generated/prisma/client';

/**
 * The one type-safe gateway to Postgres for the whole app.
 *
 * Prisma 7 no longer ships a native query engine: WE own the connection pool.
 * `PrismaPg` is a thin wrapper over a `pg` pool, fed the URL validated at boot
 * (ADR-002). Owning the pool is what lets us tune it under flash-sale load.
 *
 * Lifecycle: `$connect()` on module init (fail fast if the DB is unreachable),
 * `$disconnect()` on shutdown so the pool drains cleanly (main.ts enables
 * shutdown hooks). Exported as a global module so every feature can inject it.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<Env, true>) {
    const adapter = new PrismaPg({
      connectionString: config.get('DATABASE_URL', { infer: true }),
    });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to Postgres');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Disconnected from Postgres');
  }
}
