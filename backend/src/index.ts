import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { redis } from "./redis.js";

const app = express();
app.use(cors({ origin: config.FRONTEND_URL }));
app.use(express.json({ limit: "5mb" }));

app.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  const pong = await redis.ping();
  res.json({ ok: true, db: "up", redis: pong });
});

app.listen(config.PORT, () => {
  console.log(`API listening on http://localhost:${config.PORT}`);
});
