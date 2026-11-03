import crypto from "node:crypto";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { redis } from "./redis.js";

/**
 * Post a "sender hit its hourly limit" alert to the campaign owner's Slack.
 * Sent at most once per sender per hour (Redis SET NX acts as the dedupe flag).
 * Never throws — an alert problem must not break email processing.
 */
export async function sendRateLimitAlert(opts: {
  userId: number;
  senderId: number;
  senderName: string;
  hour: string;
  limit: number;
  rescheduledTo: Date;
}) {
  try {
    const first = await redis.set(`rl-alert:${opts.senderId}:${opts.hour}`, "1", "EX", 7200, "NX");
    if (first !== "OK") return; // already alerted this hour

    const conn = await prisma.slackConnection.findUnique({ where: { userId: opts.userId } });
    if (!conn) return; // user hasn't connected Slack — skip silently

    const text =
      `⚠️ Sender ${opts.senderName} hit its hourly limit (${opts.limit}/hr). ` +
      `Remaining emails rescheduled to ${opts.rescheduledTo.toISOString()}.`;
    const res = await fetch(conn.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) console.error(`Slack alert failed: ${res.status}`);
  } catch (err) {
    console.error("Slack alert error:", err);
  }
}

// ---------- OAuth ("Add to Slack" with the incoming-webhook scope) ----------

const redirectUri = () => `${config.BACKEND_PUBLIC_URL}/api/slack/callback`;

/** Build the Slack authorize URL. `state` maps back to the user (stored in Redis for 10 min). */
export async function createInstallUrl(userId: number) {
  const state = crypto.randomBytes(16).toString("hex");
  await redis.set(`slack-state:${state}`, String(userId), "EX", 600);
  const params = new URLSearchParams({
    client_id: config.SLACK_CLIENT_ID,
    scope: "incoming-webhook",
    state,
    redirect_uri: redirectUri(),
  });
  return `https://slack.com/oauth/v2/authorize?${params}`;
}

/** Exchange the OAuth code and save the webhook for the user who started the flow. */
export async function completeInstall(code: string, state: string) {
  // GETDEL: a state can only be used once.
  const userId = await redis.getdel(`slack-state:${state}`);
  if (!userId) throw new Error("Invalid or expired state");

  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.SLACK_CLIENT_ID,
      client_secret: config.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri(),
    }),
  });
  const data = (await res.json()) as {
    ok: boolean;
    error?: string;
    incoming_webhook?: { url: string; channel: string };
    team?: { name: string };
  };
  if (!data.ok || !data.incoming_webhook) throw new Error(`Slack OAuth failed: ${data.error}`);

  const fields = {
    webhookUrl: data.incoming_webhook.url,
    channel: data.incoming_webhook.channel,
    teamName: data.team?.name ?? "",
  };
  await prisma.slackConnection.upsert({
    where: { userId: Number(userId) },
    update: fields,
    create: { userId: Number(userId), ...fields },
  });
}
