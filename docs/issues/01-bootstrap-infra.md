# 01 — Bootstrap infra & app shell

**Phase:** 0 — Foundation · **Depends on:** none

## Goal

Stand up all infrastructure via one `docker-compose.yml` and wire the NestJS app shell:
typed config, structured logging, health checks, graceful shutdown, and the `APP_ROLE`
process-mode switch.

## Concepts you'll learn

- **docker-compose** as a single environment for Postgres, Redis, RabbitMQ.
- **Redis AOF persistence** (`appendonly yes`) — why the inventory counter must survive a restart.
- **`@nestjs/config`** with schema validation — fail fast at boot if env is wrong.
- **Graceful shutdown** (`enableShutdownHooks`) — drain in-flight work on SIGTERM.
- **`APP_ROLE`** — one image, conditional module registration (`api | worker | all`).

## Steps

1. Add `docker-compose.yml` with services:
   - `postgres:16` (POSTGRES_USER/PASSWORD/DB, volume, healthcheck `pg_isready`).
   - `redis:8` started with `--appendonly yes` (AOF on), volume, healthcheck `redis-cli ping`.
   - `rabbitmq:3-management` (ports 5672 + 15672 UI, volume, healthcheck `rabbitmq-diagnostics ping`).
2. `pnpm add @nestjs/config` and create a `ConfigModule` with a validation schema (zod or joi):
   `PORT, APP_ROLE, DATABASE_URL, REDIS_URL, RABBITMQ_URL`. Reject boot on invalid env.
3. Structured logging: `pnpm add nestjs-pino pino-http` and set up `LoggerModule` (pretty in dev).
4. Health: `pnpm add @nestjs/terminus` → `/health` checks Postgres, Redis, RabbitMQ. (DB/Redis/RMQ
   indicators can be stubbed now, filled in as those modules land.)
5. In `main.ts`: `app.enableShutdownHooks()`, bind the pino logger, read `PORT` from config.
6. `APP_ROLE` scaffold: read the flag in `AppModule` and gate worker-only modules later
   (document the convention now; modules plug in as they're built).
7. Update `.env` / `.env.example` with all variables. Add a `pnpm dev:up` script (compose up -d).

## Acceptance criteria

- [ ] `docker compose up -d` brings up Postgres, Redis (AOF), RabbitMQ; all healthy.
- [ ] App boots and **refuses to start** if a required env var is missing/invalid.
- [ ] `GET /health` returns 200 with per-dependency status.
- [ ] Logs are structured JSON (pino) with a request id.
- [ ] `APP_ROLE` is read from config and available to module registration.
- [ ] RabbitMQ management UI reachable at http://localhost:15672.

## Docs to read

- NestJS Configuration: https://docs.nestjs.com/techniques/configuration
- NestJS Lifecycle/shutdown: https://docs.nestjs.com/fundamentals/lifecycle-events
- NestJS Terminus health: https://docs.nestjs.com/recipes/terminus
- NestJS Logger / nestjs-pino: https://docs.nestjs.com/techniques/logger · https://github.com/iamolegga/nestjs-pino
- Redis persistence (AOF): https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/
- Compose healthchecks: https://docs.docker.com/reference/compose-file/services/#healthcheck
