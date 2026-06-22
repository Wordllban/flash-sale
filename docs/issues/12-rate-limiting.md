# 12 — Distributed rate limiting

**Phase:** 1b · **Depends on:** #03, #05 · **Implements:** ADR-007

## Goal
Add distributed rate limiting with `@nestjs/throttler` backed by **Redis** so the limit holds
across multiple app instances.

## Concepts you'll learn
- `@nestjs/throttler` `ThrottlerGuard` + `@Throttle` decorators.
- Why **shared (Redis) storage** is required for horizontal scaling (in-memory = N× looser limit).
- Per-user keying via a custom tracker (use `req.user.userId`, not just IP).

## Steps
1. `pnpm add @nestjs/throttler @nest-lab/throttler-storage-redis` (or
   `nestjs-throttler-storage-redis`).
2. `ThrottlerModule.forRootAsync` with the Redis storage adapter and a sensible default
   (e.g. `limit: 100, ttl: 60000`). Apply `ThrottlerGuard` globally or on checkout.
3. Custom `getTracker` → return `req.user.userId` (fall back to IP for unauthenticated routes).
4. Tune `@Throttle` specifically on `/checkout` (stricter) vs read endpoints.

## Acceptance criteria
- [ ] Exceeding the limit returns **429** with `Retry-After`.
- [ ] Counters are stored in Redis (verify keys appear) — shared across instances.
- [ ] Limit is enforced per **user**, not globally/per-IP only.
- [ ] Running two app instances does not double the effective limit.

## Docs to read
- NestJS Rate limiting: https://docs.nestjs.com/security/rate-limiting
- Throttler Redis storage: https://github.com/jmcdo29/nest-lab/tree/main/packages/throttler-storage-redis
- HTTP 429 / Retry-After: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/429
