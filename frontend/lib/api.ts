import { signOut } from "next-auth/react";
import type { CreateCampaignInput, CreateCampaignResponse, Email, MeResponse } from "@/types/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** fetch wrapper: adds the Google id_token as Bearer and parses JSON. */
async function request<T>(token: string | undefined, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  // Token expired/invalid → simplest recovery: sign out and go back to login.
  if (res.status === 401) {
    await signOut({ callbackUrl: "/" });
    throw new ApiError(401, "Session expired — please sign in again");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  me: (t?: string) => request<MeResponse>(t, "/api/me"),
  listEmails: (t: string | undefined, status: "scheduled" | "sent") =>
    request<Email[]>(t, `/api/emails?status=${status}`),
  searchEmails: (t: string | undefined, q: string) =>
    request<Email[]>(t, `/api/emails/search?q=${encodeURIComponent(q)}`),
  createCampaign: (t: string | undefined, input: CreateCampaignInput) =>
    request<CreateCampaignResponse>(t, "/api/campaigns", { method: "POST", body: JSON.stringify(input) }),
  slackInstallUrl: (t?: string) => request<{ url: string }>(t, "/api/slack/install-url"),
  disconnectSlack: (t?: string) => request<void>(t, "/api/slack", { method: "DELETE" }),
};
