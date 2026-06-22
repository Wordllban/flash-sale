# 08 — RabbitMQ topology (golevelup)

**Phase:** 1 · **Depends on:** #01 · **Implements:** ADR-008, ADR-009 (topology)

## Goal
Set up `@golevelup/nestjs-rabbitmq` and declare the full topology: the main exchange/queue for order
persistence, plus the dead-letter + retry plumbing that #14 will use.

## Concepts you'll learn
- AMQP **exchange / routing key / queue / binding** — the routing layer in front of a queue.
- **Durable** exchanges/queues and **persistent** messages (survive broker restart).
- **Dead-letter exchange (DLX)** and a **TTL retry queue** (delayed redelivery).
- **prefetch** and **manual ack** configuration; **publisher confirms** + auto-reconnect.

## Steps
1. `pnpm add @golevelup/nestjs-rabbitmq amqplib`.
2. `RabbitMQModule.forRoot` with `uri = RABBITMQ_URL`, `connectionInitOptions`, and channels with
   `prefetchCount: 1`. Declare topology:
   - exchange `orders` (type `direct`, durable).
   - queue `orders.persist` (durable) bound with routing key `order.approved`;
     `deadLetterExchange: orders.dlx`.
   - exchange `orders.dlx` (durable) + queue `orders.retry` (durable) with
     `messageTtl` (e.g. 5s) and `deadLetterExchange` back to `orders` (delayed retry loop).
   - queue `orders.parking` (durable) — the terminal DLQ for exhausted/poison messages (#14).
3. Enable **publisher confirms** on the channel the relay (#09) will use.
4. Document each binding in a short comment/diagram so the retry flow is legible.

## Acceptance criteria
- [ ] App connects to RabbitMQ; topology visible in the management UI (http://localhost:15672).
- [ ] `orders.persist` shows `prefetch=1` and a configured DLX.
- [ ] Retry queue has a TTL and dead-letters back to the main exchange.
- [ ] Killing/restarting RabbitMQ → app auto-reconnects (watch logs), no crash.

## Docs to read
- golevelup/nestjs-rabbitmq: https://github.com/golevelup/nestjs/tree/master/packages/rabbitmq
- RabbitMQ exchanges/bindings (tutorials): https://www.rabbitmq.com/tutorials
- Dead Letter Exchanges: https://www.rabbitmq.com/docs/dlx
- TTL: https://www.rabbitmq.com/docs/ttl
- Consumer prefetch: https://www.rabbitmq.com/docs/consumer-prefetch
- Publisher confirms: https://www.rabbitmq.com/docs/confirms
