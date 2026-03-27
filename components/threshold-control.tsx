"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type ThresholdFeedback =
  | { type: "idle" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

type ThresholdControlProps = {
  currentThreshold: number;
  isUpdating: boolean;
  disabled?: boolean;
  feedback: ThresholdFeedback;
  onUpdate: (nextThreshold: number) => void;
};

export function ThresholdControl({
  currentThreshold,
  isUpdating,
  disabled = false,
  feedback,
  onUpdate,
}: ThresholdControlProps) {
  const [inputValue, setInputValue] = useState(String(currentThreshold));

  useEffect(() => {
    setInputValue(String(currentThreshold));
  }, [currentThreshold]);

  const submit = () => {
    const parsed = Number(inputValue.trim());
    onUpdate(parsed);
  };

  return (
    <div className="rounded-2xl border border-violet-400/30 bg-black/35 p-4 shadow-[0_0_30px_rgba(139,92,246,0.15)]">
      <p className="text-xs font-semibold uppercase tracking-wider text-violet-300">
        Set Inactivity Threshold (seconds)
      </p>
      <p className="mt-2 text-sm text-blue-200/80">Current threshold: {currentThreshold}s</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
        <input
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          inputMode="numeric"
          className="rounded-xl border border-violet-400/30 bg-black/55 px-3 py-2 text-sm text-blue-100 outline-none transition focus:border-violet-300"
          placeholder="120"
        />
        <button
          type="button"
          disabled={disabled || isUpdating}
          onClick={submit}
          className="rounded-xl border border-violet-400/50 bg-violet-500/20 px-4 py-2 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/30 disabled:opacity-50"
        >
          <span className="inline-flex items-center gap-2">
            {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isUpdating ? "Updating..." : "Update Threshold"}
          </span>
        </button>
      </div>

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

