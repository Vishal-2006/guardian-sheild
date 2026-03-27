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
}: {
  remainingSeconds: number;
  progress: number;
}) {
  return (
    <div className="rounded-2xl border border-cyan-400/20 bg-black/35 p-4">
      <div className="mb-2 flex items-center justify-between text-xs uppercase text-cyan-300/80">
        <span>Inactivity Countdown</span>
        <span>{Math.max(0, Math.round(progress))}% elapsed</span>
      </div>
      <motion.p
        key={Math.floor(remainingSeconds)}
        initial={{ opacity: 0.7 }}
        animate={{ opacity: 1 }}
        className="font-mono text-3xl font-bold tracking-wider text-cyan-200"
      >
        {formatCountdown(remainingSeconds)}
      </motion.p>
    </div>
  );
}
