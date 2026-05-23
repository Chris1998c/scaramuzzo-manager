"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  KeyRound,
  Plus,
  RefreshCw,
  Settings2,
} from "lucide-react";
import type { BridgeDashboardEnrichedRow } from "@/lib/bridge/buildBridgeDashboardRows";
import type { BridgeInstallationBundle } from "@/lib/bridge/fetchBridgeEnterprisePage";
import {
  compactJobTimeLabel,
  computeBridgeFleetKpis,
  deriveFiscalCassaStatus,
  extractTechnicalHealth,
  formatJobActivity,
  humanProblemsFromRow,
  partitionBridgeRows,
  printerStatusLabel,
  fiscalCassaStatusLabel,
  type FiscalCassaStatus,
} from "@/lib/bridge/bridgeDashboardUi";
import { formatRelativeTimeIt } from "@/lib/bridge/formatRelativeTime";
import BridgeRunbookPanel from "@/components/fiscal/BridgeRunbookPanel";
import BridgeTokenMintModal from "@/components/fiscal/BridgeTokenMintModal";
import FiscalJobActionCenter from "@/components/fiscal/FiscalJobActionCenter";

type Props = {
  initialRows: BridgeDashboardEnrichedRow[];
  initialBundles: Record<string, BridgeInstallationBundle>;
  canManage: boolean;
  canActFiscal: boolean;
  salonFilter: number | null;
};

