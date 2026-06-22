# 15 — Reconciliation + ledger-rebuild recovery

**Phase:** 2 · **Depends on:** #03, #10 · **Implements:** ADR-011, ADR-012

## Goal
Two safety nets that close the Redis↔Postgres consistency loop: a **reconciliation job** that
detects drift between the fast path and the durable store, and an **idempotent rebuild** that
reconstructs Redis state from Postgres after data loss.

## Concepts you'll learn
- **Scheduled tasks** in NestJS (`@nestjs/schedule` / `@Cron`).
- Reconciliation: comparing two sources of truth and **alerting on divergence**.
- Idempotent **recovery** procedures (safe to re-run).

## Steps
1. `pnpm add @nestjs/schedule`. Add a `ReconciliationService` (worker role) with a `@Cron`
   (e.g. every minute for active sales):
   - read `remaining = GET stock:{id}` and `sold = count(InventoryLedger where saleId)`.
   - assert `remaining + sold == totalStock`; if not, log a structured **drift alert**
     (saleId, expected, actual, diff) and a metric.
   - allow a small transient lag (in-flight messages) before alerting (e.g. compare twice).
2. `rebuildFromLedger(saleId)` command/endpoint (admin/CLI):
   - `stock:{id} = totalStock − count(ledger)`; `buyers:{id} = SELECT userId FROM "Order"`.
   - Idempotent and safe to run anytime; document when to use (after Redis data loss).
3. Optional: expose reconciliation status in `/health` or a `/admin/sales/:id/recon` endpoint.

## Acceptance criteria
- [ ] Reconciliation runs on schedule and logs OK when consistent.
- [ ] Artificially corrupting the Redis counter triggers a drift alert.
- [ ] `rebuildFromLedger` restores correct `stock` and `buyers` from Postgres.
- [ ] Rebuild is idempotent (running twice yields the same state) and never oversells.

## Docs to read
- NestJS Task scheduling: https://docs.nestjs.com/techniques/task-scheduling
- Redis SCARD/GET: https://redis.io/docs/latest/commands/scard/ · https://redis.io/docs/latest/commands/get/
- Reconciliation pattern (background): https://microservices.io/patterns/data/transactional-outbox.html
