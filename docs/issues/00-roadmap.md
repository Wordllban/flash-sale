# Flash-Sale Engine — Implementation Roadmap

A high-throughput, fault-tolerant flash-sale backend in NestJS. This roadmap turns the
agreed design into sequenced, learnable issues. Each issue is a focused step with a concept
primer, acceptance criteria, and documentation links.

## Architecture at a glance

```
[Client] POST /checkout (X-Session-Id, X-Idempotency-Key)
   │
   ▼  NestJS pipeline
 Guard(auth + rate limit) → Interceptor(idempotency) → Pipe(validation) → Controller
   │
   ▼  Redis — ONE atomic Lua script (source of truth + outbox)
   if stock>0 and not already-bought: DECR stock; SADD buyers; XADD orders:stream
   │
   ▼  immediately
[Client] ◄── 202 Accepted
        ───────── async ─────────
 Relay (APP_ROLE=worker): read orders:stream (consumer group)
      → publish to RabbitMQ (publisher confirm) → XACK stream
 Consumer (prefetch=1, manual ack): one Prisma interactive txn → Order + InventoryLedger
      errors → classify: dup→ack · transient→backoff retry (DLX+TTL) · poison→DLQ
        ───────── safety nets ─────────
 Reconciliation job: redis.remaining ?= totalStock − count(ledger)
 Ledger-rebuild recovery: rebuild Redis from Postgres after data loss
```

> **Full rationale lives in [`docs/DECISIONS.md`](../DECISIONS.md)** (ADR-001…014) — context,
> choice, and rejected alternatives for each decision below.

## Key design decisions (the "why")

| Topic | Decision | Reason |
|---|---|---|
| Race condition | Atomic **Lua** check-and-decrement in Redis | No read→write gap = no oversell |
| Durability of intent | **Redis Stream** outbox in the same Lua op | Redis & Postgres can't share a transaction (dual-write problem) |
| Per-user limit | `SISMEMBER buyers` in Lua + DB `unique(userId,saleId)` | 1 per customer, atomically + a DB backstop |
| Idempotency | Stripe-grade interceptor (`SET NX`, body-hash, 409/422) | Network retries apply exactly once |
| DB protection | RabbitMQ buffer + `prefetch=1` consumer | Absorb the burst; steady DB writes |
| RabbitMQ client | `@golevelup/nestjs-rabbitmq` | Topology control + non-Nest producer (the relay) |
| Process model | Modular monolith, `APP_ROLE=api\|worker\|all` | Scale api/worker independently; split later |
| Proof | k6 asserting `count(202) == initialStock` | "Zero oversell" must be demonstrable |

## Phases

**Phase 0 — Foundation**
- [#01 Bootstrap infra & app shell](01-bootstrap-infra.md)
- [#02 Prisma schema & migrations](02-prisma-schema.md)

**Phase 1 — Happy-path checkout (end-to-end demoable)**
- [#03 Redis module + atomic Lua reserve script](03-redis-module-lua.md)
- [#04 Sales module + activate (seed Redis)](04-sales-module-activate.md)
- [#05 Auth guard + @CurrentUser decorator](05-auth-guard-decorator.md)
- [#06 Validation pipe + checkout DTO](06-validation-dto.md)
- [#07 Checkout controller (202 fast path)](07-checkout-controller.md)
- [#08 RabbitMQ topology (golevelup)](08-rabbitmq-topology.md)
- [#09 Relay: Redis Stream → RabbitMQ](09-relay-stream-to-rabbit.md)
- [#10 Consumer: persist Order + Ledger](10-consumer-persist.md)

**Phase 1b — Request-lifecycle hardening**
- [#11 Idempotency interceptor (Stripe-grade)](11-idempotency-interceptor.md)
- [#12 Distributed rate limiting](12-rate-limiting.md)
- [#13 Exception filters (Http + Prisma)](13-exception-filters.md)

**Phase 2 — Production hardening & proof**
- [#14 Consumer retry classification + DLQ](14-consumer-retry-dlq.md)
- [#15 Reconciliation + ledger-rebuild recovery](15-reconciliation-recovery.md)
- [#16 k6 load test: prove zero oversell](16-load-test-k6.md)

## How to work an issue
1. Read the **Concepts** section + the linked docs first.
2. Implement the **Steps**.
3. Verify every **Acceptance criterion**.
4. Commit referencing the issue (`git commit -m "feat: ... (#N)"`), check it off here.

## Core NestJS docs (bookmark)
- Modules/Providers/DI: https://docs.nestjs.com/modules · https://docs.nestjs.com/providers · https://docs.nestjs.com/fundamentals/custom-providers
- Request lifecycle: https://docs.nestjs.com/faq/request-lifecycle
- Guards: https://docs.nestjs.com/guards · Interceptors: https://docs.nestjs.com/interceptors
- Pipes/Validation: https://docs.nestjs.com/pipes · https://docs.nestjs.com/techniques/validation
- Exception filters: https://docs.nestjs.com/exception-filters · Custom decorators: https://docs.nestjs.com/custom-decorators
