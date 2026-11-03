"use client";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import type { MeResponse } from "@/types/api";

export function Header({ me, token, onChange }: {
  me: MeResponse | null;
  token?: string;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function connectSlack() {
    setBusy(true);
    try {
      const { url } = await api.slackInstallUrl(token);
      window.location.href = url; // Slack redirects back to /dashboard?slack=connected
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  }

  async function disconnectSlack() {
    setBusy(true);
    try {
      await api.disconnectSlack(token);
      toast.success("Slack disconnected");
      onChange();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const user = me?.user;
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3">
        <span className="font-semibold">ReachInbox Scheduler</span>
        <div className="flex flex-wrap items-center gap-3">
          {me &&
            (me.slackConnected ? (
              <Button variant="secondary" onClick={disconnectSlack} disabled={busy} title={`#${me.slackChannel} · ${me.slackTeam}`}>
                Disconnect Slack
              </Button>
            ) : (
              <Button variant="secondary" onClick={connectSlack} disabled={busy}>
                Connect Slack
              </Button>
            ))}
          {user && (
            <div className="flex items-center gap-2">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <div className="h-8 w-8 rounded-full bg-gray-200" />
              )}
              <div className="text-sm leading-tight">
                <div className="font-medium">{user.name}</div>
                <div className="text-gray-500">{user.email}</div>
              </div>
            </div>
          )}
          <Button variant="secondary" onClick={() => signOut({ callbackUrl: "/" })}>
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
}
