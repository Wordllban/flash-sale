# 07 — Checkout controller (202 fast path)

**Phase:** 1 · **Depends on:** #03, #04, #05, #06 · **Implements:** ADR-001/002/003/004

## Goal
Wire the whole hot path: `POST /checkout` runs guard → (idempotency #11 later) → pipe → controller,
which generates an `orderId`, calls the atomic Lua reserve, and returns **202 Accepted** instantly.
This is the first end-to-end milestone (minus async persistence, added in #08–#10).

## Concepts you'll learn
- Composing the request pipeline; returning a non-200 success (`202`).
- Mapping the Lua result enum to HTTP semantics.
- Generating a stable `orderId` **before** the reserve so it flows through the outbox unchanged.

## Steps
1. `CheckoutController` with `POST /checkout`, `@UseGuards(SessionAuthGuard)`, `@HttpCode(202)`.
2. Handler:
   - `const orderId = randomUUID()`.
   - `const result = await inventory.reserve(dto.saleId, user.userId, orderId)`.
   - Map: `OK → 202 { orderId, status: 'accepted' }`; `SOLD_OUT → 410 Gone`;
     `ALREADY_BOUGHT → 409 Conflict`; `NOT_ACTIVE → 404/409`.
3. Keep the controller thin — no DB calls here (DB is async, #10).
4. Leave a clear seam for the idempotency interceptor (#11) to wrap this route.

## Acceptance criteria
- [ ] Happy path returns **202** with an `orderId`; Redis stock decremented once.
- [ ] Sold out returns 410; duplicate buyer returns 409; inactive sale handled.
- [ ] No Postgres access on the request path (verify: DB untouched, only the stream grows).
- [ ] Manual test: `curl` with a valid `X-Session-Id` succeeds; without it → 401.

## Docs to read
- NestJS Controllers (status codes, headers): https://docs.nestjs.com/controllers
- HTTP 202 Accepted: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/202
- Request lifecycle (full order): https://docs.nestjs.com/faq/request-lifecycle
