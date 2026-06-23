import { defineConfig, env } from 'prisma/config';

// Prisma 7 doesn't auto-load .env. Use Node's built-in loader (no dotenv dep);
// guarded so real environments that inject vars directly don't need a file.
try {
  process.loadEnvFile();
} catch {
  // .env absent — assume DATABASE_URL is already in the environment.
}

/**
 * Prisma 7 moved CLI config out of schema.prisma into this file (ADR-002).
 * It tells the CLI where the schema/migrations live, how to seed, and which
 * connection string to use.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
