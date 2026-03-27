"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CountdownTimer } from "@/components/countdown-timer";
import { StatusIndicator } from "@/components/status-indicator";
import { ThresholdControl } from "@/components/threshold-control";
import { VaultConfigControl } from "@/components/vault-config-control";
import { Timeline } from "@/components/timeline";
import type { ActivityTimelineItem } from "@/lib/guardian-shield/service";
import { createGuardianShieldService } from "@/services/stellar";

type TransactionState =
  | { phase: "idle" }
  | { phase: "pending"; label: string }
  | { phase: "success"; label: string; hash: string }
  | { phase: "error"; label: string; message: string };

type ThresholdFeedback =
  | { type: "idle" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

type ConfigFeedback =
  | { type: "idle" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

type HealthStatus = "healthy" | "warning" | "critical";

type UiVaultStatus = {
  owner: string;
  beneficiaries: Array<{ address: string; percentage: number }>;
  lastCheckIn: number;
  vaultBalance: string;
  thresholdSeconds: number;
  inactive: boolean;
  claimed: boolean;
};

const STATUS_QUERY_KEY = ["guardian-shield", "status-onchain"];
const ACTIVITY_QUERY_KEY = ["guardian-shield", "activity-onchain"];

function getService() {
  return createGuardianShieldService();
}

function resolveHealthStatus(status: UiVaultStatus, remainingSeconds: number): HealthStatus {
  const hasFunds = BigInt(status.vaultBalance || "0") > BigInt(0);
  if (!hasFunds) {
    return "healthy";
  }

  if (status.claimed || remainingSeconds <= 0) {
    return "critical";
  }

  const ratio = remainingSeconds / status.thresholdSeconds;
  if (ratio <= 0.25) {
    return "critical";
  }
  if (ratio <= 0.5) {
    return "warning";
  }

  return "healthy";
}

function mapStatus(raw: Awaited<ReturnType<ReturnType<typeof getService>["getVaultStatus"]>>): UiVaultStatus {
  return {
    owner: raw.owner,
    beneficiaries: raw.beneficiaries.map((entry) => ({
      address: entry.beneficiary,
      percentage: entry.percentage,
    })),
    lastCheckIn: raw.lastCheckin,
    vaultBalance: raw.vaultBalance,
    thresholdSeconds: raw.thresholdSeconds,
    inactive: raw.inactive,
    claimed: raw.claimed,
  };
}

function mapActivityType(eventType: string): ActivityTimelineItem["type"] {
  const key = eventType.toLowerCase();
  if (key.includes("deposit")) return "deposit";
  if (key.includes("check")) return "check_in";
  if (key.includes("claim")) return "claim";
  return "config_update";
}

function StatCard({ label, value, subValue }: { label: string; value: string; subValue?: string }) {
  return (
    <div className="rounded-xl border border-cyan-400/20 bg-black/40 p-4 shadow-[0_0_22px_rgba(34,211,238,0.12)]">
      <p className="text-xs uppercase tracking-wide text-cyan-300/70">{label}</p>
      <p className="mt-1 text-lg font-semibold text-cyan-100">{value}</p>
      {subValue ? <p className="mt-1 text-xs text-cyan-200/60">{subValue}</p> : null}
    </div>
  );
}

function BusyLabel({ loading, idleLabel, loadingLabel }: { loading: boolean; idleLabel: string; loadingLabel: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {loading ? loadingLabel : idleLabel}
    </span>
  );
}

function TxBanner({ transactionState }: { transactionState: TransactionState }) {
  return (
    <div className="min-h-9 text-sm">
      <AnimatePresence mode="wait">
        {transactionState.phase === "pending" ? (
          <motion.p
            key="pending"
            initial={{ y: 6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -6, opacity: 0 }}
            className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-amber-300"
          >
            {transactionState.label}
          </motion.p>
        ) : null}
        {transactionState.phase === "success" ? (
          <motion.p
            key="success"
            initial={{ y: 6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -6, opacity: 0 }}
            className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-emerald-300"
          >
            {transactionState.label}: <span className="font-mono text-xs">{transactionState.hash}</span>
          </motion.p>
        ) : null}
        {transactionState.phase === "error" ? (
          <motion.p
            key="error"
            initial={{ y: 6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -6, opacity: 0 }}
            className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-300"
          >
            {transactionState.label}: {transactionState.message}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default function GuardianShieldDashboard() {
  const queryClient = useQueryClient();
  const [transactionState, setTransactionState] = useState<TransactionState>({ phase: "idle" });
  const [clockNow, setClockNow] = useState(() => Math.floor(Date.now() / 1000));
  const [depositAmount, setDepositAmount] = useState("10");
  const [thresholdFeedback, setThresholdFeedback] = useState<ThresholdFeedback>({ type: "idle" });
  const [configFeedback, setConfigFeedback] = useState<ConfigFeedback>({ type: "idle" });
  const connectedAddress = useSyncExternalStore(
    () => () => {},
    () => window.localStorage.getItem("guardian_wallet_address") || "",
    () => "",
  );

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const statusQuery = useQuery({
    queryKey: STATUS_QUERY_KEY,
    queryFn: async () => {
      const status = await getService().getVaultStatus();
      return mapStatus(status);
    },
    refetchInterval: 5_000,
  });

  const activityQuery = useQuery({
    queryKey: ACTIVITY_QUERY_KEY,
    queryFn: async () => {
      const logs = await getService().getActivityLogs();
      return logs.map((entry, index): ActivityTimelineItem => ({
        id: `${entry.timestamp}-${entry.actor}-${entry.eventType}-${index}`,
        type: mapActivityType(entry.eventType),
        actor: entry.actor || "unknown",
        amount: entry.amount,
        timestamp: entry.timestamp,
      }));
    },
    refetchInterval: 5_000,
  });

  const refreshStatus = async () => {
    await queryClient.invalidateQueries({ queryKey: STATUS_QUERY_KEY });
    await queryClient.invalidateQueries({ queryKey: ACTIVITY_QUERY_KEY });
  };

  const depositMutation = useMutation({
    mutationFn: async () => {
      const amount = BigInt(depositAmount.trim() || "0");
      return getService().deposit(amount);
    },
    onMutate: () => setTransactionState({ phase: "pending", label: "Deposit transaction pending" }),
    onSuccess: (receipt) => {
      setTransactionState({ phase: "success", label: "Deposit confirmed", hash: receipt.hash });
    },
    onError: (error) => {
      setTransactionState({
        phase: "error",
        label: "Deposit failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    },
    onSettled: refreshStatus,
  });

  const checkInMutation = useMutation({
    mutationFn: () => getService().checkIn(),
    onMutate: () => setTransactionState({ phase: "pending", label: "Check-in transaction pending" }),
    onSuccess: (receipt) => {
      setTransactionState({ phase: "success", label: "Check-in confirmed", hash: receipt.hash });
    },
    onError: (error) => {
      setTransactionState({
        phase: "error",
        label: "Check-in failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    },
    onSettled: refreshStatus,
  });

  const claimMutation = useMutation({
    mutationFn: () => getService().claimIfInactive(),
    onMutate: () => setTransactionState({ phase: "pending", label: "Claim transaction pending" }),
    onSuccess: (receipt) => {
      setTransactionState({ phase: "success", label: "Claim confirmed", hash: receipt.hash });
    },
    onError: (error) => {
      setTransactionState({
        phase: "error",
        label: "Claim failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    },
    onSettled: refreshStatus,
  });

  const thresholdMutation = useMutation({
    mutationFn: async (nextThreshold: number) => getService().setThreshold(nextThreshold),
    onMutate: () => {
      setThresholdFeedback({ type: "idle" });
      setTransactionState({ phase: "pending", label: "Threshold update transaction pending" });
    },
    onSuccess: (receipt, nextThreshold) => {
      setTransactionState({ phase: "success", label: "Threshold update confirmed", hash: receipt.hash });
      setThresholdFeedback({ type: "success", message: `Threshold updated to ${nextThreshold} seconds.` });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      setTransactionState({ phase: "error", label: "Threshold update failed", message });
      setThresholdFeedback({ type: "error", message });
    },
    onSettled: refreshStatus,
  });

  const updateConfigMutation = useMutation({
    mutationFn: (payload: {
      newOwner: string;
      beneficiaries: Array<{ beneficiary: string; percentage: number }>;
      thresholdSeconds: number;
    }) => getService().updateConfig(payload),
    onMutate: () => {
      setConfigFeedback({ type: "idle" });
      setTransactionState({ phase: "pending", label: "Config update transaction pending" });
    },
    onSuccess: (receipt) => {
      setTransactionState({ phase: "success", label: "Config update confirmed", hash: receipt.hash });
      setConfigFeedback({ type: "success", message: "Owner and beneficiaries updated successfully." });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      setTransactionState({ phase: "error", label: "Config update failed", message });
      setConfigFeedback({ type: "error", message });
    },
    onSettled: refreshStatus,
  });

  const resetVaultMutation = useMutation({
    mutationFn: () => getService().resetVault(),
    onMutate: () => setTransactionState({ phase: "pending", label: "Vault reset transaction pending" }),
    onSuccess: (receipt) => {
      setTransactionState({ phase: "success", label: "Vault reset confirmed", hash: receipt.hash });
      setConfigFeedback({ type: "success", message: "Vault reset completed. Deposits are enabled again." });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      setTransactionState({ phase: "error", label: "Vault reset failed", message });
      setConfigFeedback({ type: "error", message });
    },
    onSettled: refreshStatus,
  });

  const isBusy =
    depositMutation.isPending ||
    checkInMutation.isPending ||
    claimMutation.isPending ||
    thresholdMutation.isPending ||
    updateConfigMutation.isPending ||
    resetVaultMutation.isPending;

  const presentation = useMemo(() => {
    if (!statusQuery.data) {
      return null;
    }

    const status = statusQuery.data;
    const hasFunds = BigInt(status.vaultBalance || "0") > BigInt(0);
    const remainingSeconds = hasFunds
      ? Math.max(0, status.lastCheckIn + status.thresholdSeconds - clockNow)
      : status.thresholdSeconds;
    const progress = hasFunds
      ? status.claimed || status.thresholdSeconds <= 0
        ? 100
        : Math.min(100, ((status.thresholdSeconds - remainingSeconds) / status.thresholdSeconds) * 100)
      : 0;

    return {
      ...status,
      hasFunds,
      remainingSeconds,
      progress,
      healthStatus: resolveHealthStatus(status, remainingSeconds),
      closeToInactivity:
        hasFunds &&
        remainingSeconds > 0 &&
        remainingSeconds <= Math.min(30, status.thresholdSeconds / 4),
    };
  }, [clockNow, statusQuery.data]);

  const isOwnerView =
    Boolean(connectedAddress) &&
    Boolean(presentation?.owner) &&
    connectedAddress.toUpperCase() === presentation?.owner.toUpperCase();

  if (statusQuery.isLoading || !presentation) {
    return (
      <section className="w-full rounded-3xl border border-cyan-400/20 bg-black/40 p-6 text-cyan-200">
        Loading on-chain dashboard...
      </section>
    );
  }

  if (!isOwnerView) {
    return (
      <section className="w-full rounded-3xl border border-cyan-400/20 bg-black/45 p-6 shadow-[0_0_55px_rgba(34,211,238,0.15)] backdrop-blur-xl">
        <div className="mb-4">
          <h2 className="text-2xl font-bold uppercase tracking-wide text-cyan-100">Beneficiary Vault View</h2>
          <p className="text-xs uppercase tracking-wider text-cyan-300/70">Read-only access for beneficiaries</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Vault Balance" value={presentation.vaultBalance} subValue="Available on-chain units" />
          <StatCard label="Owner" value={`${presentation.owner.slice(0, 8)}...${presentation.owner.slice(-6)}`} />
          <StatCard
            label="Status"
            value={presentation.claimed ? "Claimed" : presentation.inactive ? "Inactive" : "Active"}
            subValue={`Threshold ${presentation.thresholdSeconds}s`}
          />
        </div>

        <div className="mt-4">
          <CountdownTimer remainingSeconds={presentation.remainingSeconds} progress={presentation.progress} />
        </div>
      </section>
    );
  }

  return (
    <section className="w-full rounded-3xl border border-cyan-400/20 bg-black/45 p-6 shadow-[0_0_55px_rgba(34,211,238,0.15)] backdrop-blur-xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold uppercase tracking-wide text-cyan-100">Control Panel</h2>
          <p className="text-xs uppercase tracking-wider text-cyan-300/70">Premium Cyberpunk Dashboard</p>
        </div>
        <StatusIndicator status={presentation.healthStatus} />
      </div>

      {presentation.closeToInactivity ? (
        <div className="mb-4 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 shadow-[0_0_20px_rgba(245,158,11,0.25)]">
          Warning: inactivity threshold is near. Submit check-in immediately.
        </div>
      ) : null}

      <div id="vault" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Vault Balance" value={presentation.vaultBalance} subValue="On-chain units" />
        <StatCard label="Last Check-in" value={new Date(presentation.lastCheckIn * 1000).toLocaleString()} />
        <StatCard label="Owner" value={`${presentation.owner.slice(0, 8)}...${presentation.owner.slice(-6)}`} />
        <StatCard
          label="Beneficiaries"
          value={String(presentation.beneficiaries.length)}
          subValue={`${presentation.beneficiaries[0]?.percentage ?? 0}% top split`}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <CountdownTimer remainingSeconds={presentation.remainingSeconds} progress={presentation.progress} />

          <div className="rounded-2xl border border-cyan-400/20 bg-black/35 p-4" id="beneficiaries">
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Beneficiary Split</p>
            <div className="mt-3 space-y-2">
              {presentation.beneficiaries.map((beneficiary) => (
                <div
                  key={beneficiary.address}
                  className="flex items-center justify-between rounded-lg border border-cyan-400/15 bg-black/35 px-3 py-2 text-xs"
                >
                  <span className="text-cyan-100/90">
                    {beneficiary.address.slice(0, 8)}...{beneficiary.address.slice(-6)}
                  </span>
                  <span className="font-semibold text-cyan-200">{beneficiary.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div id="activity">
          <Timeline items={activityQuery.data ?? []} />
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-black/35 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Action Panel</p>
        {isOwnerView ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <input
              value={depositAmount}
              onChange={(event) => setDepositAmount(event.target.value)}
              className="rounded-xl border border-cyan-400/25 bg-black/55 px-3 py-2 text-sm text-cyan-100 outline-none transition focus:border-cyan-300"
              placeholder="Deposit amount"
            />

            <button
              type="button"
              disabled={isBusy}
              onClick={() => depositMutation.mutate()}
              className="rounded-xl border border-cyan-400/50 bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/30 disabled:opacity-50"
            >
              <BusyLabel loading={depositMutation.isPending} idleLabel="Deposit" loadingLabel="Depositing..." />
            </button>

            <button
              type="button"
              disabled={isBusy || presentation.claimed}
              onClick={() => checkInMutation.mutate()}
              className="rounded-xl border border-emerald-400/50 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/30 disabled:opacity-50"
            >
              <BusyLabel loading={checkInMutation.isPending} idleLabel="Check In" loadingLabel="Checking..." />
            </button>

            <button
              type="button"
              disabled={
                isBusy ||
                !presentation.hasFunds ||
                presentation.remainingSeconds > 0 ||
                presentation.claimed
              }
              onClick={() => claimMutation.mutate()}
              className="rounded-xl border border-fuchsia-400/50 bg-fuchsia-500/20 px-4 py-2 text-sm font-semibold text-fuchsia-200 transition hover:bg-fuchsia-500/30 disabled:opacity-50"
            >
              <BusyLabel loading={claimMutation.isPending} idleLabel="Claim" loadingLabel="Claiming..." />
            </button>
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-blue-400/25 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">
            Beneficiary view: owner-only controls are hidden. You can monitor vault balance and status.
          </p>
        )}

        {isOwnerView ? (
          <>
            <div className="mt-4">
              <ThresholdControl
                currentThreshold={presentation.thresholdSeconds}
                isUpdating={thresholdMutation.isPending}
                disabled={isBusy}
                feedback={thresholdFeedback}
                onUpdate={(nextThreshold) => {
                  if (!Number.isFinite(nextThreshold) || nextThreshold <= 0) {
                    setThresholdFeedback({ type: "error", message: "Threshold must be greater than 0." });
                    return;
                  }

                  thresholdMutation.mutate(Math.floor(nextThreshold));
                }}
              />
            </div>

            <div className="mt-4">
              <VaultConfigControl
                currentBeneficiaries={presentation.beneficiaries.map((item) => ({
                  beneficiary: item.address,
                  percentage: item.percentage,
                }))}
                isUpdating={updateConfigMutation.isPending}
                disabled={isBusy}
                feedback={configFeedback}
                onUpdate={(payload) => {
                  const total = payload.beneficiaries.reduce(
                    (sum, row) => sum + (Number(row.percentage) || 0),
                    0,
                  );
                  if (payload.beneficiaries.length === 0 || total !== 100) {
                    setConfigFeedback({
                      type: "error",
                      message: "Beneficiary list must not be empty and percentages must total 100.",
                    });
                    return;
                  }
                  updateConfigMutation.mutate({
                    newOwner: presentation.owner,
                    beneficiaries: payload.beneficiaries,
                    thresholdSeconds: presentation.thresholdSeconds,
                  });
                }}
              />
            </div>

            <div className="mt-4">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => resetVaultMutation.mutate()}
                className="w-full rounded-xl border border-amber-400/45 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/25 disabled:opacity-50"
              >
                <BusyLabel loading={resetVaultMutation.isPending} idleLabel="Reset Vault" loadingLabel="Resetting..." />
              </button>
            </div>
          </>
        ) : null}
      </div>

      <div className="mt-4">
        <TxBanner transactionState={transactionState} />
      </div>

      {statusQuery.isError ? (
        <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          Failed to load on-chain vault status.
        </p>
      ) : null}
    </section>
  );
}
