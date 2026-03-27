"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

type BeneficiaryRow = {
  beneficiary: string;
  percentage: number;
};

type ConfigFeedback =
  | { type: "idle" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

type VaultConfigControlProps = {
  currentBeneficiaries: BeneficiaryRow[];
  isUpdating: boolean;
  feedback: ConfigFeedback;
  disabled?: boolean;
  onUpdate: (payload: { beneficiaries: BeneficiaryRow[] }) => void;
};

export function VaultConfigControl({
  currentBeneficiaries,
  isUpdating,
  feedback,
  disabled = false,
  onUpdate,
}: VaultConfigControlProps) {
  const [rows, setRows] = useState<BeneficiaryRow[]>([
    {
      beneficiary: currentBeneficiaries[0]?.beneficiary ?? "",
      percentage: 100,
    },
  ]);

  const percentageTotal = useMemo(
    () => rows.reduce((sum, row) => sum + (Number.isFinite(row.percentage) ? row.percentage : 0), 0),
    [rows],
  );

  return (
    <div className="rounded-2xl border border-fuchsia-400/25 bg-black/35 p-4 shadow-[0_0_30px_rgba(217,70,239,0.14)]">
      <p className="text-xs font-semibold uppercase tracking-wider text-fuchsia-300">Beneficiary Configuration</p>
      <p className="mt-2 text-xs text-blue-200/80">Only owner can update beneficiary split percentages.</p>

      <div className="mt-4 space-y-2">
        <p className="text-xs text-blue-200/70">Single Beneficiary Address</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
          <input
            value={rows[0]?.beneficiary ?? ""}
            onChange={(event) =>
              setRows([{ beneficiary: event.target.value, percentage: 100 }])
            }
            className="rounded-xl border border-fuchsia-400/25 bg-black/55 px-3 py-2 text-sm text-blue-100 outline-none transition focus:border-fuchsia-300"
            placeholder="Beneficiary G..."
          />
          <input
            value={100}
            readOnly
            className="rounded-xl border border-fuchsia-400/25 bg-black/40 px-3 py-2 text-sm text-blue-100"
          />
        </div>

        <p className={`text-xs ${percentageTotal === 100 ? "text-emerald-300" : "text-amber-300"}`}>
          Total percentage: {percentageTotal}%
        </p>
      </div>

      <button
        type="button"
        disabled={disabled || isUpdating}
        onClick={() =>
          onUpdate({
            beneficiaries: [
              {
                beneficiary: (rows[0]?.beneficiary ?? "").trim(),
                percentage: 100,
              },
            ],
          })
        }
        className="mt-4 w-full rounded-xl border border-fuchsia-400/45 bg-gradient-to-r from-fuchsia-500/20 to-violet-500/20 px-4 py-2 text-sm font-semibold text-fuchsia-100 transition hover:from-fuchsia-500/30 hover:to-violet-500/30 disabled:opacity-50"
      >
        <span className="inline-flex items-center gap-2">
          {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isUpdating ? "Updating Beneficiaries..." : "Update Beneficiaries"}
        </span>
      </button>

      {feedback.type === "success" ? (
        <p className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          {feedback.message}
        </p>
      ) : null}
      {feedback.type === "error" ? (
        <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
