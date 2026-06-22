# Architecture Decision Record — Flash-Sale Engine

Design decisions for the high-throughput flash-sale backend, captured during a design
("grilling") session. Each decision records the **context**, the **choice**, the **why**, and
the **alternatives rejected**. This is the source of truth; issues in `docs/issues/` implement it.

**Product context:** this began as a NestJS senior-backend assessment but is intended to grow
into a product — a platform letting small custom-clothing businesses run limited-product drops.
Two identities exist: the **buyer** (checkout hot path, covered here) and the **merchant/tenant**
(a future module, not built yet).

**Stance:** production-grade. We treat the hard problems (the Redis↔Postgres consistency gap,
DLQ/retry, reconciliation, broker-down resilience) as first-class, not optional.

---

## ADR-001 — Atomic inventory via Redis Lua, not a DB update
**Context:** 10,000 users race for the last 5 items. A naive `SELECT stock; UPDATE stock-1` has a
read→write gap → two requests both read "1 left" → oversell. DB row locks serialise everyone and
collapse under load.
**Decision:** Inventory lives in **Redis**; the check-and-decrement is a single **Lua script**,
which Redis executes atomically (nothing interleaves). No gap = no race.
**Why:** In-memory speed for 500+ rps; true atomicity without locks.
**Rejected:** DB pessimistic/optimistic locking (too slow/contended at this scale); Redlock
(heavier distributed lock; unnecessary when a single Lua script is already atomic).

## ADR-002 — Durable intent lives in a Redis Stream (outbox pattern)
**Context:** After the atomic decrement we must reliably get the order to Postgres. But Redis,
RabbitMQ and Postgres are separate systems — there is **no transaction spanning them** (the
dual-write problem). A crash between "decrement" and "publish" would lose the order (stuck stock).
**Decision:** The **same Lua script** that decrements also `XADD`s an order-intent to a **Redis
Stream**. The atomic unit stays inside one system. A separate **relay** reads the stream and
publishes to RabbitMQ; it only `XACK`s after a publisher confirm.
**Why:** The durable "to-do" note is committed in the same atomic breath as the decrement — no
lost-order window.
**Rejected:** Publish-then-compensate (a crash between decrement and compensation silently loses
the reservation); Postgres outbox (puts the slow DB back on the hot path, defeating the design).

## ADR-003 — A decrement is a final sale (no holds/expiry)
**Context:** Real checkout often does reserve→pay→confirm with TTL release. The assessment flow has
no payment step.
**Decision:** A successful decrement **is** the purchase. No reservation expiry, no confirm step.
**Why:** Matches the required flow 1:1; keeps the Lua script and data model simple. The only TTLs
in the system are for idempotency, not inventory.
**Rejected:** Hold + TTL + confirm (adds a confirm endpoint, release-on-timeout worker, and
pending→confirmed states the spec never asks for).

