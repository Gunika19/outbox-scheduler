import { prisma } from "./db.js";
import { addEmailJobs } from "./queue.js";

/**
 * Runs ONCE at boot (not on a timer). Makes the DB and the queue agree after a crash.
 *
 * - 'sending' rows older than 5 min belong to a worker that died mid-job → back to 'scheduled'.
 * - Every 'scheduled' email gets (re)added to the queue. Because jobIds are
 *   `email-{id}`, ones still in Redis are ignored, and any lost ones come back.
 */
export async function reconcile() {
  const stale = await prisma.email.updateMany({
    where: { status: "sending", updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) } },
    data: { status: "scheduled" },
  });

  const scheduled = await prisma.email.findMany({
    where: { status: "scheduled" },
    select: { id: true, scheduledAt: true },
  });
  // addBulk in chunks to keep Redis round-trips reasonable
  for (let i = 0; i < scheduled.length; i += 500) {
    await addEmailJobs(scheduled.slice(i, i + 500));
  }
  console.log(`reconcile: reset ${stale.count} stale 'sending', ensured ${scheduled.length} scheduled jobs`);
}
