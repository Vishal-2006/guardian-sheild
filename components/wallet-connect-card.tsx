"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";

type WalletState = {
  connected: boolean;
  address: string;
  network: string;
};

type FreighterApi = {
  requestAccess?: () => Promise<unknown>;
  getAddress?: () => Promise<{ address?: string } | string>;
  getNetwork?: () => Promise<{ network?: string; networkPassphrase?: string } | string>;
};

function compactAddress(address: string): string {
  if (!address) {
    return "";
  }

  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function readFreighterApi(): FreighterApi | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return (window as Window & { freighterApi?: FreighterApi }).freighterApi;
}

export function WalletConnectCard() {
  const [wallet, setWallet] = useState<WalletState>({
    connected: false,
    address: "",
    network: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const freighterApi = readFreighterApi();
  const hasFreighter = Boolean(freighterApi);

  const label = useMemo(() => {
    if (wallet.connected) {
      return compactAddress(wallet.address);
    }

    return hasFreighter ? "Freighter detected" : "Freighter not detected";
  }, [hasFreighter, wallet.address, wallet.connected]);

  const connectWallet = async () => {
    if (!freighterApi) {
      setError("Install Freighter wallet extension to connect.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await freighterApi.requestAccess?.();

      const addressResponse = await freighterApi.getAddress?.();
      const networkResponse = await freighterApi.getNetwork?.();

      const address =
        typeof addressResponse === "string"
          ? addressResponse
          : addressResponse?.address || "";

      const network =
        typeof networkResponse === "string"
          ? networkResponse
          : networkResponse?.network || networkResponse?.networkPassphrase || "unknown";

      if (!address) {
        throw new Error("Wallet returned an empty address.");
      }

      setWallet({
        connected: true,
        address,
        network,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to connect wallet.");
    } finally {
      setLoading(false);
    }
  };

  const disconnectWallet = () => {
    setWallet({ connected: false, address: "", network: "" });
    setError("");
  };

  return (
    <motion.aside
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-cyan-400/30 bg-black/45 p-4 shadow-[0_0_35px_rgba(34,211,238,0.2)] backdrop-blur"
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">Wallet</p>
      <p className="mt-1 text-sm font-medium text-cyan-100">{label}</p>
      <p className="mt-1 text-xs text-cyan-200/70">
        {wallet.connected ? `Network: ${wallet.network}` : "Connect to sign live Soroban transactions"}
      </p>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={loading || wallet.connected}
          onClick={connectWallet}
          className="rounded-lg border border-cyan-400/50 bg-cyan-500/20 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/30 disabled:opacity-40"
        >
          {loading ? "Connecting..." : "Connect Wallet"}
        </button>
        <button
          type="button"
          disabled={loading || !wallet.connected}
          onClick={disconnectWallet}
          className="rounded-lg border border-zinc-500/40 bg-zinc-500/20 px-3 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-500/30 disabled:opacity-40"
        >
          Disconnect
        </button>
      </div>

      {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}
    </motion.aside>
  );
}
