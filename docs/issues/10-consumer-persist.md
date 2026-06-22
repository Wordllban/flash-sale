# 10 — Consumer: persist Order + Ledger

**Phase:** 1 · **Depends on:** #02, #08 · **Implements:** ADR-009, ADR-011

## Goal
The RabbitMQ **consumer**: pull one message at a time (`prefetch=1`), write the `Order` **and** the
`InventoryLedger` row in a **single Prisma interactive transaction**, then **manually ack**. This is
where the durable record is finally created. (Error classification/retry is hardened in #14 — here,
get the happy path + duplicate handling right.)

## Concepts you'll learn
- `@RabbitSubscribe` with manual ack and `prefetch=1` (sequential, DB-protective).
- **Interactive transactions** in Prisma (`$transaction(async (tx) => …)`).
- **Consumer idempotency**: `unique(userId, saleId)` / `orderId` makes reprocessing safe.
- Ack-after-commit ordering (never ack before the DB write is durable).

## Steps
1. `OrdersConsumer` with `@RabbitSubscribe({ exchange:'orders', routingKey:'order.approved',
   queue:'orders.persist', queueOptions:{ durable:true } })`, manual ack.
2. Handler, inside `prisma.$transaction(async (tx) => { ... })`:
   - `tx.order.create({ data: { id: orderId, userId, saleId, status:'CONFIRMED' } })`.
   - `tx.inventoryLedger.create({ data: { orderId, userId, saleId, delta: -1 } })`.
   - On success → `channel.ack(msg)`.
3. Duplicate delivery (unique violation `P2002`) → treat as success → **ack** (idempotent; #14
   formalises the full classification). Other errors → throw/nack (retry handled in #14).
4. Only run when `APP_ROLE` ∈ {worker, all}.

## Acceptance criteria
- [ ] A published message creates exactly one `Order` + one `InventoryLedger` row, atomically.
- [ ] Re-delivering the same message creates **no** duplicate rows and acks cleanly.
- [ ] Messages are processed one at a time (`prefetch=1`).
- [ ] End-to-end: checkout (202) → relay → consumer → row in Postgres. **Milestone: full pipeline.**

## Docs to read
- golevelup `@RabbitSubscribe` + ack: https://github.com/golevelup/nestjs/tree/master/packages/rabbitmq#receiving-messages
- Prisma interactive transactions: https://www.prisma.io/docs/orm/prisma-client/queries/transactions#interactive-transactions
- Prisma error codes (P2002): https://www.prisma.io/docs/orm/reference/error-reference#p2002
- RabbitMQ consumer acknowledgements: https://www.rabbitmq.com/docs/confirms#acknowledgement-modes
