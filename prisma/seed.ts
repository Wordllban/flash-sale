import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

// Native .env loading (Node 20.12+), no dotenv dependency.
try {
  process.loadEnvFile();
} catch {
  // .env absent — assume DATABASE_URL is already in the environment.
}

/**
 * Standalone seed (run via `pnpm db:seed`, configured in prisma.config.ts).
 *
 * This is NOT a Nest process, so there is no DI — we build our own client with
 * the same pg adapter the app uses. Idempotent: the demo sale has a FIXED id so
 * re-seeding upserts instead of piling up duplicates, and load tests can target
 * a known `saleId`.
 *
 * There is no User table by design (ADR-005): a "buyer" is just a session UUID
 * carried in the X-Session-Id header. So we print a handful of demo session ids
 * to use as buyers in checkout/load testing.
 */
const DEMO_SALE_ID = '11111111-1111-1111-1111-111111111111';
const DEMO_BUYER_COUNT = 5;

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const sale = await prisma.flashSale.upsert({
    where: { id: DEMO_SALE_ID },
    update: { name: 'Demo Drop — Limited Tee', totalStock: 100 },
    create: {
      id: DEMO_SALE_ID,
      name: 'Demo Drop — Limited Tee',
      totalStock: 100,
      status: 'DRAFT',
    },
  });

  const buyers = Array.from({ length: DEMO_BUYER_COUNT }, () => randomUUID());

  console.log('Seeded demo flash sale:');
  console.log(`  id:         ${sale.id}`);
  console.log(`  name:       ${sale.name}`);
  console.log(`  totalStock: ${sale.totalStock}`);
  console.log(`  status:     ${sale.status}`);
  console.log('\nDemo buyer session ids (use as X-Session-Id):');
  for (const id of buyers) console.log(`  ${id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