export default function BridgeEnterpriseMonitor({
  initialRows,
  initialBundles,
  canManage,
  canActFiscal,
  salonFilter,
}: Props) {
  const [rows, setRows] = useState(initialRows);
  const [bundles, setBundles] = useState(initialBundles);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newBridgeId, setNewBridgeId] = useState("");
  const [newSalonId, setNewSalonId] = useState("1");
  const [mintedToken, setMintedToken] = useState<{ token: string; bridge_id: string } | null>(
    null,
  );
  const [runbookOpen, setRunbookOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [devOpen, setDevOpen] = useState(false);

  const { production: productionRows, development: devRows } = useMemo(
    () => partitionBridgeRows(rows),
    [rows],
  );

  const kpis = useMemo(
    () => computeBridgeFleetKpis(productionRows, bundles),
    [productionRows, bundles],
  );

  const allWarningCodes = useMemo(
    () => productionRows.flatMap((r) => r.warnings.map((w) => w.code)),
    [productionRows],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs =
        salonFilter != null ? `?salon_id=${encodeURIComponent(String(salonFilter))}` : "";
      const res = await fetch(`/api/bridge/installations${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Errore caricamento");
      setRows(data.rows ?? data.installations ?? []);
      if (data.bundles) setBundles(data.bundles);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setLoading(false);
    }
  }, [salonFilter]);

  async function createInstallation() {
    setError(null);
    try {
      const res = await fetch("/api/bridge/installations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bridge_id: newBridgeId.trim(),
          salon_id: Number(newSalonId),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Creazione fallita");
      setNewBridgeId("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    }
  }

  async function mintToken(installationId: string, bridgeId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/bridge/installations/${installationId}/token`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Token non generato");
      if (typeof data.token !== "string" || !data.token) {
        throw new Error("Token non restituito dal server");
      }
      setMintedToken({
        token: data.token,
        bridge_id: String(data.bridge_id ?? bridgeId),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => refresh()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-[#f3d8b6]/25 bg-[#f3d8b6]/10 px-4 py-2 text-sm font-bold text-[#f3d8b6] hover:bg-[#f3d8b6]/15 disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          Aggiorna
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-100">
          {error}
        </div>
      ) : null}

      <BridgeTokenMintModal
        open={mintedToken != null}
        token={mintedToken?.token ?? ""}
        bridgeId={mintedToken?.bridge_id ?? ""}
        onClose={() => setMintedToken(null)}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <KpiCard label="Totale casse" value={kpis.total} />
        <KpiCard label="Online" value={kpis.online} tone="ok" />
        <KpiCard label="Attenzione" value={kpis.attenzione} tone="warn" />
        <KpiCard label="Offline" value={kpis.offline} tone="muted" />
        <KpiCard
          label="Job critici"
          value={kpis.criticalJobs}
          tone={kpis.criticalJobs > 0 ? "warn" : "neutral"}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {productionRows.length === 0 ? (
        <p className="text-center text-sm text-[#c9b299] py-8 rounded-2xl border border-white/10 bg-black/20">
          Nessuna cassa reale registrata.
          {canManage ? " Usa Amministrazione bridge per registrarne una." : ""}
        </p>
      ) : (
        <section className="space-y-2">
          {productionRows.map((row) => (
            <CompactCassaRow
              key={row.id}
              row={row}
              bundle={bundles[row.id]}
              expanded={expandedId === row.id}
              onToggle={() =>
                setExpandedId((id) => (id === row.id ? null : row.id))
              }
              canActFiscal={canActFiscal}
              canManage={canManage}
              onMintToken={() => mintToken(row.id, row.bridge_id)}
            />
          ))}
        </section>
      )}

      <CollapsibleBlock
        title="Guida problemi"
        icon={<BookOpen size={17} className="text-[#f3d8b6]/80" />}
        open={runbookOpen}
        onToggle={() => setRunbookOpen((v) => !v)}
      >
        <BridgeRunbookPanel warningCodes={allWarningCodes} />
      </CollapsibleBlock>

      {canManage ? (
        <CollapsibleBlock
          title="Amministrazione bridge"
          subtitle="Coordinator — registra cassa, token, ambienti dev"
          icon={<Settings2 size={17} className="text-[#f3d8b6]/80" />}
          open={adminOpen}
          onToggle={() => setAdminOpen((v) => !v)}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 items-end">
              <label className="text-xs text-[#c9b299] flex flex-col gap-1 min-w-[160px] flex-1">
                Identificativo cassa
                <input
                  value={newBridgeId}
                  onChange={(e) => setNewBridgeId(e.target.value)}
                  className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                  placeholder="es. roma_cassa_1"
                />
              </label>
              <label className="text-xs text-[#c9b299] flex flex-col gap-1">
                Salone
                <select
                  value={newSalonId}
                  onChange={(e) => setNewSalonId(e.target.value)}
                  className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                >
                  <option value="1">Roma</option>
                  <option value="2">Corigliano</option>
                  <option value="3">Castrovillari</option>
                  <option value="4">Cosenza</option>
                </select>
              </label>
              <button
                type="button"
                onClick={createInstallation}
                className="inline-flex items-center gap-2 rounded-xl bg-[#f3d8b6] px-4 py-2 text-sm font-extrabold text-black"
              >
                <Plus size={15} />
                Registra cassa
              </button>
            </div>

            {devRows.length > 0 ? (
              <CollapsibleBlock
                title={`Ambienti di sviluppo (${devRows.length})`}
                subtitle="Test locale — non casse reali"
                icon={<FlaskConical size={16} className="text-violet-300/80" />}
                open={devOpen}
                onToggle={() => setDevOpen((v) => !v)}
                variant="dev"
              >
                <div className="space-y-2">
                  {devRows.map((row) => (
                    <DevCassaRow
                      key={row.id}
                      row={row}
                      onMintToken={() => mintToken(row.id, row.bridge_id)}
                    />
                  ))}
                </div>
              </CollapsibleBlock>
            ) : null}
          </div>
        </CollapsibleBlock>
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone = "neutral",
  className = "",
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn" | "muted" | "neutral";
  className?: string;
}) {
  const valueCls =
    tone === "ok"
      ? "text-emerald-200"
      : tone === "warn"
        ? "text-amber-200"
        : tone === "muted"
          ? "text-white/50"
          : "text-[#f3d8b6]";
  return (
    <div
      className={`rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 ${className}`}
    >
      <p className="text-[10px] font-black uppercase tracking-wider text-white/40">{label}</p>
      <p className={`text-2xl font-extrabold tabular-nums mt-0.5 ${valueCls}`}>{value}</p>
    </div>
  );
}

function CollapsibleBlock({
  title,
  subtitle,
  icon,
  open,
  onToggle,
  variant = "default",
  children,
}: {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  open: boolean;
  onToggle: () => void;
  variant?: "default" | "dev";
  children: ReactNode;
}) {
  const border =
    variant === "dev"
      ? "border-dashed border-violet-400/25"
      : "border-white/10";
  return (
    <section className={`rounded-2xl border ${border} bg-black/20 overflow-hidden`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-white/[0.02]"
      >
        <span className="inline-flex items-center gap-2 min-w-0">
          {icon}
          <span className="min-w-0">
            <span className="block text-sm font-bold text-[#c9b299]">{title}</span>
            {subtitle ? (
              <span className="block text-[10px] text-white/40 truncate">{subtitle}</span>
            ) : null}
          </span>
        </span>
        {open ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
      </button>
      {open ? <div className="border-t border-white/10 px-4 pb-4">{children}</div> : null}
    </section>
  );
}

function StatusBadge({ status }: { status: FiscalCassaStatus }) {
  const cls =
    status === "operativo"
      ? "bg-emerald-500/15 text-emerald-200 border-emerald-500/30"
      : status === "attenzione"
        ? "bg-amber-500/15 text-amber-200 border-amber-500/30"
        : "bg-white/10 text-white/55 border-white/15";
  return (
    <span
      className={`shrink-0 inline-flex rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${cls}`}
    >
      {fiscalCassaStatusLabel(status)}
    </span>
  );
}

function MintTokenButton({
  onClick,
  variant = "production",
}: {
  onClick: () => void;
  variant?: "production" | "dev";
}) {
  const cls =
    variant === "dev"
      ? "border-violet-400/30 text-violet-100 hover:bg-violet-500/15"
      : "border-white/15 text-[#c9b299] hover:text-[#f3d8b6] hover:border-[#f3d8b6]/30 hover:bg-[#f3d8b6]/5";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1 rounded-lg border px-2.5 py-2 text-[10px] font-bold whitespace-nowrap ${cls}`}
    >
      <KeyRound size={12} />
      Nuovo token
    </button>
  );
}

function CompactCassaRow({
  row,
  bundle,
  expanded,
  onToggle,
  canActFiscal,
  canManage,
  onMintToken,
}: {
  row: BridgeDashboardEnrichedRow;
  bundle: BridgeInstallationBundle | undefined;
  expanded: boolean;
  onToggle: () => void;
  canActFiscal: boolean;
  canManage: boolean;
  onMintToken: () => void;
}) {
  const status = deriveFiscalCassaStatus(row);
  const printer = printerStatusLabel(row.compact_health.fpmate_reachable);
  const snap = bundle?.fiscal_snapshot ?? row.fiscal_snapshot;
  const criticalCount = snap?.critical_jobs.length ?? 0;
  const salonTitle = row.salon_name ?? `Salone ${row.salon_id}`;

  const saleLabel = snap
    ? compactJobTimeLabel(snap.last_by_kind.sale_receipt, "—")
    : "—";
  const zLabel = snap ? compactJobTimeLabel(snap.last_by_kind.z_report, "—") : "—";

  return (
    <article className="rounded-2xl border border-[#f3d8b6]/10 bg-gradient-to-r from-[#2a2218]/60 to-black/40 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-stretch min-h-[120px] max-h-[180px]">
        <div className="flex-1 px-4 py-3 flex flex-col justify-center gap-1.5 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-base font-extrabold text-[#f3d8b6] truncate">{salonTitle}</h3>
              <p className="text-[11px] font-mono text-[#c9b299]/80 truncate">{row.bridge_id}</p>
            </div>
            <StatusBadge status={status} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[#c9b299]">
            <span>
              Contatto:{" "}
              <strong className="text-white/70">
                {row.last_seen_at ? formatRelativeTimeIt(row.last_seen_at) : "mai"}
              </strong>
            </span>
            <span>
              Stampante:{" "}
              <strong
                className={
                  printer.ok === true
                    ? "text-emerald-300/90"
                    : printer.ok === false
                      ? "text-amber-300/90"
                      : "text-white/50"
                }
              >
                {printer.ok === true ? "OK" : printer.ok === false ? "NO" : "?"}
              </strong>
            </span>
            <span>
              Scontrino: <strong className="text-white/70">{saleLabel}</strong>
            </span>
            <span>
              Z: <strong className="text-white/70">{zLabel}</strong>
            </span>
            <span>
              Job critici:{" "}
              <strong className={criticalCount > 0 ? "text-amber-300" : "text-white/70"}>
                {criticalCount}
              </strong>
            </span>
          </div>
        </div>
        <div className="flex sm:flex-col items-stretch justify-center gap-1.5 border-t sm:border-t-0 sm:border-l border-white/10 px-3 py-2 sm:py-3 shrink-0">
          {canManage ? <MintTokenButton onClick={onMintToken} /> : null}
          <button
            type="button"
            onClick={onToggle}
            className="rounded-lg border border-[#f3d8b6]/30 bg-[#f3d8b6]/10 px-4 py-2 text-xs font-bold text-[#f3d8b6] hover:bg-[#f3d8b6]/20 whitespace-nowrap"
          >
            {expanded ? "Chiudi" : "Dettagli"}
          </button>
        </div>
      </div>
      {expanded && bundle ? (
        <ExpandedCassaDetails
          row={row}
          bundle={bundle}
          canActFiscal={canActFiscal}
        />
      ) : null}
    </article>
  );
}

function ExpandedCassaDetails({
  row,
  bundle,
  canActFiscal,
}: {
  row: BridgeDashboardEnrichedRow;
  bundle: BridgeInstallationBundle;
  canActFiscal: boolean;
}) {
  const problems = humanProblemsFromRow(row);
  const snap = bundle.fiscal_snapshot ?? row.fiscal_snapshot;
  const tech = extractTechnicalHealth(row.last_health ?? {});
  const healthJson = JSON.stringify(row.last_health ?? {}, null, 2);

  const docItems = snap
    ? [
        { label: "Ultimo scontrino", job: snap.last_by_kind.sale_receipt },
        { label: "Ultimo annullo", job: snap.last_by_kind.void_receipt },
        { label: "Ultima Z", job: snap.last_by_kind.z_report },
      ]
    : [];

  return (
    <div className="border-t border-white/10 bg-black/40 px-4 py-4 space-y-4 text-sm">
      <div>
        <h4 className="text-xs font-black uppercase tracking-wider text-[#f3d8b6]/60 mb-2">
          Problemi da controllare
        </h4>
        {problems.length === 0 ? (
          <p className="text-xs text-emerald-200/80">Nessun problema segnalato.</p>
        ) : (
          <ul className="space-y-2">
            {problems.map((p) => (
              <li
                key={p.code}
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs"
              >
                <p className="font-bold text-[#f3d8b6]">{p.title}</p>
                <p className="text-[#c9b299] mt-0.5">{p.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {snap ? (
        <div>
          <h4 className="text-xs font-black uppercase tracking-wider text-[#f3d8b6]/60 mb-2">
            Documenti fiscali
          </h4>
          <ul className="grid sm:grid-cols-3 gap-2 text-xs">
            {docItems.map(({ label, job }) => {
              const act = formatJobActivity(job, "Nessuno");
              return (
                <li key={label} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                  <p className="text-[#c9b299]">{label}</p>
                  <p className="font-bold text-[#f3d8b6]">{act.primary}</p>
                  {act.secondary ? (
                    <p className="text-white/40">{formatRelativeTimeIt(act.secondary)}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <a
            href={`/dashboard/fiscale?salon_id=${row.salon_id}`}
            className="inline-block mt-2 text-xs font-bold text-[#f3d8b6]/80 hover:underline"
          >
            Elenco completo job →
          </a>
        </div>
      ) : null}

      {canActFiscal && snap && snap.critical_jobs.length > 0 ? (
        <div>
          <h4 className="text-xs font-black uppercase tracking-wider text-[#f3d8b6]/60 mb-2">
            Job critici
          </h4>
          <FiscalJobActionCenter
            bridgeId={row.bridge_id}
            salonId={row.salon_id}
            snapshot={snap}
            canAct={canActFiscal}
          />
        </div>
      ) : null}

      <div>
        <h4 className="text-xs font-black uppercase tracking-wider text-[#f3d8b6]/60 mb-2">
          Ultimi heartbeat
        </h4>
        {bundle.heartbeats.length === 0 ? (
          <p className="text-xs text-[#c9b299]">Nessuno storico.</p>
        ) : (
          <div className="max-h-32 overflow-y-auto rounded-lg border border-white/10">
            <table className="w-full text-[10px]">
              <thead className="bg-black/50 text-white/45 sticky top-0">
                <tr>
                  <th className="px-2 py-1 text-left">Quando</th>
                  <th className="px-2 py-1">Stato</th>
                  <th className="px-2 py-1">Coda</th>
                </tr>
              </thead>
              <tbody>
                {bundle.heartbeats.map((hb) => (
                  <tr key={hb.id} className="border-t border-white/5 text-[#c9b299]">
                    <td className="px-2 py-1">{formatRelativeTimeIt(hb.created_at)}</td>
                    <td className="px-2 py-1">{hb.status ?? "—"}</td>
                    <td className="px-2 py-1 tabular-nums">
                      {String(hb.health.queue_pending ?? "—")}/
                      {String(hb.health.queue_processing ?? "—")}/
                      {String(hb.health.queue_failed ?? "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h4 className="text-xs font-black uppercase tracking-wider text-[#f3d8b6]/60 mb-2">
          Dettagli tecnici
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono mb-2">
          <span className="text-white/40">
            bridge_id <span className="text-[#f3d8b6] block">{row.bridge_id}</span>
          </span>
          <span className="text-white/40">
            version <span className="text-[#f3d8b6] block">{row.version ?? "—"}</span>
          </span>
          <span className="text-white/40">
            node <span className="text-[#f3d8b6] block">{tech.node_version ?? "—"}</span>
          </span>
          <span className="text-white/40">
            journal <span className="text-[#f3d8b6] block truncate">{tech.journal_path ?? "—"}</span>
          </span>
        </div>
        <pre className="text-[10px] max-h-40 overflow-auto rounded-lg bg-black/60 border border-white/10 p-2 text-white/55">
          {JSON.stringify(tech.queue_raw, null, 2)}
        </pre>
        <pre className="text-[10px] max-h-48 overflow-auto rounded-lg bg-black/60 border border-white/10 p-2 text-white/50 mt-2">
          {healthJson}
        </pre>
      </div>
    </div>
  );
}

function DevCassaRow({
  row,
  onMintToken,
}: {
  row: BridgeDashboardEnrichedRow;
  onMintToken: () => void;
}) {
  const status = deriveFiscalCassaStatus(row);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-400/20 bg-violet-950/20 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-mono font-bold text-violet-100 truncate">{row.bridge_id}</p>
        <p className="text-[10px] text-violet-200/50">
          {row.salon_name ?? `Salone ${row.salon_id}`} ·{" "}
          {row.last_seen_at ? formatRelativeTimeIt(row.last_seen_at) : "mai"}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <StatusBadge status={status} />
        <MintTokenButton onClick={onMintToken} variant="dev" />
      </div>
    </div>
  );
}
