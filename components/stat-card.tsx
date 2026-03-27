"use client";

import type { LucideIcon } from "lucide-react";

type StatCardProps = {
  label: string;
  value: string;
  subValue?: string;
  icon: LucideIcon;
  highlight?: boolean;
};

export function StatCard({ label, value, subValue, icon: Icon, highlight = false }: StatCardProps) {
  return (
    <div
      className={`rounded-2xl border p-4 backdrop-blur-xl transition hover:-translate-y-0.5 ${
        highlight
          ? "border-violet-300/40 bg-gradient-to-br from-violet-500/15 to-blue-500/10 shadow-[0_0_26px_rgba(99,102,241,0.28)]"
          : "border-blue-400/20 bg-slate-950/50 shadow-[0_0_14px_rgba(59,130,246,0.16)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-blue-300/75">{label}</p>
          <p className={`mt-2 font-semibold ${highlight ? "text-3xl text-blue-50" : "text-xl text-blue-100"}`}>
            {value}
          </p>
          {subValue ? <p className="mt-1 text-xs text-blue-200/65">{subValue}</p> : null}
        </div>
        <span className="rounded-xl border border-blue-300/25 bg-blue-500/10 p-2 text-blue-200">
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