## ADR-004 — One purchase per customer, enforced atomically
**Context:** Limited drops need anti-scalper "1 per customer". This is distinct from idempotency
(accidental retry of the *same* request) — it rejects a *second different* legitimate request.
**Decision:** The Lua script also checks `SISMEMBER buyers:{saleId}` and `SADD`s the user on
success — all inside the same atomic op. The DB `@@unique([userId, saleId])` is the final backstop.
**Why:** Atomic per-user enforcement on the hot path; DB constraint catches anything that slips.
**Rejected:** Oversell-protection-only (doesn't model the real anti-scalper rule).

## ADR-005 — Idempotency interceptor, Stripe-grade
**Context:** A client's network retry must apply the checkout **once**. A naive `GET key; process;
SET key` has the *same* race as inventory — two concurrent dupes both pass the check.
**Decision:** An `IdempotencyInterceptor` that:
- keys by `idem:{userId}:{method}:{path}:{X-Idempotency-Key}` (no cross-user/route collisions);
- atomically claims the slot with `SET key PENDING NX EX <short>` (self-healing lock);
- returns **409** if a duplicate arrives while the first is still in-flight;
- caches `{status, body, bodyHash} EX 300` and **replays** it for later retries within 5 min;
- returns **422** if the same key arrives with a different body hash (client bug).
**Why:** Correct under concurrency, self-healing on crash, leak-proof across users, catches misuse.
**Rejected:** Block-and-wait for the in-flight request (holds connections open → reintroduces the
resource exhaustion we're avoiding); raw-key cache with no body hash (cross-user leaks, stale
replays). The in-flight overlap is millisecond-wide; a 409+retry is standard (Stripe/PayPal).

## ADR-006 — Auth guard: trusted session header now, JWT-ready boundary
**Context:** The assessment says "simulated session identifier". The real product will need real
auth eventually.
**Decision:** A guard reads `X-Session-Id` (a UUID) → validates format → attaches typed
`req.user.userId`; 401 on missing/malformed. The guard is a **swappable boundary** — nothing
downstream knows how identity was derived.
**Why:** Keeps focus on the concurrency problem; JWT can replace the guard internals later with
zero downstream changes. Buyer vs merchant auth are separate layers.
**Rejected:** Signed JWT now (issuance/secret/refresh is a subsystem the spec calls "simulated");
Redis-backed session lookup (extra hop per hot-path request for little gain at this stage).

## ADR-007 — Distributed rate limiting via @nestjs/throttler + Redis
**Context:** With horizontal scaling, in-memory counters make a "100/min" limit effectively
"N×100/min". The limit must be shared.
**Decision:** `@nestjs/throttler` with a **Redis storage adapter**; declarative `@Throttle`.
**Why:** Idiomatic NestJS, battle-tested, shared state across instances, least custom code.
**Rejected:** Custom Lua token-bucket (more to maintain; revisit only if we need custom algorithms);
in-memory throttling (breaks under multiple instances — the exact scenario we protect against).

## ADR-008 — RabbitMQ via @golevelup/nestjs-rabbitmq
**Context:** We need a real topology (exchange + routing key + dead-letter exchange + retry queue),
manual ack, `prefetch=1`, publisher confirms, auto-reconnect — **and** a non-Nest producer (the
Redis-stream relay publishes plain JSON).
**Decision:** `@golevelup/nestjs-rabbitmq` (over `amqp-connection-manager`).
**Why:** First-class topology/DLQ/prefetch/manual-ack control, auto-reconnect + confirms, and the
consumer subscribes by `exchange + routingKey` so the relay stays framework-agnostic. Idiomatic Nest.
**Rejected:** `@nestjs/microservices` RMQ transport (pattern-routed, opinionated single-queue model;
the relay would have to mimic Nest's internal `{pattern,data}` envelope; DLQ/retry are escape-hatch
work — we'd fight the abstraction from issue one); raw `amqp-connection-manager` (max boilerplate).

## ADR-009 — Consumer fault handling: classify errors
**Context:** RabbitMQ is **at-least-once** → duplicate deliveries *will* occur. DB writes can fail
transiently (deadlock/timeout) or permanently (poison message).
**Decision:** The consumer inspects the error:
- **unique-constraint violation** (`P2002`) → **ack** (already persisted; an idempotent duplicate);
- **transient** → **nack** to a retry queue with TTL backoff (DLX), up to N attempts;
- **exhausted / unprocessable** → route to a **parking-lot DLQ** for inspection.
Attempt count tracked via the `x-death` header.
**Why:** Distinguishes "already done" from "try again" from "give up" — no lost orders, no hot loops.
**Rejected:** Simple retry-then-DLQ (burns retries on harmless dups, treats them as errors);
immediate DLQ (a 1-second DB blip permanently parks recoverable orders).

## ADR-010 — Modular monolith with an APP_ROLE flag
**Context:** Three runtime roles: HTTP **API**, the **relay**, the **consumer**. Future merchant
features are new modules, not new apps.
**Decision:** One codebase/image; `APP_ROLE=api|worker|all` decides which providers boot. Dev runs
`all`; prod can scale api and worker replicas independently from the same image.
**Why:** Independent scaling now without monorepo overhead; clean module seams keep a later
monorepo/service split cheap. Merchant features slot in as modules.
**Rejected:** Everything-always-on (can't scale api vs worker separately); monorepo apps now
(build/config/deploy drag before any scaling/team driver exists).

## ADR-011 — Schema: FlashSale + Order + append-only InventoryLedger
**Context:** The spec says persist "Order **& Ledger** updates"; "go deep" wants reconciliation.
**Decision:** Three tables. The consumer writes the `Order` **and** an immutable `InventoryLedger`
row in **one Prisma interactive transaction**. Reconciliation compares
`redis.remaining ?= totalStock − count(ledger)`.
**Why:** Tamper-evident audit trail + a precise basis for detecting drift between fast path and
durable store.
**Rejected:** Orders-only (no audit log; diverges from the spec's explicit "Ledger").

## ADR-012 — Inventory seeding & recovery: explicit activate + AOF + ledger rebuild
**Context:** Redis starts empty; if it loses data mid-sale, naive re-seeding to full stock would
re-sell everything.
**Decision:** An explicit **"activate sale"** step seeds Redis from Postgres
(`SET stock:{id}=totalStock`, clear `buyers:{id}`). Redis runs with **AOF** for normal restarts.
For true data loss, an **idempotent rebuild** reconstructs `stock = totalStock − count(ledger)` and
`buyers` from order rows.
**Why:** Belt-and-suspenders correctness; rebuild is safe to re-run.
**Rejected:** Lazy seed on first request (a mid-sale Redis loss re-seeds to full stock → mass
oversell); activate + AOF only (no safe path if the AOF is lost/corrupted).

## ADR-013 — Exception filters: global Http + Prisma
**Decision:** A global `HttpExceptionFilter` for a consistent error envelope, plus a
`PrismaExceptionFilter` mapping known codes (e.g. `P2002` unique → 409, `P2025` not-found → 404) to
clean signatures while logging full internal context.
**Why:** Never leak raw DB errors; preserve debuggable logs.

## ADR-014 — Prove zero oversell with k6
**Decision:** A **k6** script issues 500+ rps with per-VU unique session + idempotency keys against
the last items, then asserts via a **threshold** that `count(202) == initialStock` — a pass/fail
gate. `autocannon` kept as an optional raw-throughput smoke test.
**Why:** "Zero oversell" is the headline claim and must be demonstrable, not asserted.

---

## Stack
NestJS 11 (pnpm) · Prisma + PostgreSQL · Redis (AOF, Lua, Streams) ·
RabbitMQ (`@golevelup/nestjs-rabbitmq`) · `@nestjs/config` · `@nestjs/throttler` · nestjs-pino ·
`@nestjs/terminus` · k6 · single `docker-compose.yml`.
