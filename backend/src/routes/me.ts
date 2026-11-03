import { Router } from "express";
import { prisma } from "../db.js";

export const meRouter = Router();

meRouter.get("/", async (req, res) => {
  const slack = await prisma.slackConnection.findUnique({ where: { userId: req.user!.id } });
  res.json({
    user: req.user,
    slackConnected: !!slack,
    slackChannel: slack?.channel ?? null,
    slackTeam: slack?.teamName ?? null,
  });
});
