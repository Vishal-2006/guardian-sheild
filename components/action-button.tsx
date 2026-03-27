"use client";

import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

type ActionButtonProps = {
  label: string;
  loadingLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger" | "outline";
  className?: string;
};

const variantClasses: Record<NonNullable<ActionButtonProps["variant"]>, string> = {
  primary:
    "border-blue-300/50 bg-gradient-to-r from-blue-500/30 to-cyan-500/25 text-blue-50 hover:from-blue-500/40 hover:to-cyan-500/35",
  secondary:
    "border-emerald-300/50 bg-gradient-to-r from-emerald-500/25 to-cyan-500/20 text-emerald-100 hover:from-emerald-500/35 hover:to-cyan-500/30",
  danger:
    "border-fuchsia-300/45 bg-gradient-to-r from-fuchsia-500/25 to-rose-500/25 text-fuchsia-100 hover:from-fuchsia-500/35 hover:to-rose-500/35",
  outline:
    "border-violet-300/45 bg-violet-500/10 text-violet-100 hover:bg-violet-500/20",
};

export function ActionButton({
  label,
  loadingLabel,
  loading = false,
  disabled = false,
  onClick,
  variant = "primary",
  className = "",
}: ActionButtonProps) {
  return (
    <motion.button
      type="button"
      whileHover={{ scale: disabled ? 1 : 1.03 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      disabled={disabled || loading}
      onClick={onClick}
      className={`inline-flex w-full items-center justify-center rounded-full border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className}`}
    >
      <span className="inline-flex items-center gap-2">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {loading ? loadingLabel || `${label}...` : label}
      </span>
    </motion.button>
  );
}

