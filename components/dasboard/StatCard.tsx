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
 className={`relative rounded-xl border p-4 transition-premium
 ${variant === "warning"
 ? "border-amber-500/30 bg-amber-950/20"
 : "border-white/[0.08] bg-white/[0.03]"}`}
 >
 <div className="relative flex flex-col gap-1">
 <span className="text-xs font-medium text-white/50">
 {label}
 </span>
 <div className="flex items-end gap-2">
 <span className="text-2xl md:text-[1.65rem] font-semibold text-[#f3d8b6] tracking-tight tabular-nums">
 {value}
 </span>
 {trend ? (
 <div
 className={`mb-0.5 flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-md
 ${
 trend === "up"
 ? "text-emerald-400/90 bg-emerald-500/10"
 : trend === "down"
 ? "text-red-400/90 bg-red-500/10"
 : "text-white/40 bg-white/[0.04]"
 }`}
 aria-hidden
 >
 {trend === "up" && <TrendingUp size={12} />}
 {trend === "down" && <TrendingDown size={12} />}
 {trend === "neutral" && <Minus size={12} />}
 </div>
 ) : null}
 </div>
 <p className="text-xs text-white/45 leading-snug">{description}</p>
 </div>
 </motion.div>
 );
}