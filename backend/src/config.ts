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
  ELASTICSEARCH_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().default(""),
  SLACK_CLIENT_ID: z.string().default(""),
  SLACK_CLIENT_SECRET: z.string().default(""),
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
