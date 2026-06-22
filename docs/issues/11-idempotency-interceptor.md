# 11 — Idempotency interceptor (Stripe-grade)

**Phase:** 1b · **Depends on:** #03, #05, #07 · **Implements:** ADR-005

## Goal
An `IdempotencyInterceptor` that guarantees a duplicate `POST /checkout` (same key) applies once,
handles concurrent in-flight duplicates correctly, and replays the cached result for 5 minutes.

## Concepts you'll learn
- **Interceptors** wrapping the handler (before/after) and short-circuiting it.
- The **same race** as inventory in the idempotency cache → why `SET NX` is mandatory.
- A **self-healing lock** (PENDING with short TTL) so a crash doesn't wedge the key.
- Request **fingerprinting** (body hash) to catch key reuse with a different payload.

## Steps
1. Require `X-Idempotency-Key` on mutations; `400` if missing.
2. Key: `idem:{userId}:{method}:{path}:{idemKey}`. Compute `bodyHash = sha256(rawBody)`.
3. Atomically claim: `SET key '{"state":"PENDING"}' NX EX <lockTtl>` (e.g. 30s).
   - **Claim won** → run the handler (`next.handle()`); on completion overwrite
     `SET key {state:'DONE', status, body, bodyHash} EX 300`; on error, release the PENDING key.
   - **Claim lost** → `GET key`:
     - `PENDING` → **409** (in-flight duplicate; client retries shortly).
     - `DONE` + matching `bodyHash` → **replay** cached `{status, body}`.
     - `DONE` + different `bodyHash` → **422** (key reused with a different payload).
4. Apply to `/checkout` (and future mutations). Order: guard → **interceptor** → pipe → controller.

## Acceptance criteria
- [ ] Two concurrent identical requests → exactly one reserve happens; the other gets 409.
- [ ] A retry after completion (within 5 min) replays the identical cached response (no re-reserve).
- [ ] Same key + different body → 422.
- [ ] A crash mid-flight does not permanently block the key (PENDING TTL expires).
- [ ] Different users reusing the same key string do **not** collide.

## Docs to read
- NestJS Interceptors: https://docs.nestjs.com/interceptors
- NestJS request lifecycle (interceptor ordering): https://docs.nestjs.com/faq/request-lifecycle
- Redis SET options (NX/EX): https://redis.io/docs/latest/commands/set/
- Idempotency background (Stripe): https://docs.stripe.com/api/idempotent_requests
