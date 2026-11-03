import { redis } from "./redis.js";

// Hour bucket in UTC, e.g. "2026110316" for 16:00–16:59 UTC on 2026-11-03.
export function hourBucket(date = new Date()): string {
  return date.toISOString().slice(0, 13).replace(/[-T]/g, "");
}

/**
 * Reserve one send slot for this sender in the current UTC hour.
 *
 * INCR is atomic in Redis, so even with many workers running in parallel each
 * one gets a unique count. If the count is over the limit we DECR to give the
 * slot back (we're not going to send) and report "not allowed".
 * The key expires after 2h so old buckets clean themselves up.
 */
export async function tryReserveSlot(senderId: number, limit: number) {
  const hour = hourBucket();
  const key = `rl:${senderId}:${hour}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 7200);

  if (count > limit) {
    await redis.decr(key);
    return { allowed: false as const, hour };
  }
  return { allowed: true as const, hour };
}

/** Start of the next UTC hour. */
export function startOfNextHour(now = new Date()): Date {
  const d = new Date(now);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(d.getUTCHours() + 1);
  return d;
}
