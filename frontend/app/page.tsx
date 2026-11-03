"use client";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold">ReachInbox Scheduler</h1>
        <p className="mt-2 text-sm text-gray-500">Schedule and track email campaigns.</p>
        <div className="mt-8">
          {status === "loading" || status === "authenticated" ? (
            <Spinner />
          ) : (
            <Button className="w-full" onClick={() => signIn("google", { callbackUrl: "/dashboard" })}>
              Sign in with Google
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
