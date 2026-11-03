import { Worker, DelayedError, type Job } from "bullmq";
import nodemailer, { type Transporter } from "nodemailer";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { redis } from "./redis.js";
import { QUEUE_NAME, type EmailJobData } from "./queue.js";
import { tryReserveSlot, startOfNextHour } from "./rateLimit.js";
import { sendRateLimitAlert } from "./slack.js";
import { updateEmailDoc } from "./search.js";

// One SMTP transporter per sender, reused across jobs.
const transporters = new Map<number, Transporter>();
function transporterFor(sender: { id: number; smtpUser: string; smtpPass: string }) {
  let t = transporters.get(sender.id);
  if (!t) {
    t = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      auth: { user: sender.smtpUser, pass: sender.smtpPass },
    });
    transporters.set(sender.id, t);
  }
  return t;
}

async function processEmail(job: Job<EmailJobData>, token?: string) {
  const { emailId } = job.data;

  // 1. CLAIM (idempotency). Atomically flip scheduled → sending. Only one worker
  //    can win this update; anyone else (duplicate job, retry after success,
  //    parallel worker) sees count 0 and stops. This is what prevents double sends.
  const claim = await prisma.email.updateMany({
    where: { id: emailId, status: "scheduled" },
    data: { status: "sending" },
  });
  if (claim.count === 0) return { skipped: true };

  const email = await prisma.email.findUniqueOrThrow({
    where: { id: emailId },
    include: { campaign: true, sender: true },
  });

  // 2. RATE LIMIT. Effective limit = stricter of campaign setting and global env cap.
  const limit = Math.min(email.campaign.hourlyLimit, config.MAX_EMAILS_PER_HOUR_PER_SENDER);
  const slot = await tryReserveSlot(email.senderId, limit);
  if (!slot.allowed) {
    // Over the limit: never drop or fail — push to the next hour.
    // The small per-id offset keeps emails roughly in their original order.
    const nextHour = new Date(startOfNextHour().getTime() + (email.id % 1000) * 10);
    await prisma.email.update({
      where: { id: emailId },
      data: { status: "scheduled", scheduledAt: nextHour },
    });
    await updateEmailDoc(emailId, { status: "scheduled", scheduledAt: nextHour });
    await sendRateLimitAlert({
      userId: email.campaign.userId,
      senderId: email.senderId,
      senderName: email.sender.name,
      hour: slot.hour,
      limit,
      rescheduledTo: nextHour,
    });
    // Move this same job back to the delayed set. DelayedError tells BullMQ
    // "not a failure, don't count an attempt".
    await job.moveToDelayed(nextHour.getTime(), token);
    throw new DelayedError();
  }

  // 3. SEND.
  try {
    const info = await transporterFor(email.sender).sendMail({
      from: `"${email.sender.name}" <${email.sender.smtpUser}>`,
      to: email.recipient,
      subject: email.campaign.subject,
      text: email.campaign.body,
    });
    const sentAt = new Date();
    const previewUrl = nodemailer.getTestMessageUrl(info) || null;
    await prisma.email.update({
      where: { id: emailId },
      data: { status: "sent", sentAt, messageId: info.messageId, previewUrl, error: null },
    });
    await updateEmailDoc(emailId, { status: "sent", sentAt });
    return { sent: true, previewUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const attempts = job.opts.attempts ?? 1;
    const isFinal = job.attemptsMade >= attempts - 1;
    // Final attempt → mark failed. Otherwise release the claim so the retry can claim again.
    await prisma.email.update({
      where: { id: emailId },
      data: isFinal ? { status: "failed", error: message } : { status: "scheduled", error: message },
    });
    await updateEmailDoc(emailId, { status: isFinal ? "failed" : "scheduled" });
    throw err; // let BullMQ apply backoff / record failure
  }
}

export function startWorker() {
  const worker = new Worker<EmailJobData>(QUEUE_NAME, processEmail, {
    connection: redis,
    concurrency: config.WORKER_CONCURRENCY,
    // Global (queue-wide) throttle: at most 1 job per MIN_DELAY_BETWEEN_SENDS_MS.
    limiter: { max: 1, duration: config.MIN_DELAY_BETWEEN_SENDS_MS },
  });
  worker.on("completed", (job, result) => console.log(`job ${job.id} done`, result));
  worker.on("failed", (job, err) => console.error(`job ${job?.id} failed: ${err.message}`));
  worker.on("error", (err) => console.error("worker error:", err));
  return worker;
}
