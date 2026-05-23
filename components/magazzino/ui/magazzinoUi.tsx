import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";

export function MagazzinoPageShell({
  children,
  compact,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`px-4 sm:px-6 ${compact ? "py-6" : "py-8"} bg-[#1A0F0A] min-h-screen text-white space-y-5`}
    >
      {children}
    </div>
  );
}

export function MagazzinoHero({
  eyebrow = "Magazzino",
  title,
  subtitle,
  icon: Icon,
  actions,
  compact,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  icon: LucideIcon;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="rounded-2xl md:rounded-3xl border border-white/10 bg-scz-dark shadow-[0_0_40px_rgba(0,0,0,0.22)] overflow-hidden">
      <div
        className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${compact ? "p-4 md:p-5" : "p-5 md:p-6"} bg-black/20 border-b border-white/10`}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 rounded-xl md:rounded-2xl p-2.5 md:p-3 bg-black/30 border border-white/10">
            <Icon className="text-[#f3d8b6]" size={compact ? 22 : 26} strokeWidth={1.7} />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-wider text-white/50 mb-0.5">
              {eyebrow}
            </div>
            <h1
              className={`${compact ? "text-xl md:text-2xl" : "text-2xl md:text-3xl"} font-extrabold text-[#f3d8b6] tracking-tight`}
            >
              {title}
            </h1>
            {subtitle ? (
              <div className="text-white/60 mt-1 text-sm leading-relaxed">{subtitle}</div>
            ) : null}
          </div>
        </div>
        {actions ? <div className="shrink-0 self-start sm:self-center">{actions}</div> : null}
      </div>
    </div>
  );
}

export function MagazzinoSalonContextBar({
  contextLabel,
  contextKind,
  hint,
}: {
  contextLabel: string;
  contextKind: "central" | "warehouse_salon" | "reception" | "other";
  hint?: string;
}) {
  const badgeClass =
    contextKind === "central"
      ? "bg-[#f3d8b6]/15 text-[#f3d8b6] border-[#f3d8b6]/30"
      : contextKind === "reception"
        ? "bg-sky-500/15 text-sky-200 border-sky-400/30"
        : "bg-emerald-500/15 text-emerald-200 border-emerald-400/30";

  const badgeLabel =
    contextKind === "central"
      ? "Hub centrale"
      : contextKind === "reception"
        ? "Reception salone"
        : "Salone attivo";

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <span
          className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${badgeClass}`}
        >
          {badgeLabel}
        </span>
        <span className="text-sm font-semibold text-white/90 truncate">{contextLabel}</span>
      </div>
      {hint ? <span className="text-xs text-white/45">{hint}</span> : null}
    </div>
  );
}

export function MagazzinoKpiCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "ok" | "warn" | "err";
}) {
  const valueClass =
    tone === "warn"
      ? "text-amber-300"
      : tone === "err"
        ? "text-red-400"
        : tone === "ok"
          ? "text-emerald-300"
          : "text-[#f3d8b6]";

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="text-[10px] font-black uppercase tracking-wider text-white/50 mb-1">
        {label}
      </div>
      <div className={`text-2xl font-extrabold tabular-nums ${valueClass}`}>{value}</div>
      {hint ? <div className="text-[11px] text-white/45 mt-1">{hint}</div> : null}
    </div>
  );
}

export function MagazzinoKpiRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">{children}</div>;
}

export function MagazzinoNavCard({
  href,
  icon: Icon,
  title,
  subtitle,
  accent = "default",
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  accent?: "default" | "primary";
}) {
  return (
    <Link href={href} className="block group">
      <div
        className={`rounded-xl border p-4 md:p-5 transition h-full ${
          accent === "primary"
            ? "border-emerald-500/30 bg-emerald-600/10 hover:bg-emerald-600/15"
            : "border-white/10 bg-scz-dark hover:bg-black/30 hover:border-white/20"
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-lg p-2 bg-black/30 border border-white/10 group-hover:border-[#f3d8b6]/25 transition">
            <Icon className="text-[#f3d8b6]" size={22} strokeWidth={1.7} />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-white">{title}</div>
            <div className="text-xs text-white/55 mt-1 leading-relaxed">{subtitle}</div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function MagazzinoFilterPanel({
  title = "Filtri",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-scz-dark p-4 space-y-3">
      <div className="text-[10px] font-black uppercase tracking-wider text-white/50">{title}</div>
      {children}
    </div>
  );
}

export function MagazzinoPagination({
  page,
  pageCount,
  totalLabel,
  onPrev,
  onNext,
}: {
  page: number;
  pageCount: number;
  totalLabel?: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (pageCount <= 1) return null;

  return (
    <div className="space-y-2">
      {totalLabel ? <p className="text-xs text-white/45 text-center">{totalLabel}</p> : null}
      <div className="flex items-center justify-between gap-3 px-1">
        <button
          type="button"
          disabled={page <= 1}
          className="px-3 py-2 rounded-lg text-sm font-semibold text-[#f3d8b6] border border-white/10 disabled:opacity-40 hover:bg-white/5"
          onClick={onPrev}
        >
          Precedente
        </button>
        <span className="text-xs text-white/50 tabular-nums">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          disabled={page >= pageCount}
          className="px-3 py-2 rounded-lg text-sm font-semibold text-[#f3d8b6] border border-white/10 disabled:opacity-40 hover:bg-white/5"
          onClick={onNext}
        >
          Successiva
        </button>
      </div>
    </div>
  );
}

export function MagazzinoStatusBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "ok" | "warn" | "err" | "info";
}) {
  const cls =
    tone === "ok"
      ? "bg-emerald-500/20 text-emerald-300"
      : tone === "err"
        ? "bg-red-500/20 text-red-300"
        : tone === "warn"
          ? "bg-amber-500/20 text-amber-200"
          : tone === "info"
            ? "bg-[#f3d8b6]/15 text-[#f3d8b6]"
            : "bg-white/10 text-white/70";

  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${cls}`}
    >
      {label}
    </span>
  );
}

export function MagazzinoAlertBanner({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="text-sm text-amber-200/90">
        <div className="font-semibold">{title}</div>
        {children ? <div className="opacity-90 mt-0.5">{children}</div> : null}
      </div>
    </div>
  );
}

export function MagazzinoSearchInput({
  value,
  onChange,
  placeholder = "Nome o barcode…",
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
}) {
  return (
    <input
      className="w-full p-3 rounded-xl bg-black/30 border border-white/10 text-white placeholder:text-white/40 focus:border-[#f3d8b6]/50 focus:outline-none focus:ring-1 focus:ring-[#f3d8b6]/30"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSubmit?.();
      }}
    />
  );
}

export function MagazzinoBackLink({ href, label = "Indietro" }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 bg-black/30 border border-white/10 text-[#f3d8b6] text-sm font-semibold hover:bg-black/40 transition"
    >
      {label}
    </Link>
  );
}

export function MagazzinoLoading({ label = "Caricamento…" }: { label?: string }) {
  return (
    <MagazzinoPageShell compact>
      <p className="text-white/60 text-sm">{label}</p>
    </MagazzinoPageShell>
  );
}
