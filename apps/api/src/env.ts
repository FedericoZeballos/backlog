import { z } from 'zod';

// Tests inject their own DATABASE_URL; everything else reads apps/api/.env.
if (!process.env.VITEST) {
  try {
    process.loadEnvFile(new URL('../.env', import.meta.url));
  } catch {
    // No .env file: rely on the real environment.
  }
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'Falta DATABASE_URL (copiá apps/api/.env.example a apps/api/.env)'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().default(3000),
  APP_URL: z.url().default('http://localhost:5173'),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export const env = EnvSchema.parse(process.env);
