import { Queue, type JobsOptions } from "bullmq";
import { redis } from "./redis.js";

export const QUEUE_NAME = "email-send";

export type EmailJobData = { emailId: number };

export const emailQueue = new Queue<EmailJobData>(QUEUE_NAME, { connection: redis });

// Scheduling = a BullMQ *delayed* job. BullMQ stores the job in Redis with its
// due timestamp and hands it to a worker when that time arrives. No cron, no polling.
//
// jobId `email-{id}` makes adding idempotent: if a job with that id already
// exists in the queue, BullMQ ignores the duplicate add.
function jobFor(emailId: number, scheduledAt: Date) {
  const opts: JobsOptions = {
    jobId: `email-${emailId}`,
    delay: Math.max(0, scheduledAt.getTime() - Date.now()),
    removeOnComplete: true,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  };
  return { name: "send", data: { emailId }, opts };
}

export async function addEmailJob(emailId: number, scheduledAt: Date) {
  const job = jobFor(emailId, scheduledAt);
  await emailQueue.add(job.name, job.data, job.opts);
}

export async function addEmailJobs(emails: { id: number; scheduledAt: Date }[]) {
  if (emails.length === 0) return;
  await emailQueue.addBulk(emails.map((e) => jobFor(e.id, e.scheduledAt)));
}
