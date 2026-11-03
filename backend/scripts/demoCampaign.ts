// Phase-2 test helper: creates a demo user + campaign without going through Google auth.
// Usage: npx tsx scripts/demoCampaign.ts [count] [delayMs] [hourlyLimit]
import { prisma } from "../src/db.js";
import { createCampaign } from "../src/routes/campaigns.js";
import { emailQueue } from "../src/queue.js";
import { redis } from "../src/redis.js";

const [count = "5", delayMs = "3000", hourlyLimit = "3"] = process.argv.slice(2);

const user = await prisma.user.upsert({
  where: { googleId: "demo" },
  update: {},
  create: { googleId: "demo", email: "demo@example.com", name: "Demo User" },
});
const result = await createCampaign(user.id, {
  subject: "Hello from the scheduler",
  body: "This is a test email.",
  recipients: Array.from({ length: Number(count) }, (_, i) => `person${i + 1}@example.com`),
  startTime: new Date(Date.now() + 5000).toISOString(),
  delayMs: Number(delayMs),
  hourlyLimit: Number(hourlyLimit),
});
console.log(`campaign ${result.campaign.id}: ${result.emailCount} emails queued`);
await emailQueue.close();
await redis.quit();
await prisma.$disconnect();
