import { connect } from 'node:net';
import { Injectable } from '@nestjs/common';
import {
  HealthIndicatorService,
  type HealthIndicatorResult,
} from '@nestjs/terminus';

/**
 * Lightweight TCP reachability check (no client libraries required).
 *
 * This is an INTERIM indicator for Phase 0: it proves the dependency's port is
 * reachable. It will be replaced by real client-level checks as those modules
 * land — Postgres `SELECT 1` (#2), Redis `PING` (#3), RabbitMQ channel (#8).
 */
@Injectable()
export class TcpHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async pingCheck(
    key: string,
    host: string,
    port: number,
    timeoutMs = 1500,
  ): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      await this.tryConnect(host, port, timeoutMs);
      return indicator.up({ host, port });
    } catch (error) {
      return indicator.down({ host, port, message: (error as Error).message });
    }
  }

  private tryConnect(
    host: string,
    port: number,
    timeoutMs: number,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const socket = connect({ host, port });
      const fail = (err: Error) => {
        socket.destroy();
        reject(err);
      };
      socket.setTimeout(timeoutMs);
      socket.once('error', fail);
      socket.once('timeout', () =>
        fail(new Error(`connection timed out after ${timeoutMs}ms`)),
      );
      socket.once('connect', () => {
        socket.end();
        resolve();
      });
    });
  }
}
