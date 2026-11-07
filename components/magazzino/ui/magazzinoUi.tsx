import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  PageHeader,
  PageShell,
  PageToolbar,
  sczBtnGhost,
  sczField,
} from "@/components/ui/PageHeader";

export function MagazzinoPageShell({
  children,
  compact: _compact,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  return <PageShell className="bg-transparent min-h-screen">{children}</PageShell>;
}

export function MagazzinoHero({
  title,
  subtitle,
  icon: Icon,
  actions,
  compact: _compact,
  eyebrow: _eyebrow,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  icon: LucideIcon;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <PageHeader
      title={title}
      meta={
        <span className="inline-flex items-center gap-2 min-w-0">
          <Icon className="shrink-0 text-[#f3d8b6]/80" size={16} strokeWidth={1.85} aria-hidden />
          {subtitle ? <span className="min-w-0">{subtitle}</span> : null}
        </span>
      }
      actions={actions}
    />
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
  const kindLabel =
    contextKind === "central"
      ? "Hub centrale"
      : contextKind === "reception"
        ? "Reception"
        : "Salone";

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-white/55">
      <span className="text-white/40">{kindLabel}</span>
      <span className="font-medium text-white/85 truncate">{contextLabel}</span>
      {hint ? <span className="text-white/40">· {hint}</span> : null}
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
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5">
      <div className="text-xs font-medium text-white/50 mb-0.5">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${valueClass}`}>{value}</div>
      {hint ? <div className="text-[11px] text-white/40 mt-0.5">{hint}</div> : null}
    </div>
  );
}

export function MagazzinoKpiRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">{children}</div>;
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
    <Link
      href={href}
      className={[
        "group flex items-center gap-3 rounded-xl px-3.5 py-3 border transition-premium",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d8b6]/50",
        accent === "primary"
          ? "border-emerald-500/30 bg-emerald-600/10 hover:bg-emerald-600/15"
          : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.12]",
      ].join(" ")}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-black/25 text-[#f3d8b6] shrink-0">
        <Icon size={18} strokeWidth={1.85} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[#f3d8b6] truncate">{title}</span>
        <span className="block text-xs text-white/45 truncate">{subtitle}</span>
      </span>
    </Link>
  );
}

export function MagazzinoFilterPanel({
  title: _title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return <PageToolbar>{children}</PageToolbar>;
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
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-white/45">
      {totalLabel ? <p className="tabular-nums">{totalLabel}</p> : <span />}
      <div className="flex items-center gap-2">
        <button type="button" disabled={page <= 1} className={sczBtnGhost} onClick={onPrev}>
          Precedente
        </button>
        <span className="tabular-nums px-1">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          disabled={page >= pageCount}
          className={sczBtnGhost}
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
      ? "bg-emerald-500/15 text-emerald-300"
      : tone === "err"
        ? "bg-red-500/15 text-red-300"
        : tone === "warn"
          ? "bg-amber-500/15 text-amber-200"
          : tone === "info"
            ? "bg-[#f3d8b6]/12 text-[#f3d8b6]"
            : "bg-white/10 text-white/70";

  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium ${cls}`}>
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
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3">
      <div className="text-sm text-amber-100/90">
        <div className="font-semibold">{title}</div>
        {children ? <div className="opacity-90 mt-0.5 text-amber-100/80">{children}</div> : null}
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
      className={sczField}
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
    <Link href={href} className={sczBtnGhost}>
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
