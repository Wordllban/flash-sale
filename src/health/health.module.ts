import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './prisma.health';
import { TcpHealthIndicator } from './tcp.health';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [TcpHealthIndicator, PrismaHealthIndicator],
})
export class HealthModule {}
