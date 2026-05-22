// components/dashboard/StatCard.tsx
"use client";

import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  description: string;
  trend?: "up" | "down" | "neutral";
  variant?: "default" | "warning";
}

export function StatCard({ label, value, description, trend, variant = "default" }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl border p-6 transition-premium
        shadow-[0_1px_0_rgba(255,255,255,0.05)_inset,0_14px_36px_-18px_rgba(0,0,0,0.55)]
        hover:shadow-[0_1px_0_rgba(255,255,255,0.07)_inset,0_18px_44px_-16px_rgba(0,0,0,0.6)]
        ${variant === "warning"
          ? "border-amber-500/35 bg-gradient-to-br from-amber-950/30 via-[#24140e]/50 to-[#1a0c07]/70"
          : "border-white/[0.08] bg-gradient-to-br from-[#2a1610]/60 via-[#24140e]/45 to-[#160a06]/75"}`}
    >
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-px ${
          variant === "warning"
            ? "bg-gradient-to-r from-transparent via-amber-400/40 to-transparent"
            : "bg-gradient-to-r from-transparent via-[#f3d8b6]/25 to-transparent"
        }`}
        aria-hidden
      />
      <div className="relative flex flex-col gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#c9b299]/75">
          {label}
        </span>
        <div className="flex items-end gap-3">
          <span className="text-[1.65rem] md:text-3xl font-black text-[#f3d8b6] tracking-tight tabular-nums">
            {value}
          </span>
          {trend && (
            <div className={`mb-1 flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full border 
              ${trend === 'up' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 
                trend === 'down' ? 'text-red-400 border-red-500/30 bg-red-500/10' : 
                'text-[#c9b299] border-[#5c3a21]/30 bg-black/20'}`}>
              {trend === 'up' && <TrendingUp size={12} />}
              {trend === 'down' && <TrendingDown size={12} />}
              {trend === 'neutral' && <Minus size={12} />}
            </div>
          )}
        </div>
        <p className="mt-2 text-sm text-[#c9b299] leading-relaxed">
          {description}
        </p>
      </div>

      {/* Effetto luce decorativa */}
      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-[#f3d8b6]/5 blur-2xl pointer-events-none" />
    </motion.div>
  );
}