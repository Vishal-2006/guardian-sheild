"use client";

import { Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";

function compact(address: string): string {
  return address ? `${address.slice(0, 8)}...${address.slice(-6)}` : "";
}

export function CyberSidebar() {
  const router = useRouter();
  const walletAddress = useSyncExternalStore(
    () => () => {},
    () => window.localStorage.getItem("guardian_wallet_address") || "",
    () => "",
  );

  const logout = () => {
    window.localStorage.removeItem("guardian_wallet_address");
    router.push("/");
  };

  return (
    <aside className="sticky top-0 z-20 flex h-screen w-72 flex-col justify-between border-r border-violet-400/25 bg-[#04050d]/85 p-4 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-blue-300" />
        <span className="text-sm font-bold tracking-wider text-blue-100">Guardian Shield</span>
      </div>

      <div className="rounded-2xl border border-blue-400/30 bg-[#080b18]/80 p-3">
        <p className="text-[10px] uppercase tracking-wider text-blue-300/70">Wallet</p>
        <p className="mt-1 text-xs font-medium text-blue-100">{walletAddress ? compact(walletAddress) : "Not Connected"}</p>
        <p className={`mt-1 text-[11px] ${walletAddress ? "text-emerald-300" : "text-amber-300"}`}>
          {walletAddress ? "Connected" : "Not Connected"}
        </p>

        <button
          type="button"
          onClick={logout}
          className="mt-3 w-full rounded-lg border border-violet-400/45 bg-gradient-to-r from-violet-500/20 to-blue-500/20 px-2 py-2 text-xs font-semibold text-blue-50 transition hover:from-violet-500/30 hover:to-blue-500/30"
        >
          Logout
        </button>
      </div>
    </aside>
  );
}

