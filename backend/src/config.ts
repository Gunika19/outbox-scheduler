import { z } from "zod";

// Load backend/.env if present (Node's built-in loader; no dotenv needed).
try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the real environment
}

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: z.string().url(),
  BACKEND_PUBLIC_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  // Optional: without it (or if it's unreachable) search falls back to Postgres ILIKE.
  ELASTICSEARCH_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
  GOOGLE_CLIENT_ID: z.string().default(""),
  SLACK_CLIENT_ID: z.string().default(""),
  SLACK_CLIENT_SECRET: z.string().default(""),
  // Bull Board (/admin/queues) is behind HTTP basic auth.
  BULL_BOARD_USER: z.string().min(1),
  BULL_BOARD_PASS: z.string().min(8),
  // All throughput limits come from env — never hardcoded.
  WORKER_CONCURRENCY: z.coerce.number().int().positive(),
  MIN_DELAY_BETWEEN_SENDS_MS: z.coerce.number().int().nonnegative(),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().positive(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const config = parsed.data;
