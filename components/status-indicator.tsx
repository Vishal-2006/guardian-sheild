"use client";

import { motion } from "framer-motion";

type HealthStatus = "healthy" | "warning" | "critical";

const statusMap: Record<HealthStatus, { label: string; classes: string; pulse: boolean }> = {
  healthy: {
    label: "Healthy",
    classes: "bg-emerald-400/20 text-emerald-300 ring-emerald-400/60 shadow-[0_0_18px_rgba(16,185,129,0.35)]",
    pulse: false,
  },
  warning: {
    label: "Warning",
    classes: "bg-amber-400/20 text-amber-300 ring-amber-400/60 shadow-[0_0_18px_rgba(245,158,11,0.35)]",
    pulse: false,
  },
  critical: {
    label: "Critical",
    classes: "bg-rose-500/20 text-rose-300 ring-rose-500/60 shadow-[0_0_20px_rgba(244,63,94,0.45)]",
    pulse: true,
  },
};

export function StatusIndicator({ status }: { status: HealthStatus }) {
  const style = statusMap[status];

  return (
    <motion.div
      initial={{ opacity: 0.8, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase ring-1 ${style.classes}`}
    >
      <span className={`inline-flex h-2 w-2 rounded-full bg-current ${style.pulse ? "animate-ping" : "animate-pulse"}`} />
      {style.label}
    </motion.div>
  );
}
