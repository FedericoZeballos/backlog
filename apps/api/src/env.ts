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

  // AI. Users pick provider and model; endpoints and keys live only here.
  AI_PROVIDER: z.enum(['OLLAMA', 'ANTHROPIC', 'FAKE']).default('OLLAMA'),
  OLLAMA_BASE_URL: z.url().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().default('qwen2.5:7b'),
  /** Context window requested from Ollama; prompts with candidates need more than its 4k default. */
  OLLAMA_NUM_CTX: z.coerce.number().int().min(2048).default(8192),
  ANTHROPIC_API_KEY: z.string().optional().transform((v) => v || undefined),
  ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),
  /** Local 7B models on a 4 GB GPU take 2–4 minutes for a plan. */
  AI_TIMEOUT_MS: z.coerce.number().int().min(5_000).default(360_000),
});

export const env = EnvSchema.parse(process.env);
