"use client";

import { motion } from "framer-motion";

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((safe % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(safe % 60)
    .toString()
    .padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

export function CountdownTimer({
  remainingSeconds,
  progress,
  status,
}: {
  remainingSeconds: number;
  progress: number;
  status: "healthy" | "warning" | "critical";
}) {
  const tone =
    status === "critical"
      ? "text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.45)]"
      : status === "warning"
        ? "text-amber-300 shadow-[0_0_18px_rgba(245,158,11,0.4)]"
        : "text-emerald-300 shadow-[0_0_18px_rgba(16,185,129,0.35)]";

  return (
    <div className="rounded-2xl border border-blue-400/25 bg-slate-950/50 p-5">
      <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-wide text-blue-300/80">
        <span>Inactivity Countdown</span>
        <span>{Math.max(0, Math.round(progress))}% elapsed</span>
      </div>
      <motion.p
        key={Math.floor(remainingSeconds)}
        initial={{ opacity: 0.75 }}
        animate={{ opacity: 1 }}
        className={`font-mono text-4xl font-bold tracking-[0.12em] ${tone} ${status === "critical" ? "animate-pulse" : ""}`}
      >
        {formatCountdown(remainingSeconds)}
      </motion.p>
    </div>
  );
}
