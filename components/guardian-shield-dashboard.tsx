"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Clock3,
  Shield,
  Wallet,
  Users,
  UserCircle2,
  LogOut,
} from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { CountdownTimer } from "@/components/countdown-timer";
import { StatCard } from "@/components/stat-card";
import { StatusIndicator } from "@/components/status-indicator";
import { ThresholdControl } from "@/components/threshold-control";
import { Timeline } from "@/components/timeline";
import { VaultConfigControl } from "@/components/vault-config-control";
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

function shortAddress(address: string): string {
  return address ? `${address.slice(0, 8)}...${address.slice(-6)}` : "Unknown";
}

function tinyAddress(address: string): string {
  return address ? `${address.slice(0, 3)}......` : "Unknown";
}

function resolveHealthStatus(status: UiVaultStatus, remainingSeconds: number): HealthStatus {
  const hasFunds = BigInt(status.vaultBalance || "0") > BigInt(0);
  if (!hasFunds) return "healthy";
  if (status.claimed || remainingSeconds <= 0) return "critical";
  const ratio = remainingSeconds / status.thresholdSeconds;
  if (ratio <= 0.25) return "critical";
  if (ratio <= 0.5) return "warning";
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

function FloatingLabelInput({
  id,
  value,
  label,
  onChange,
  type = "text",
}: {
  id: string;
  value: string;
  label: string;
  onChange: (next: string) => void;
  type?: "text" | "number";
}) {
  return (
    <div className="relative">
      <label htmlFor={id} className="pointer-events-none absolute left-3 top-2 text-[10px] uppercase tracking-wider text-blue-300/70">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-xl border border-blue-400/25 bg-slate-950/60 px-3 pb-2 pt-5 text-sm text-blue-100 outline-none transition focus:border-violet-300 focus:shadow-[0_0_0_2px_rgba(139,92,246,0.2)]"
      />
    </div>
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const [transactionState, setTransactionState] = useState<TransactionState>({ phase: "idle" });
  const [clockNow, setClockNow] = useState(() => Math.floor(Date.now() / 1000));
  const [depositAmount, setDepositAmount] = useState("10");
  const [thresholdFeedback, setThresholdFeedback] = useState<ThresholdFeedback>({ type: "idle" });
  const [configFeedback, setConfigFeedback] = useState<ConfigFeedback>({ type: "idle" });
  const [loadingStartedAt] = useState(() => Date.now());
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
    queryFn: async () => mapStatus(await getService().getVaultStatus()),
    refetchInterval: 5_000,
  });

  const activityQuery = useQuery({
    queryKey: ACTIVITY_QUERY_KEY,
    queryFn: async () => {
      const logs = await getService().getActivityLogs();
      return logs
        .map((entry, index): ActivityTimelineItem => ({
          id: `${entry.timestamp}-${entry.actor}-${entry.eventType}-${index}`,
          type: mapActivityType(entry.eventType),
          actor: entry.actor || "unknown",
          amount: entry.amount,
          timestamp: entry.timestamp,
        }))
        .sort((a, b) => b.timestamp - a.timestamp);
    },
    refetchInterval: 5_000,
  });

  const refreshStatus = async () => {
    await queryClient.invalidateQueries({ queryKey: STATUS_QUERY_KEY });
    await queryClient.invalidateQueries({ queryKey: ACTIVITY_QUERY_KEY });
  };

  const depositMutation = useMutation({
    mutationFn: async () => getService().deposit(BigInt(depositAmount.trim() || "0")),
    onMutate: () => setTransactionState({ phase: "pending", label: "Deposit transaction pending" }),
    onSuccess: (receipt) => setTransactionState({ phase: "success", label: "Deposit confirmed", hash: receipt.hash }),
    onError: (error) =>
      setTransactionState({
        phase: "error",
        label: "Deposit failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    onSettled: refreshStatus,
  });

  const checkInMutation = useMutation({
    mutationFn: () => getService().checkIn(),
    onMutate: () => setTransactionState({ phase: "pending", label: "Check-in transaction pending" }),
    onSuccess: (receipt) => setTransactionState({ phase: "success", label: "Check-in confirmed", hash: receipt.hash }),
    onError: (error) =>
      setTransactionState({
        phase: "error",
        label: "Check-in failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    onSettled: refreshStatus,
  });

  const claimMutation = useMutation({
    mutationFn: () => getService().claimIfInactive(),
    onMutate: () => setTransactionState({ phase: "pending", label: "Claim transaction pending" }),
    onSuccess: (receipt) => setTransactionState({ phase: "success", label: "Claim confirmed", hash: receipt.hash }),
    onError: (error) =>
      setTransactionState({
        phase: "error",
        label: "Claim failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    onSettled: refreshStatus,
  });

  const thresholdMutation = useMutation({
    mutationFn: async (nextThreshold: number) => getService().setThreshold(nextThreshold),
    onMutate: () => {
      setThresholdFeedback({ type: "idle" });
      setTransactionState({ phase: "pending", label: "Threshold update transaction pending" });
    },
    onSuccess: (receipt, nextThreshold) => {
      setTransactionState({ phase: "success", label: "Threshold updated", hash: receipt.hash });
      setThresholdFeedback({ type: "success", message: `Threshold set to ${nextThreshold} seconds.` });
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
      setTransactionState({ phase: "pending", label: "Beneficiary update pending" });
    },
    onSuccess: (receipt) => {
      setTransactionState({ phase: "success", label: "Beneficiaries updated", hash: receipt.hash });
      setConfigFeedback({ type: "success", message: "Beneficiary configuration updated." });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      setTransactionState({ phase: "error", label: "Beneficiary update failed", message });
      setConfigFeedback({ type: "error", message });
    },
    onSettled: refreshStatus,
  });

  const resetVaultMutation = useMutation({
    mutationFn: () => getService().resetVault(),
    onMutate: () => setTransactionState({ phase: "pending", label: "Reset transaction pending" }),
    onSuccess: (receipt) => {
      setTransactionState({ phase: "success", label: "Vault reset confirmed", hash: receipt.hash });
      setConfigFeedback({ type: "success", message: "Vault reset completed." });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      setTransactionState({ phase: "error", label: "Vault reset failed", message });
      setConfigFeedback({ type: "error", message });
    },
    onSettled: refreshStatus,
  });

  const presentation = useMemo(() => {
    if (!statusQuery.data) return null;
    const status = statusQuery.data;
    const hasFunds = BigInt(status.vaultBalance || "0") > BigInt(0);
    const remainingSeconds = hasFunds ? Math.max(0, status.lastCheckIn + status.thresholdSeconds - clockNow) : 0;
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
        remainingSeconds <= Math.min(60, Math.floor(status.thresholdSeconds / 4)),
    };
  }, [clockNow, statusQuery.data]);

  const isOwnerView =
    Boolean(connectedAddress) &&
    Boolean(presentation?.owner) &&
    connectedAddress.toUpperCase() === presentation?.owner.toUpperCase();

  const isBusy =
    depositMutation.isPending ||
    checkInMutation.isPending ||
    claimMutation.isPending ||
    thresholdMutation.isPending ||
    updateConfigMutation.isPending ||
    resetVaultMutation.isPending;

  const logout = () => {
    window.localStorage.removeItem("guardian_wallet_address");
    router.push("/");
  };

  const hasStatusData = Boolean(statusQuery.data);
  const loadingTooLong = Date.now() - loadingStartedAt > 12_000;
  if (!hasStatusData && (statusQuery.isLoading || statusQuery.isFetching)) {
    return (
      <section className="space-y-3 rounded-3xl border border-blue-400/20 bg-slate-950/60 p-6 text-blue-200">
        <p>Loading on-chain dashboard...</p>
        {loadingTooLong ? (
          <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Still waiting for RPC response. Check `NEXT_PUBLIC_SOROBAN_RPC_URL`, `NEXT_PUBLIC_GUARDIAN_CONTRACT_ID`,
            and `NEXT_PUBLIC_GUARDIAN_SOURCE_PUBLIC_KEY` in `.env.local`, then restart `npm run dev`.
          </div>
        ) : null}
      </section>
    );
  }

  if (statusQuery.isError || !presentation) {
    return (
      <section className="space-y-3 rounded-3xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-200">
        <p className="text-sm font-semibold">Failed to load on-chain dashboard.</p>
        <p className="text-xs text-rose-200/80">
          {statusQuery.error instanceof Error ? statusQuery.error.message : "Unknown error"}
        </p>
        <button
          type="button"
          onClick={() => statusQuery.refetch()}
          className="rounded-lg border border-rose-300/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/20"
        >
          Retry
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-blue-400/20 bg-slate-950/55 px-5 py-3 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 xl:flex-nowrap">
          <div className="flex min-w-0 items-center gap-3">
            <Shield className="h-6 w-6 text-blue-300" />
            <p className="whitespace-nowrap text-2xl font-bold tracking-wide text-blue-50">Guardian Shield</p>
            <span className="whitespace-nowrap rounded-full border border-blue-300/20 bg-blue-500/10 px-3 py-1 text-xs text-blue-200">
              Owner: {tinyAddress(presentation.owner)}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <span className="whitespace-nowrap rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
              Connected
            </span>
            <span
              title={connectedAddress || "Not connected"}
              className="min-w-0 max-w-[480px] truncate rounded-full border border-blue-300/20 bg-blue-500/10 px-3 py-1 text-xs text-blue-200"
            >
              Wallet: {connectedAddress || "Not connected"}
            </span>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1 rounded-full border border-violet-300/35 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-100 transition hover:bg-violet-500/20"
            >
              <LogOut className="h-3.5 w-3.5" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-12">
        <section className="space-y-4 xl:col-span-8">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Vault Balance" value={presentation.vaultBalance} subValue="On-chain units" icon={Wallet} highlight />
            <StatCard label="Last Check-In" value={new Date(presentation.lastCheckIn * 1000).toLocaleString()} icon={Clock3} />
            <StatCard label="Owner" value={shortAddress(presentation.owner)} icon={UserCircle2} />
            <StatCard
              label="Beneficiaries"
              value={String(presentation.beneficiaries.length)}
              subValue={`${presentation.beneficiaries[0]?.percentage ?? 0}% top split`}
              icon={Users}
            />
          </div>

          <CountdownTimer
            remainingSeconds={presentation.remainingSeconds}
            progress={presentation.progress}
            status={presentation.healthStatus}
          />

          <div className="rounded-2xl border border-blue-400/20 bg-slate-950/55 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">Beneficiary Split</p>
            <div className="mt-3 space-y-3">
              {presentation.beneficiaries.map((beneficiary) => (
                <div key={beneficiary.address} className="rounded-xl border border-blue-400/15 bg-slate-950/45 p-3">
                  <div className="mb-2 flex items-center justify-between text-sm text-blue-100">
                    <span>{shortAddress(beneficiary.address)}</span>
                    <span className="font-semibold">{beneficiary.percentage}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400"
                      style={{ width: `${beneficiary.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {isOwnerView ? (
            <div className="space-y-4 rounded-2xl border border-blue-400/20 bg-slate-950/55 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">Action Panel</p>

              <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr]">
                <FloatingLabelInput
                  id="deposit-amount"
                  label="Deposit Amount"
                  value={depositAmount}
                  type="number"
                  onChange={setDepositAmount}
                />
                <ActionButton
                  label="Deposit"
                  loadingLabel="Depositing..."
                  loading={depositMutation.isPending}
                  disabled={isBusy}
                  onClick={() => depositMutation.mutate()}
                  variant="primary"
                />
                <ActionButton
                  label="Check In"
                  loadingLabel="Checking..."
                  loading={checkInMutation.isPending}
                  disabled={isBusy || presentation.claimed}
                  onClick={() => checkInMutation.mutate()}
                  variant="secondary"
                />
                <ActionButton
                  label="Claim"
                  loadingLabel="Claiming..."
                  loading={claimMutation.isPending}
                  disabled={isBusy || !presentation.hasFunds || presentation.remainingSeconds > 0 || presentation.claimed}
                  onClick={() => claimMutation.mutate()}
                  variant="danger"
                />
              </div>

              <ThresholdControl
                key={`threshold-${presentation.thresholdSeconds}`}
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

              <VaultConfigControl
                key={presentation.beneficiaries.map((b) => `${b.address}:${b.percentage}`).join("|")}
                currentBeneficiaries={presentation.beneficiaries.map((item) => ({
                  beneficiary: item.address,
                  percentage: item.percentage,
                }))}
                isUpdating={updateConfigMutation.isPending}
                disabled={isBusy}
                feedback={configFeedback}
                onUpdate={(payload) => {
                  const total = payload.beneficiaries.reduce((sum, row) => sum + (Number(row.percentage) || 0), 0);
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

              <ActionButton
                label="Reset Vault"
                loadingLabel="Resetting..."
                loading={resetVaultMutation.isPending}
                disabled={isBusy}
                onClick={() => resetVaultMutation.mutate()}
                variant="outline"
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-blue-400/20 bg-slate-950/55 p-4 text-sm text-blue-200/80">
              Beneficiary view only. Owner controls are hidden.
            </div>
          )}

          <TxBanner transactionState={transactionState} />
        </section>

        <aside className="space-y-4 xl:col-span-4">
          <div className="rounded-2xl border border-blue-400/20 bg-slate-950/55 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">System Status</p>
              <StatusIndicator status={presentation.healthStatus} />
            </div>
            {presentation.closeToInactivity ? (
              <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                Inactivity threshold is near. Check in soon.
              </p>
            ) : (
              <p className="rounded-lg border border-blue-400/20 bg-blue-500/5 px-3 py-2 text-xs text-blue-200/80">
                Monitoring active. Timeline and status auto-refresh every 5s.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-blue-400/20 bg-slate-950/55 p-1">
            <Timeline items={activityQuery.data ?? []} />
          </div>
        </aside>
      </div>
    </div>
  );
}
