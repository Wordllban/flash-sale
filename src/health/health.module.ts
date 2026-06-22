import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { TcpHealthIndicator } from './tcp.health';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [TcpHealthIndicator],
})
export class HealthModule {}
