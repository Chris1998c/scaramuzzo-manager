import type { FiscalHealthMetrics } from "@/lib/fiscal/fetchFiscalHealthMetrics";
import type { FiscalHealthWarning } from "@/lib/fiscal/buildFiscalHealthWarnings";
import type { PrintBridgeHealthProbe } from "@/lib/fiscal/probePrintBridgeHealth";
import { Activity, AlertTriangle, Radio, Server } from "lucide-react";

function formatAge(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatCheckedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("it-IT");
}

type Props = {
  metrics: FiscalHealthMetrics;
  bridge: PrintBridgeHealthProbe;
  warnings: FiscalHealthWarning[];
  metricsError: string | null;
};

export default function FiscalHealthPanel({
  metrics,
  bridge,
  warnings,
  metricsError,
}: Props) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="rounded-xl p-2 bg-black/30 border border-white/10">
          <Activity className="text-[#f3d8b6]" size={20} strokeWidth={1.7} />
        </div>
        <div>
          <h2 className="text-lg font-extrabold text-[#f3d8b6] tracking-tight">
            Deep Fiscal Health
          </h2>
          <p className="text-xs text-[#c9b299]">
            Stato operativo pre-pilota · aggiornato al caricamento pagina
          </p>
        </div>
      </div>

      {metricsError ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
          Metriche health non disponibili: {metricsError}
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-scz-dark p-5 md:p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
          <KpiCard
            label="Pending"
            value={String(metrics.pendingCount)}
            hint={
              metrics.oldestPendingAgeMinutes != null
                ? `Più vecchio: ${formatAge(metrics.oldestPendingAgeMinutes)}`
                : undefined
            }
            tone={metrics.pendingCount > 0 ? "warn" : "neutral"}
          />
          <KpiCard
            label="Processing"
            value={String(metrics.processingCount)}
            hint={
              metrics.oldestProcessingAgeMinutes != null
                ? `Più vecchio: ${formatAge(metrics.oldestProcessingAgeMinutes)}`
                : undefined
            }
            tone={metrics.processingCount > 0 ? "warn" : "neutral"}
          />
          <KpiCard
            label="Failed 24h"
            value={String(metrics.failedLast24h)}
            tone={metrics.failedLast24h > 0 ? "err" : "neutral"}
          />
          <KpiCard
            label="Completed 24h"
            value={String(metrics.completedLast24h)}
            tone={metrics.completedLast24h > 0 ? "ok" : "neutral"}
          />
          <KpiCard
            label="Pending max età"
            value={formatAge(metrics.oldestPendingAgeMinutes)}
            tone={
              metrics.oldestPendingAgeMinutes != null &&
              metrics.oldestPendingAgeMinutes > 5
                ? "warn"
                : "neutral"
            }
          />
          <KpiCard
            label="Processing max età"
            value={formatAge(metrics.oldestProcessingAgeMinutes)}
            tone={
              metrics.oldestProcessingAgeMinutes != null &&
              metrics.oldestProcessingAgeMinutes > 5
                ? "err"
                : "neutral"
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BridgeCard bridge={bridge} />
        <WarningsCard warnings={warnings} />
      </div>
    </section>
  );
}

function KpiCard({
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
  const borders = {
    neutral: "border-white/10",
    ok: "border-emerald-500/30",
    warn: "border-amber-500/30",
    err: "border-red-500/30",
  };
  const values = {
    neutral: "text-[#f3d8b6]",
    ok: "text-emerald-200/95",
    warn: "text-amber-200/95",
    err: "text-red-200/95",
  };

  return (
    <div className={`rounded-2xl border bg-black/20 p-4 ${borders[tone]}`}>
      <div className="text-[10px] font-black tracking-[0.2em] uppercase text-white/40">
        {label}
      </div>
      <div
        className={`text-xl md:text-2xl font-extrabold tabular-nums mt-1 ${values[tone]}`}
      >
        {value}
      </div>
      {hint ? (
        <div className="text-[10px] text-[#c9b299]/80 mt-1 leading-snug">{hint}</div>
      ) : null}
    </div>
  );
}

function BridgeCard({ bridge }: { bridge: PrintBridgeHealthProbe }) {
  const online = bridge.online;
  return (
    <div className="rounded-2xl border border-white/10 bg-scz-dark p-5">
      <div className="flex items-center gap-2 mb-4">
        <Server className="text-[#f3d8b6]/80" size={18} />
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
          Print Bridge
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${
            online
              ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200/95"
              : "border-red-500/35 bg-red-500/10 text-red-200/95"
          }`}
        >
          <Radio size={14} className={online ? "text-emerald-400" : "text-red-400"} />
          {online ? "Online" : "Offline"}
        </span>
        {bridge.responseTimeMs != null ? (
          <span className="text-sm text-[#c9b299] tabular-nums">
            {bridge.responseTimeMs} ms
          </span>
        ) : (
          <span className="text-sm text-[#c9b299]/70">— ms</span>
        )}
      </div>
      <p className="mt-3 text-xs text-[#c9b299] leading-relaxed">
        Ultimo check: {formatCheckedAt(bridge.checkedAt)}
      </p>
      {bridge.error && !online ? (
        <p className="mt-2 text-xs text-red-200/80">{bridge.error}</p>
      ) : null}
      {!bridge.configured ? (
        <p className="mt-2 text-xs text-amber-200/80">
          Configura{" "}
          <code className="text-white/50">PRINT_BRIDGE_HEALTH_URL</code> sul server.
        </p>
      ) : null}
    </div>
  );
}

function WarningsCard({ warnings }: { warnings: FiscalHealthWarning[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-scz-dark p-5">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="text-amber-400/90" size={18} />
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
          Avvisi automatici
        </span>
        {warnings.length > 0 ? (
          <span className="ml-auto text-xs font-bold text-amber-200/90 tabular-nums">
            {warnings.length}
          </span>
        ) : null}
      </div>

      {warnings.length === 0 ? (
        <p className="text-sm text-emerald-200/80">
          Nessun avviso attivo sui parametri monitorati.
        </p>
      ) : (
        <ul className="space-y-2">
          {warnings.map((w) => (
            <li
              key={w.code}
              className={`rounded-xl border px-3 py-2.5 text-sm leading-snug ${
                w.severity === "red"
                  ? "border-red-500/30 bg-red-500/10 text-red-100/90"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-100/90"
              }`}
            >
              {w.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
