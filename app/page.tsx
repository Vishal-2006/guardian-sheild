"use client";

import { motion } from "framer-motion";
import { getAddress, isConnected, requestAccess } from "@stellar/freighter-api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type FreighterApi = {
  requestAccess?: () => Promise<unknown>;
  getAddress?: () => Promise<{ address?: string } | string>;
};

declare global {
  interface Window {
    freighterApi?: FreighterApi;
    freighter?: FreighterApi;
  }
}

function readFreighterApi(): FreighterApi | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.freighterApi ?? window.freighter;
}

function compactAddress(address: string): string {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

export default function Home() {
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [error, setError] = useState("");
  const [hasFreighter, setHasFreighter] = useState(false);
  const [checkingWallet, setCheckingWallet] = useState(true);

  useEffect(() => {
    let active = true;

    const detectWallet = async () => {
      const injected = Boolean(readFreighterApi());
      let available = injected;

      try {
        const connected = await isConnected();
        if (!connected.error) {
          available = true;
        }
      } catch {
        // Keep injected detection as fallback.
      }

      if (active) {
        setHasFreighter(available);
        setCheckingWallet(false);
      }
    };

    detectWallet();

    return () => {
      active = false;
    };
  }, []);

  const hasRpc = Boolean(process.env.NEXT_PUBLIC_SOROBAN_RPC_URL);

  const walletLabel = useMemo(() => {
    if (walletAddress) {
      return `Connected: ${compactAddress(walletAddress)}`;
    }

    if (checkingWallet) {
      return "Checking wallet extension...";
    }

    return hasFreighter ? "Freighter detected" : "Freighter extension not found";
  }, [checkingWallet, hasFreighter, walletAddress]);

  const connectAndEnter = async () => {
    if (!hasFreighter) {
      setError("Freighter not detected. Enable the extension on this site and refresh.");
      return;
    }

    setConnecting(true);
    setError("");

    try {
      let address = "";

      const accessResult = await requestAccess();
      if (!accessResult.error && accessResult.address) {
        address = accessResult.address;
      }

      if (!address) {
        const addressResult = await getAddress();
        if (!addressResult.error && addressResult.address) {
          address = addressResult.address;
        }
      }

      if (!address) {
        const fallback = readFreighterApi();
        await fallback?.requestAccess?.();
        const fallbackAddress = await fallback?.getAddress?.();
        address =
          typeof fallbackAddress === "string"
            ? fallbackAddress
            : fallbackAddress?.address || "";
      }

      if (!address) {
        throw new Error("Wallet returned empty address.");
      }

      window.localStorage.setItem("guardian_wallet_address", address);
      setWalletAddress(address);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect wallet.");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_20%_12%,rgba(99,102,241,0.24),transparent_34%),radial-gradient(circle_at_80%_16%,rgba(168,85,247,0.2),transparent_34%),radial-gradient(circle_at_55%_86%,rgba(37,99,235,0.16),transparent_40%),linear-gradient(180deg,#050814_0%,#070c1d_45%,#070b1d_100%)]">

      <motion.div
        className="pointer-events-none absolute -top-24 left-20 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl"
        animate={{ y: [0, 30, 0], x: [0, 20, 0] }}
        transition={{ duration: 10, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute right-16 top-40 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl"
        animate={{ y: [0, -20, 0], x: [0, -10, 0] }}
        transition={{ duration: 9, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      />

      <header className="sticky top-0 z-20 border-b border-violet-400/20 bg-[#070b1f]/70 backdrop-blur-xl">
        <div className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-transparent bg-gradient-to-r from-blue-300 to-violet-400 bg-clip-text">
              Guardian Shield
            </span>
          </div>
          <nav className="hidden items-center gap-10 text-base text-blue-100/80 md:flex">
            <a href="#hero" className="transition hover:text-blue-100">
              Explore
            </a>
            <a href="#hero" className="transition hover:text-blue-100">
              How It Works
            </a>
            <Link href="/dashboard" className="transition hover:text-blue-100">
              My Dashboard
            </Link>
          </nav>
          <button
            type="button"
            onClick={connectAndEnter}
            disabled={connecting}
            className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_30px_rgba(139,92,246,0.35)] transition hover:from-indigo-400 hover:to-violet-400 disabled:opacity-60"
          >
            {connecting ? "Connecting..." : "Connect Wallet"}
          </button>
        </div>
      </header>

      <section className="relative mx-auto flex min-h-[72vh] w-full max-w-6xl flex-col items-center justify-center px-4 py-20 text-center sm:px-6">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-5 text-xs font-semibold uppercase tracking-[0.32em] text-blue-300/80"
        >
          Secure Digital Inheritance
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="max-w-4xl bg-gradient-to-r from-blue-300 via-indigo-300 to-fuchsia-400 bg-clip-text text-5xl font-extrabold leading-tight text-transparent sm:text-7xl"
        >
          Connect Wallet and Enter Guardian Shield
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9 }}
          className="mt-6 max-w-2xl text-xl text-blue-100/65"
        >
          A Soroban-powered crypto inheritance vault with periodic check-ins and automated
          beneficiary transfer on inactivity.
        </motion.p>

        <motion.button
          type="button"
          onClick={connectAndEnter}
          disabled={connecting}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1 }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.98 }}
          className="mt-10 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 px-9 py-4 text-2xl font-semibold text-white shadow-[0_0_35px_rgba(99,102,241,0.45)] transition disabled:opacity-60"
        >
          {connecting ? "Connecting..." : "Connect Wallet to Enter"}
        </motion.button>

        <p className="mt-5 text-sm text-blue-200/75">{walletLabel}</p>
        <p className="mt-1 text-sm text-blue-200/60">
          RPC: {hasRpc ? "Enabled" : "Missing NEXT_PUBLIC_SOROBAN_RPC_URL in .env.local"}
        </p>
        {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
      </section>

      <div className="h-16" />
    </main>
  );
}
