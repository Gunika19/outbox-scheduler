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
