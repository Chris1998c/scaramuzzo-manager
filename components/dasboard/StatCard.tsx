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
      className={`relative overflow-hidden rounded-3xl border p-6 backdrop-blur-md shadow-lg transition-all
        ${variant === "warning" 
          ? "border-amber-500/40 bg-amber-950/20" 
          : "border-[#5c3a21]/50 bg-[#24140e]/60"}`}
    >
      <div className="flex flex-col gap-1">
        <span className="text-xs font-bold uppercase tracking-wider text-[#c9b299]/70">
          {label}
        </span>
        <div className="flex items-end gap-3">
          <span className="text-3xl font-black text-[#f3d8b6] tracking-tighter">
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