# 09 — Relay: Redis Stream → RabbitMQ

**Phase:** 1 · **Depends on:** #03, #08 · **Implements:** ADR-002, ADR-010

## Goal
Build the **relay**: a worker (`APP_ROLE` includes worker) that reads order intents from the
`orders:stream` Redis Stream via a **consumer group** and publishes them to RabbitMQ, only
acknowledging the stream entry after a **publisher confirm**. This bridges the atomic outbox to the
durable processing queue.

## Concepts you'll learn
- Redis Streams **consumer groups** (`XGROUP`, `XREADGROUP`, `XACK`, `XAUTOCLAIM`).
- **At-least-once** delivery and why confirm-before-ack guarantees no lost orders.
- Crash recovery: pending entries (PEL) get reclaimed and retried.
- Running background work conditionally by `APP_ROLE` (ADR-010).

## Steps
1. Create the consumer group on `orders:stream` at startup (`XGROUP CREATE ... MKSTREAM`, ignore
   BUSYGROUP).
2. Relay loop (only when role ∈ {worker, all}): `XREADGROUP GROUP relay <consumer> COUNT n BLOCK m`
   → for each entry, `publish('orders', 'order.approved', payload)` **with confirm** →
   on confirm, `XACK orders:stream relay <id>`.
3. Reclaim stale pending entries periodically with `XAUTOCLAIM` (covers a crashed consumer).
4. If RabbitMQ is unavailable, do **not** XACK — entries stay pending and are retried (backpressure;
   ties into #14 broker-down resilience).
5. Keep payload framework-agnostic plain JSON (`{ orderId, userId, saleId }`).

## Acceptance criteria
- [ ] A successful checkout's stream entry is published to `orders.persist` and then XACK'd.
- [ ] If publish/confirm fails, the entry remains pending (not lost) and is retried.
- [ ] Killing the relay mid-batch → on restart, pending entries are reclaimed and processed.
- [ ] With `APP_ROLE=api`, the relay loop does **not** run; with `worker`/`all`, it does.

## Docs to read
- Redis Streams consumer groups: https://redis.io/docs/latest/develop/data-types/streams/#consumer-groups
- XREADGROUP: https://redis.io/docs/latest/commands/xreadgroup/
- XAUTOCLAIM: https://redis.io/docs/latest/commands/xautoclaim/
- RabbitMQ publisher confirms: https://www.rabbitmq.com/docs/confirms
- golevelup publishing (`AmqpConnection.publish`): https://github.com/golevelup/nestjs/tree/master/packages/rabbitmq#making-rpc-requests--publishing-messages
