import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { addEmailJobs } from "../queue.js";
import { bulkIndexEmails } from "../search.js";

export const campaignInput = z.object({
  subject: z.string().min(1).max(500),
  body: z.string().min(1),
  recipients: z.array(z.string().trim().toLowerCase().pipe(z.email())).min(1),
  startTime: z.iso.datetime({ offset: true }),
  delayMs: z.number().int().nonnegative(),
  hourlyLimit: z.number().int().positive(),
});
export type CampaignInput = z.infer<typeof campaignInput>;

export async function createCampaign(userId: number, input: CampaignInput) {
  const recipients = [...new Set(input.recipients)];
  const senders = await prisma.sender.findMany({ orderBy: { id: "asc" } });
  if (senders.length === 0) throw new Error("No senders configured — run `npm run seed`");

  const start = new Date(input.startTime).getTime();

  // Campaign + all its emails in one transaction: either everything is saved or nothing is.
  const { campaign, emails } = await prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.create({
      data: {
        userId,
        subject: input.subject,
        body: input.body,
        startTime: new Date(start),
        delayMs: input.delayMs,
        hourlyLimit: input.hourlyLimit,
      },
    });
    // Email i is due at start + i*delay; senders are assigned round-robin.
    const emails = await tx.email.createManyAndReturn({
      data: recipients.map((recipient, i) => ({
        campaignId: campaign.id,
        senderId: senders[i % senders.length].id,
        recipient,
        scheduledAt: new Date(start + i * input.delayMs),
      })),
    });
    return { campaign, emails };
  });

  // Queue after the commit, so a worker never picks up a job whose row doesn't exist yet.
  // If the process crashes right here, startup reconciliation re-adds the jobs.
  await addEmailJobs(emails);

  await bulkIndexEmails(
    emails.map((e) => ({
      id: e.id,
      userId,
      campaignId: campaign.id,
      recipient: e.recipient,
      subject: campaign.subject,
      body: campaign.body,
      status: e.status,
      scheduledAt: e.scheduledAt,
    })),
  );

  return { campaign, emailCount: emails.length };
}

export const campaignsRouter = Router();

campaignsRouter.post("/", async (req, res) => {
  const parsed = campaignInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: z.prettifyError(parsed.error) });
    return;
  }
  const result = await createCampaign(req.user!.id, parsed.data);
  res.status(201).json(result);
});
