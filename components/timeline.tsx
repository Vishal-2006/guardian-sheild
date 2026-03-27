"use client";

import { motion } from "framer-motion";
import type { ActivityTimelineItem } from "@/lib/guardian-shield/service";

const labelMap: Record<ActivityTimelineItem["type"], string> = {
  deposit: "Deposit",
  check_in: "Check-In",
  claim: "Claim",
  config_update: "Config Updated",
};

const colorMap: Record<ActivityTimelineItem["type"], string> = {
  deposit: "bg-cyan-400",
  check_in: "bg-emerald-400",
  claim: "bg-fuchsia-400",
  config_update: "bg-amber-400",
};

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString();
}

export function Timeline({ items }: { items: ActivityTimelineItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-cyan-400/20 bg-black/35 p-4 text-sm text-cyan-200/70">
        No activity yet.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-cyan-400/20 bg-black/35 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-cyan-300">Activity Timeline</p>
      <div className="space-y-3">
        {items.slice(0, 8).map((item, index) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.04 }}
            className="flex items-start gap-3"
          >
            <div className="relative mt-1">
              <span className={`block h-2.5 w-2.5 rounded-full ${colorMap[item.type]}`} />
              {index !== Math.min(7, items.length - 1) ? (
                <span className="absolute left-[4px] top-3 h-6 w-px bg-cyan-400/30" />
              ) : null}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-cyan-100">{labelMap[item.type]}</p>
                <p className="text-xs text-cyan-300/70">{formatTime(item.timestamp)}</p>
              </div>
              <p className="text-xs text-cyan-200/70">
                Actor: {item.actor.slice(0, 8)}...{item.actor.slice(-6)}
                {item.amount ? ` | Amount: ${item.amount}` : ""}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
