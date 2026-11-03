import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { redis } from "./redis.js";
import { startWorker } from "./worker.js";
import { reconcile } from "./reconcile.js";
import { ensureIndex } from "./search.js";

const app = express();
app.use(cors({ origin: config.FRONTEND_URL }));
app.use(express.json({ limit: "5mb" }));

app.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  const pong = await redis.ping();
  res.json({ ok: true, db: "up", redis: pong });
});

// Routes (campaigns, emails, me, slack) are mounted in phase 3 behind auth.

async function main() {
  await ensureIndex().catch((err) => console.error("Elasticsearch unavailable:", err.message));
  await reconcile(); // once at boot — not on a timer
  startWorker(); // same process for simplicity; could run as its own process
  app.listen(config.PORT, () => console.log(`API listening on http://localhost:${config.PORT}`));
}

main().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});
