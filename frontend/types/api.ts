export type EmailStatus = "scheduled" | "sending" | "sent" | "failed";

export type Email = {
  id: number;
  recipient: string;
  subject: string;
  senderName: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  previewUrl: string | null;
  error: string | null;
};

export type User = {
  id: number;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

export type MeResponse = {
  user: User;
  slackConnected: boolean;
  slackChannel: string | null;
  slackTeam: string | null;
};

export type CreateCampaignInput = {
  subject: string;
  body: string;
  recipients: string[];
  startTime: string; // ISO
  delayMs: number;
  hourlyLimit: number;
};

export type CreateCampaignResponse = {
  campaign: { id: number };
  emailCount: number;
};
