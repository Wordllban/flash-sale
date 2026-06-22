import { z } from 'zod';

/**
 * The process role (ADR-010). One image, conditional module registration:
 *  - api    → HTTP only
 *  - worker → relay + consumer + scheduled jobs
 *  - all    → everything (default; used in dev)
 */
export const APP_ROLES = ['api', 'worker', 'all'] as const;
export type AppRole = (typeof APP_ROLES)[number];

/** Scheme-agnostic URL check (accepts postgres://, redis://, amqp:// …). */
const url = (label: string) =>
  z.string().refine(
    (value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: `${label} must be a valid connection URL` },
  );

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  APP_ROLE: z.enum(APP_ROLES).default('all'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  DATABASE_URL: url('DATABASE_URL'),
  REDIS_URL: url('REDIS_URL'),
  RABBITMQ_URL: url('RABBITMQ_URL'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Used by ConfigModule.forRoot({ validate }). Fails fast at boot with a
 * readable list of problems if any required env var is missing/invalid.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}
