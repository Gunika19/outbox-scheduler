import { Router } from "express";
import { prisma } from "../db.js";
import { searchEmailIds } from "../search.js";
import type { Prisma } from "@prisma/client";

export const emailsRouter = Router();

const include = { campaign: { select: { subject: true } }, sender: { select: { name: true } } } as const;
type EmailRow = Prisma.EmailGetPayload<{ include: typeof include }>;

function toDto(e: EmailRow) {
  return {
    id: e.id,
    recipient: e.recipient,
    subject: e.campaign.subject,
    senderName: e.sender.name,
    status: e.status,
    scheduledAt: e.scheduledAt,
    sentAt: e.sentAt,
    previewUrl: e.previewUrl,
    error: e.error,
  };
}

// GET /api/emails?status=scheduled|sent
// "scheduled" tab also shows in-flight 'sending'; "sent" tab also shows 'failed'.
emailsRouter.get("/", async (req, res) => {
  const tab = req.query.status === "sent" ? "sent" : "scheduled";
  const emails = await prisma.email.findMany({
    where: {
      campaign: { userId: req.user!.id },
      status: { in: tab === "sent" ? ["sent", "failed"] : ["scheduled", "sending"] },
    },
    orderBy: tab === "sent" ? { updatedAt: "desc" } : { scheduledAt: "desc" },
    take: 500,
    include,
  });
  res.json(emails.map(toDto));
});

// GET /api/emails/search?q=
// Elasticsearch finds the ids and Postgres supplies fresh rows. If Elasticsearch is
// not configured or unreachable, Postgres does the matching itself (ILIKE on
// recipient, subject and body; Prisma's `mode: "insensitive"` compiles to ILIKE).
emailsRouter.get("/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) {
    res.json([]);
    return;
  }
  const userId = req.user!.id;
  const ids = await searchEmailIds(userId, q);

  if (ids === null) {
    const match = { contains: q, mode: "insensitive" } as const;
    const rows = await prisma.email.findMany({
      where: {
        campaign: { userId },
        OR: [{ recipient: match }, { campaign: { subject: match } }, { campaign: { body: match } }],
      },
      orderBy: { scheduledAt: "desc" },
      take: 50,
      include,
    });
    res.json(rows.map(toDto));
    return;
  }

  const rows = await prisma.email.findMany({
    where: { id: { in: ids }, campaign: { userId } },
    include,
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  res.json(ids.flatMap((id) => (byId.has(id) ? [toDto(byId.get(id)!)] : [])));
});
