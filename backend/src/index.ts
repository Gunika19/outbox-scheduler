import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { redis } from "./redis.js";
import { emailQueue } from "./queue.js";
import { startWorker } from "./worker.js";
import { reconcile } from "./reconcile.js";
import { ensureIndex } from "./search.js";
import { requireAuth } from "./auth.js";
import { basicAuth } from "./basicAuth.js";
import { campaignsRouter } from "./routes/campaigns.js";
import { emailsRouter } from "./routes/emails.js";
import { meRouter } from "./routes/me.js";
import { slackRouter, slackCallback } from "./routes/slack.js";

const app = express();
app.use(cors({ origin: config.FRONTEND_URL }));
app.use(express.json({ limit: "5mb" }));

// ---- Routes without Google auth ----
app.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  const pong = await redis.ping();
  res.json({ ok: true, db: "up", redis: pong });
});

const bullBoard = new ExpressAdapter();
bullBoard.setBasePath("/admin/queues");
createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter: bullBoard });
app.use("/admin/queues", basicAuth(config.BULL_BOARD_USER, config.BULL_BOARD_PASS), bullBoard.getRouter());

app.get("/api/slack/callback", slackCallback);

// ---- Authenticated API ----
app.use("/api", requireAuth);
app.use("/api/campaigns", campaignsRouter);
app.use("/api/emails", emailsRouter);
app.use("/api/me", meRouter);
app.use("/api/slack", slackRouter);

// Express 5 forwards async errors here.
const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
};
app.use(onError);

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
