"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

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

function sanitizeRows(rows: BeneficiaryRow[]): BeneficiaryRow[] {
  if (rows.length === 0) {
    return [{ beneficiary: "", percentage: 100 }];
  }
  return rows.map((row) => ({
    beneficiary: row.beneficiary,
    percentage: Number.isFinite(row.percentage) ? row.percentage : 0,
  }));
}

export function VaultConfigControl({
  currentBeneficiaries,
  isUpdating,
  feedback,
  disabled = false,
  onUpdate,
}: VaultConfigControlProps) {
  const [rows, setRows] = useState<BeneficiaryRow[]>(sanitizeRows(currentBeneficiaries));

  const percentageTotal = useMemo(
    () => rows.reduce((sum, row) => sum + (Number.isFinite(row.percentage) ? row.percentage : 0), 0),
    [rows],
  );

  return (
    <div className="rounded-2xl border border-violet-400/25 bg-slate-950/45 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-300">Beneficiary Configuration</p>
          <p className="mt-1 text-xs text-blue-200/75">Set split percentages (must total 100%).</p>
        </div>
        <button
          type="button"
          disabled={disabled || isUpdating || rows.length >= 8}
          onClick={() => setRows((prev) => [...prev, { beneficiary: "", percentage: 0 }])}
          className="inline-flex items-center gap-1 rounded-full border border-violet-300/40 bg-violet-500/10 px-3 py-1 text-xs text-violet-200 transition hover:bg-violet-500/20 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>

      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={`${index}-${row.beneficiary}`} className="grid gap-2 sm:grid-cols-[1fr_120px_auto]">
            <input
              value={row.beneficiary}
              onChange={(event) =>
                setRows((prev) =>
                  prev.map((item, i) => (i === index ? { ...item, beneficiary: event.target.value } : item)),
                )
              }
              className="h-11 rounded-xl border border-blue-400/25 bg-slate-950/70 px-3 text-sm text-blue-100 outline-none transition focus:border-violet-300 focus:shadow-[0_0_0_2px_rgba(139,92,246,0.2)]"
              placeholder="Beneficiary address (G...)"
            />
            <input
              type="number"
              min={0}
              max={100}
              value={row.percentage}
              onChange={(event) =>
                setRows((prev) =>
                  prev.map((item, i) =>
                    i === index ? { ...item, percentage: Number(event.target.value) || 0 } : item,
                  ),
                )
              }
              className="h-11 rounded-xl border border-blue-400/25 bg-slate-950/70 px-3 text-sm text-blue-100 outline-none transition focus:border-violet-300 focus:shadow-[0_0_0_2px_rgba(139,92,246,0.2)]"
            />
            <button
              type="button"
              disabled={disabled || isUpdating || rows.length <= 1}
              onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-rose-400/35 bg-rose-500/10 text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <p className={`mt-2 text-xs ${percentageTotal === 100 ? "text-emerald-300" : "text-amber-300"}`}>
        Total percentage: {percentageTotal}%
      </p>

      <button
        type="button"
        disabled={disabled || isUpdating}
        onClick={() =>
          onUpdate({
            beneficiaries: rows.map((row) => ({
              beneficiary: row.beneficiary.trim(),
              percentage: Math.floor(row.percentage),
            })),
          })
        }
        className="mt-4 w-full rounded-full border border-violet-300/45 bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 px-4 py-2.5 text-sm font-semibold text-violet-100 transition hover:from-violet-500/30 hover:to-fuchsia-500/30 disabled:opacity-50"
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

