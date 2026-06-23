import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import type { Env } from '../config/env.validation';
import { PrismaHealthIndicator } from './prisma.health';
import { TcpHealthIndicator } from './tcp.health';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly tcp: TcpHealthIndicator,
    private readonly prisma: PrismaHealthIndicator,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    const redis = new URL(this.config.get('REDIS_URL', { infer: true }));
    const rmq = new URL(this.config.get('RABBITMQ_URL', { infer: true }));

    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
      // Postgres: real query round-trip. Redis/RabbitMQ stay TCP until #3/#8.
      () => this.prisma.pingCheck('postgres'),
      () =>
        this.tcp.pingCheck('redis', redis.hostname, Number(redis.port) || 6379),
      () =>
        this.tcp.pingCheck('rabbitmq', rmq.hostname, Number(rmq.port) || 5672),
    ]);
  }
}
