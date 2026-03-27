"use client";

import GuardianShieldDashboard from "@/components/guardian-shield-dashboard";
import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const hasWalletSession = useSyncExternalStore(
    () => () => {},
    () => Boolean(window.localStorage.getItem("guardian_wallet_address")),
    () => false,
  );

  useEffect(() => {
    if (hydrated && !hasWalletSession) {
      router.replace("/");
    }
  }, [hasWalletSession, hydrated, router]);

  if (!hydrated || !hasWalletSession) {
    return (
      <main className="p-8">
        <p className="text-sm text-blue-200/80">Loading wallet session...</p>
        <Link href="/" className="mt-4 inline-block text-sm text-blue-300 hover:text-blue-200">
          Go to landing
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
      <GuardianShieldDashboard />
    </main>
  );
}
