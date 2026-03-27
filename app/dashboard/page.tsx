"use client";

import GuardianShieldDashboard from "@/components/guardian-shield-dashboard";
import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const hasWalletSession = useSyncExternalStore(
    () => () => {},
    () => Boolean(window.localStorage.getItem("guardian_wallet_address")),
    () => false,
  );

  useEffect(() => {
    if (!hasWalletSession) {
      router.replace("/");
    }
  }, [hasWalletSession, router]);

  if (!hasWalletSession) {
    return (
      <main className="p-8">
        <p className="text-sm text-amber-300">Wallet not connected.</p>
        <Link href="/" className="mt-4 inline-block text-sm text-blue-300 hover:text-blue-200">
          Go back to landing
        </Link>
      </main>
    );
  }

  return <GuardianShieldDashboard />;
}
