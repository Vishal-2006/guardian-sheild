"use client";

import { motion } from "framer-motion";
import { ArrowDownUp, CheckCircle2, Clock3, Settings2 } from "lucide-react";
import type { ActivityTimelineItem } from "@/lib/guardian-shield/service";

const labelMap: Record<ActivityTimelineItem["type"], string> = {
  deposit: "Deposit",
  check_in: "Check-In",
  claim: "Claim",
  config_update: "Config Updated",
};

const colorMap: Record<ActivityTimelineItem["type"], string> = {
  deposit: "text-cyan-300 border-cyan-300/35 bg-cyan-500/10",
  check_in: "text-emerald-300 border-emerald-300/35 bg-emerald-500/10",
  claim: "text-fuchsia-300 border-fuchsia-300/35 bg-fuchsia-500/10",
  config_update: "text-amber-300 border-amber-300/35 bg-amber-500/10",
};

const iconMap: Record<ActivityTimelineItem["type"], typeof ArrowDownUp> = {
  deposit: ArrowDownUp,
  check_in: CheckCircle2,
  claim: Clock3,
  config_update: Settings2,
};

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}

export function Timeline({ items }: { items: ActivityTimelineItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-blue-400/20 bg-slate-950/45 p-4 text-sm text-blue-200/70">
        No activity yet.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-blue-400/20 bg-slate-950/45 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-blue-300">Activity Timeline</p>
      <div className="space-y-3">
        {items.slice(0, 8).map((item, index) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.04 }}
            className="flex items-start gap-3 rounded-xl border border-blue-400/10 bg-slate-950/30 px-3 py-2 transition hover:border-blue-300/25 hover:bg-slate-900/55"
          >
            <div className="relative mt-1">
              {(() => {
                const Icon = iconMap[item.type];
                return (
                  <span className={`inline-flex rounded-lg border p-1 ${colorMap[item.type]}`}>
                    <Icon className="h-3 w-3" />
                  </span>
                );
              })()}
              {index !== Math.min(7, items.length - 1) ? (
                <span className="absolute left-[11px] top-7 h-6 w-px bg-blue-300/20" />
              ) : null}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-blue-100">{labelMap[item.type]}</p>
                <p className="text-xs text-blue-300/70">{formatTime(item.timestamp)}</p>
              </div>
              <p className="text-xs text-blue-200/70">
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
