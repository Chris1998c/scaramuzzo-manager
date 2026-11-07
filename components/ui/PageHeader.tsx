import type { ReactNode } from "react";

/** Intestazione pagina sobria: titolo + meta + azioni (niente hero/card/eyebrow). */
export function PageHeader({
  title,
  meta,
  actions,
  children,
}: {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl md:text-2xl font-semibold text-[#f3d8b6] tracking-tight truncate">
            {title}
          </h1>
          {meta ? <div className="text-sm text-white/50">{meta}</div> : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
        ) : null}
      </div>
      {children}
    </header>
  );
}

export function PageShell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`max-w-[1600px] mx-auto px-3 py-4 md:px-5 md:py-5 space-y-4 text-white ${className}`}>
      {children}
    </div>
  );
}

export function PageToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 rounded-xl border border-white/[0.08] bg-scz-dark/80 p-2.5">
      {children}
    </div>
  );
}

export function PagePanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-white/[0.08] bg-scz-dark overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}

export function StatChip({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "ok" | "warn" | "err";
}) {
  const toneCls =
    tone === "ok"
      ? "text-emerald-300"
      : tone === "err"
        ? "text-red-300"
        : tone === "warn"
          ? "text-amber-200"
          : "text-[#f3d8b6]";

  return (
    <div className="inline-flex items-baseline gap-1.5 rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5">
      <span className="text-xs text-white/45">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${toneCls}`}>{value}</span>
    </div>
  );
}

export const sczField =
  "w-full min-w-0 rounded-lg bg-black/25 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-[#f3d8b6]/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f3d8b6]/35";

export const sczBtnGhost =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-[#f3d8b6]/90 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d8b6]/50 disabled:opacity-40 transition";

export const sczBtnPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#f3d8b6] px-3.5 py-2 text-sm font-semibold text-[#1c0f0a] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d8b6] disabled:opacity-40 transition";

export const sczBtnSuccess =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/90 px-3.5 py-2 text-sm font-semibold text-black hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:opacity-40 transition";

export const sczBtnDanger =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-500/90 px-3.5 py-2 text-sm font-semibold text-white hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 disabled:opacity-40 transition";
