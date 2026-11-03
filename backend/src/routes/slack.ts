import { Router, type RequestHandler } from "express";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { createInstallUrl, completeInstall } from "../slack.js";

export const slackRouter = Router();

slackRouter.get("/install-url", async (req, res) => {
  res.json({ url: await createInstallUrl(req.user!.id) });
});

slackRouter.delete("/", async (req, res) => {
  await prisma.slackConnection.deleteMany({ where: { userId: req.user!.id } });
  res.status(204).end();
});

// Public: Slack redirects the browser here, so there is no bearer token.
// The one-time `state` identifies the user instead.
export const slackCallback: RequestHandler = async (req, res) => {
  const { code, state } = req.query;
  try {
    if (typeof code !== "string" || typeof state !== "string") throw new Error("Missing code/state");
    await completeInstall(code, state);
    res.redirect(`${config.FRONTEND_URL}/dashboard?slack=connected`);
  } catch (err) {
    console.error(err);
    res.redirect(`${config.FRONTEND_URL}/dashboard?slack=error`);
  }
};
