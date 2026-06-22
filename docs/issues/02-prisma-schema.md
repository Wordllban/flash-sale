# 02 — Prisma schema & migrations

**Phase:** 0 — Foundation · **Depends on:** #01

## Goal
Model the durable store: `FlashSale`, `Order` (with the oversell backstop), and an append-only
`InventoryLedger`. Wire a `PrismaModule`/`PrismaService` and a seed script.

## Concepts you'll learn
- **Prisma** schema, migrations, and the generated type-safe client.
- **Unique constraints as a safety net**: `@@unique([userId, saleId])` is the *last* line of
  defence against oversell/dupes even though Redis is the primary guard.
- **Append-only ledger**: an immutable audit log; reconciliation compares it to Redis.
- **`PrismaService`** lifecycle: connect on module init, disconnect on shutdown.

## Steps
1. `pnpm add prisma @prisma/client && pnpm prisma init` (uses `DATABASE_URL` from #01).
2. Define models:
   ```prisma
   model FlashSale {
     id         String   @id @default(uuid())
     name       String
     totalStock Int
     status     SaleStatus @default(DRAFT) // DRAFT | ACTIVE | ENDED
     merchantId String?  // forward-compat for the merchant module
     createdAt  DateTime @default(now())
     orders     Order[]
     ledger     InventoryLedger[]
   }
   model Order {
     id        String   @id @default(uuid())
     saleId    String
     userId    String
     status    OrderStatus @default(CONFIRMED)
     createdAt DateTime @default(now())
     sale      FlashSale @relation(fields: [saleId], references: [id])
     @@unique([userId, saleId]) // 1-per-customer backstop
   }
   model InventoryLedger {
     id        String   @id @default(uuid())
     saleId    String
     userId    String
     delta     Int      // -1 per sale
     orderId   String   @unique // idempotent consumer key
     createdAt DateTime @default(now())
     sale      FlashSale @relation(fields: [saleId], references: [id])
   }
   ```
3. `pnpm prisma migrate dev --name init`.
4. Create `PrismaModule` + `PrismaService extends PrismaClient` (connect in `onModuleInit`,
   register shutdown). Export it as a global module.
5. Seed script (`prisma/seed.ts`): create one demo `FlashSale` + a handful of demo sessions/users.
6. Wire the real Postgres indicator into `/health` (from #01).

## Acceptance criteria
- [ ] `pnpm prisma migrate dev` creates the three tables.
- [ ] `Order` rejects a duplicate `(userId, saleId)` at the DB level.
- [ ] `InventoryLedger.orderId` is unique (consumer idempotency key).
- [ ] `PrismaService` connects on boot and disconnects on shutdown.
- [ ] `pnpm prisma db seed` inserts a demo sale.
- [ ] `/health` Postgres check is live.

## Docs to read
- NestJS + Prisma recipe: https://docs.nestjs.com/recipes/prisma
- Prisma schema: https://www.prisma.io/docs/orm/prisma-schema
- Prisma migrate: https://www.prisma.io/docs/orm/prisma-migrate
- Unique constraints: https://www.prisma.io/docs/orm/prisma-schema/data-model/indexes
- Prisma seeding: https://www.prisma.io/docs/orm/prisma-migrate/workflows/seeding
