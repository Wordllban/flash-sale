# 14 — Consumer retry classification + DLQ

**Phase:** 2 · **Depends on:** #08, #10 · **Implements:** ADR-009

## Goal
Harden the consumer into a fault-tolerant processor: classify failures and route them correctly —
duplicates ack, transient errors retry with backoff via DLX+TTL, exhausted/poison messages land in
a parking-lot DLQ. Also make the pipeline survive broker disconnects gracefully.

## Concepts you'll learn
- **Error classification** as a first-class concern (dup vs transient vs permanent).
- **Delayed retry** via DLX + TTL (no hot-loop requeue) and counting attempts via `x-death`.
- **Parking-lot DLQ** for human inspection / replay.
- Graceful degradation on broker disconnect (auto-reconnect, no unhandled exceptions).

## Steps
1. Wrap the persist handler with classification:
   - `P2002` (unique) → **ack** (idempotent duplicate; already persisted).
   - transient (connection reset, deadlock `P2034`, timeout) → **nack(requeue=false)** so it
     dead-letters to `orders.retry` (TTL backoff) and re-enters `orders.persist` after the delay.
   - read attempt count from `x-death`; once `attempts >= MAX` (e.g. 5) → publish to `orders.parking`
     (DLQ) and ack the original.
   - unknown/unprocessable (validation/shape) → straight to `orders.parking`.
2. Optionally escalate retry TTLs (e.g. 5s → 30s → 2m) via multiple retry queues or a header-driven delay.
3. Broker-down resilience: confirm golevelup auto-reconnect; ensure the relay (#09) holds (doesn't
   XACK) while RabbitMQ is down; no unhandled promise rejections anywhere.
4. Add a tiny admin endpoint or script to inspect/replay `orders.parking`.

## Acceptance criteria
- [ ] Duplicate delivery → acked, no retry burned, no duplicate rows.
- [ ] Simulated transient failure → message retries with delay, then succeeds (no data loss).
- [ ] After MAX attempts → message in `orders.parking`, original acked, clear log/alert.
- [ ] Stop RabbitMQ mid-load → app stays up, reconnects, and unprocessed intents flush from the
      Redis stream afterward (no lost orders).

## Docs to read
- RabbitMQ DLX: https://www.rabbitmq.com/docs/dlx
- RabbitMQ TTL: https://www.rabbitmq.com/docs/ttl
- `x-death` / dead-lettering details: https://www.rabbitmq.com/docs/dlx#effects
- golevelup error handling/nack: https://github.com/golevelup/nestjs/tree/master/packages/rabbitmq#error-handling
- Prisma error reference (P2034 write conflict): https://www.prisma.io/docs/orm/reference/error-reference
