"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Header } from "@/components/Header";
import { EmailTable } from "@/components/EmailTable";
import { ComposeModal } from "@/components/ComposeModal";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { toast } from "@/components/ui/Toast";
import type { Email, MeResponse } from "@/types/api";

type Tab = "scheduled" | "sent";
const POLL_MS = 5000; // UI refresh only — sending is scheduled by BullMQ on the backend

function Dashboard() {
  // required: true → unauthenticated visitors are redirected to the sign-in page ("/").
  const { data: session, status } = useSession({ required: true });
  const token = session?.idToken;
  const router = useRouter();
  const searchParams = useSearchParams();

  const [me, setMe] = useState<MeResponse | null>(null);
  const [tab, setTab] = useState<Tab>("scheduled");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  // Each result remembers which view (tab or search) it belongs to, so switching
  // views shows a spinner until that view's data arrives.
  const viewKey = debouncedQuery ? `search:${debouncedQuery}` : `tab:${tab}`;
  const [result, setResult] = useState<{ key: string; emails: Email[] } | null>(null);
  const loading = result?.key !== viewKey;
  const emails = loading ? [] : result.emails;
  const [composeOpen, setComposeOpen] = useState(false);

  const loadMe = useCallback(() => {
    if (token) api.me(token).then(setMe).catch((e) => toast.error(e.message));
  }, [token]);

  const [refreshTick, setRefreshTick] = useState(0);
  const refresh = useCallback(() => setRefreshTick((n) => n + 1), []);

  useEffect(loadMe, [loadMe]);

  // Debounce search input by 300ms.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Load now, then refresh every 5s while this view is open.
  useEffect(() => {
    if (!token) return;
    let cancelled = false; // ignore responses that arrive after we switched views
    const load = () =>
      (debouncedQuery ? api.searchEmails(token, debouncedQuery) : api.listEmails(token, tab))
        .then((data) => !cancelled && setResult({ key: viewKey, emails: data }))
        .catch((e) => {
          if (cancelled) return;
          toast.error((e as Error).message, { id: "load-error" });
          setResult((prev) => (prev?.key === viewKey ? prev : { key: viewKey, emails: [] }));
        });
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token, tab, debouncedQuery, viewKey, refreshTick]);

  // Result of the Slack OAuth redirect.
  useEffect(() => {
    const slack = searchParams.get("slack");
    if (!slack) return;
    if (slack === "connected") toast.success("Slack connected");
    else toast.error("Slack connection failed");
    router.replace("/dashboard");
  }, [searchParams, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header me={me} token={token} onChange={loadMe} />
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            tabs={[{ value: "scheduled", label: "Scheduled" }, { value: "sent", label: "Sent" }]}
            value={tab}
            onChange={(v) => {
              setTab(v);
              setQuery("");
            }}
          />
          <Button onClick={() => setComposeOpen(true)}>Compose New Email</Button>
        </div>

        <Input
          placeholder="Search by recipient, subject or body…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <EmailTable
          emails={emails}
          loading={loading}
          emptyTitle={debouncedQuery ? "No matching emails" : tab === "scheduled" ? "No scheduled emails" : "No sent emails yet"}
        />
      </main>

      <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} token={token} onCreated={refresh} />
    </div>
  );
}

// useSearchParams needs a Suspense boundary in the App Router.
export default function DashboardPage() {
  return (
    <Suspense>
      <Dashboard />
    </Suspense>
  );
}
