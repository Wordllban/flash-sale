# 04 — Sales module + activate (seed Redis)

**Phase:** 1 · **Depends on:** #02, #03 · **Implements:** ADR-012

## Goal
Manage flash sales and the **activate** step that seeds Redis stock from Postgres before a sale
opens. This is the controlled, race-free way the counter gets its starting value.

## Concepts you'll learn
- Module/service/controller separation and DI across modules.
- Why **explicit activation** beats lazy seeding (ADR-012): a mid-sale Redis loss must never
  re-seed to full stock.
- Idempotent seeding with `SET` + `DEL buyers`.

## Steps
1. `SalesModule` with `SalesService` (imports Prisma + Redis/Inventory).
2. Endpoints (admin-ish for now; merchant auth comes later):
   - `POST /sales` — create a `FlashSale` (name, totalStock) in `DRAFT`.
   - `POST /sales/:id/activate` — set status `ACTIVE`, then seed Redis:
     `SET stock:{id} = totalStock`, `DEL buyers:{id}`. Idempotent.
   - `GET /sales/:id` — status + `remaining` (read `stock:{id}` from Redis).
3. Guard the mutating endpoints (reuse #05 once built; for now a simple admin check is fine).

## Acceptance criteria
- [ ] Creating a sale persists a `DRAFT` row.
- [ ] Activating sets `ACTIVE` and seeds `stock:{id}` = `totalStock`, clears `buyers:{id}`.
- [ ] Re-activating is safe (idempotent) and does not increase already-sold counts incorrectly.
- [ ] `GET /sales/:id` reports live `remaining` from Redis.

## Docs to read
- NestJS modules: https://docs.nestjs.com/modules
- NestJS providers / DI: https://docs.nestjs.com/providers
- NestJS controllers: https://docs.nestjs.com/controllers
- Redis SET/DEL: https://redis.io/docs/latest/commands/set/ · https://redis.io/docs/latest/commands/del/
