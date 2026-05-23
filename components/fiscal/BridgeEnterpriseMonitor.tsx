"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Activity,
  ChevronDown,
  ChevronUp,
  FileText,
  KeyRound,
  Plus,
  Printer,
  RefreshCw,
  Settings2,
  ShieldAlert,
  WifiOff,
} from "lucide-react";
import type { BridgeDashboardEnrichedRow } from "@/lib/bridge/buildBridgeDashboardRows";
import type { BridgeInstallationBundle } from "@/lib/bridge/fetchBridgeEnterprisePage";
import {
  deriveFiscalCassaStatus,
  extractTechnicalHealth,
  fiscalCassaStatusHint,
  fiscalCassaStatusLabel,
  formatJobActivity,
  humanProblemsFromRow,
  printerStatusLabel,
  type FiscalCassaStatus,
} from "@/lib/bridge/bridgeDashboardUi";
import { formatRelativeTimeIt } from "@/lib/bridge/formatRelativeTime";
import BridgeRunbookPanel from "@/components/fiscal/BridgeRunbookPanel";
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
  const [newBridgeId, setNewBridgeId] = useState("");
  const [newSalonId, setNewSalonId] = useState("1");
  const [mintMessage, setMintMessage] = useState<string | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);

  const allWarningCodes = useMemo(
    () => rows.flatMap((r) => r.warnings.map((w) => w.code)),
    [rows],
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
    setMintMessage(null);
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

  async function mintToken(installationId: string) {
    setError(null);
    setMintMessage(null);
    try {
      const res = await fetch(`/api/bridge/installations/${installationId}/token`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Token non generato");
      setMintMessage(`Token creato per ${data.bridge_id}. Copialo subito: non sarà più visibile.`);
      try {
        await navigator.clipboard.writeText(data.token);
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#c9b299] max-w-xl">
          Panoramica della cassa fiscale in salone. Verde = tutto ok, giallo = da controllare, grigio
          = cassa non raggiungibile.
        </p>
        <button
          type="button"
          onClick={() => refresh()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-[#f3d8b6]/25 bg-[#f3d8b6]/10 px-4 py-2.5 text-sm font-bold text-[#f3d8b6] hover:bg-[#f3d8b6]/15 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Aggiorna stato
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </div>
      ) : null}
      {mintMessage ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {mintMessage}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-center text-[#c9b299] py-12 rounded-3xl border border-white/10 bg-black/20">
          Nessuna cassa collegata. Il coordinator può registrare un nuovo collegamento in fondo alla
          pagina.
        </p>
      ) : (
        rows.map((row) => (
          <BridgeSalonPanel
            key={row.id}
            row={row}
            bundle={bundles[row.id]}
            canManage={canManage}
            canActFiscal={canActFiscal}
            onMintToken={() => mintToken(row.id)}
          />
        ))
      )}

      <BridgeRunbookPanel warningCodes={allWarningCodes} />

      {canManage ? (
        <section className="rounded-3xl border border-white/10 bg-black/20 overflow-hidden">
          <button
            type="button"
            onClick={() => setAdminOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-5 py-4 text-left hover:bg-white/[0.02]"
          >
            <span className="inline-flex items-center gap-2 text-sm font-bold text-[#c9b299]">
              <Settings2 size={18} className="text-[#f3d8b6]/80" />
              Amministrazione bridge (solo coordinator)
            </span>
            {adminOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          {adminOpen ? (
            <div className="border-t border-white/10 p-5 flex flex-wrap gap-3 items-end">
              <label className="text-xs text-[#c9b299] flex flex-col gap-1 min-w-[180px]">
                Identificativo cassa
                <input
                  value={newBridgeId}
                  onChange={(e) => setNewBridgeId(e.target.value)}
                  className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                  placeholder="es. roma_cassa_1"
                />
              </label>
              <label className="text-xs text-[#c9b299] flex flex-col gap-1">
                Salone
                <select
                  value={newSalonId}
                  onChange={(e) => setNewSalonId(e.target.value)}
                  className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                >
                  <option value="1">1 — Roma</option>
                  <option value="2">2 — Corigliano</option>
                  <option value="3">3 — Castrovillari</option>
                  <option value="4">4 — Cosenza</option>
                </select>
              </label>
              <button
                type="button"
                onClick={createInstallation}
                className="inline-flex items-center gap-2 rounded-xl bg-[#f3d8b6] px-4 py-2.5 text-sm font-extrabold text-black hover:opacity-90"
              >
                <Plus size={16} />
                Registra cassa
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function BridgeSalonPanel({
  row,
  bundle,
  canManage,
  canActFiscal,
  onMintToken,
}: {
  row: BridgeDashboardEnrichedRow;
  bundle: BridgeInstallationBundle | undefined;
  canManage: boolean;
  canActFiscal: boolean;
  onMintToken: () => void;
}) {
  const [techOpen, setTechOpen] = useState(false);
  const [jobsOpen, setJobsOpen] = useState(false);

  const status = deriveFiscalCassaStatus(row);
  const problems = humanProblemsFromRow(row);
  const printer = printerStatusLabel(row.compact_health.fpmate_reachable);
  const snap = bundle?.fiscal_snapshot ?? row.fiscal_snapshot;

  const salonTitle = row.salon_name ?? `Salone ${row.salon_id}`;

  return (
    <article className="rounded-3xl border border-[#f3d8b6]/12 bg-gradient-to-b from-[#2a2218]/80 to-scz-dark shadow-[0_8px_48px_rgba(0,0,0,0.35)] overflow-hidden">
      <header className="px-5 md:px-7 py-5 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#f3d8b6]/50">
            Punto vendita
          </p>
          <h2 className="text-xl md:text-2xl font-extrabold text-[#f3d8b6]">{salonTitle}</h2>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={onMintToken}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-[#c9b299] hover:text-[#f3d8b6] hover:border-[#f3d8b6]/30"
          >
            <KeyRound size={14} />
            Nuovo token
          </button>
        ) : null}
      </header>

      <div className="p-5 md:p-7 grid gap-4 lg:grid-cols-2">
        <CassaStatusCard
          status={status}
          lastSeen={row.last_seen_at}
          lastError={row.compact_health.last_error}
        />
        <PrinterCard printer={printer} />
        {snap ? (
          <DocumentsCard snap={snap} salonId={row.salon_id} />
        ) : (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-5 text-sm text-[#c9b299]">
            Documenti fiscali non disponibili.
          </div>
        )}
        <ProblemsCard problems={problems} />
      </div>

      {bundle && canActFiscal && snap && snap.critical_jobs.length > 0 ? (
        <div className="px-5 md:px-7 pb-4">
          <button
            type="button"
            onClick={() => setJobsOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-[#c9b299] hover:text-[#f3d8b6]"
          >
            Gestione job da sistemare ({snap.critical_jobs.length})
            {jobsOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          {jobsOpen ? (
            <div className="mt-3 rounded-2xl border border-white/10 bg-black/40 p-4">
              <FiscalJobActionCenter
                bridgeId={row.bridge_id}
                salonId={row.salon_id}
                snapshot={snap}
                canAct={canActFiscal}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="px-5 md:px-7 pb-5 md:pb-7">
        <button
          type="button"
          onClick={() => setTechOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-[#c9b299] hover:border-[#f3d8b6]/20"
        >
          <span className="font-bold">Dettagli tecnici</span>
          <span className="text-xs text-white/40 mr-2">per IT / coordinator</span>
          {techOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {techOpen && bundle ? (
          <TechnicalDetails
            row={row}
            bundle={bundle}
            canManage={canManage}
            onMintToken={onMintToken}
          />
        ) : null}
      </div>
    </article>
  );
}

function CassaStatusCard({
  status,
  lastSeen,
  lastError,
}: {
  status: FiscalCassaStatus;
  lastSeen: string | null;
  lastError: string | null;
}) {
  const styles: Record<FiscalCassaStatus, string> = {
    operativo:
      "border-emerald-500/25 bg-gradient-to-br from-emerald-950/40 to-black/50",
    attenzione:
      "border-amber-500/25 bg-gradient-to-br from-amber-950/30 to-black/50",
    offline: "border-white/15 bg-gradient-to-br from-zinc-900/80 to-black/50",
  };

  const Icon =
    status === "operativo" ? Activity : status === "attenzione" ? ShieldAlert : WifiOff;

  const iconColor =
    status === "operativo"
      ? "text-emerald-300"
      : status === "attenzione"
        ? "text-amber-300"
        : "text-white/50";

  return (
    <div className={`rounded-2xl border p-5 md:p-6 lg:col-span-2 ${styles[status]}`}>
      <div className="flex items-start gap-4">
        <div className={`rounded-2xl border border-white/10 bg-black/30 p-3 ${iconColor}`}>
          <Icon size={28} strokeWidth={1.6} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-wider text-white/45 mb-1">
            Stato cassa fiscale
          </p>
          <p className="text-3xl md:text-4xl font-extrabold text-[#f3d8b6] tracking-tight">
            {fiscalCassaStatusLabel(status)}
          </p>
          <p className="text-sm text-[#c9b299] mt-2 leading-relaxed">
            {fiscalCassaStatusHint(status)}
          </p>
          <p className="text-sm text-white/55 mt-3">
            Ultimo contatto:{" "}
            <strong className="text-[#f3d8b6] font-semibold">
              {lastSeen ? formatRelativeTimeIt(lastSeen) : "mai"}
            </strong>
          </p>
          {lastError ? (
            <p className="text-xs text-amber-200/80 mt-2 border-t border-white/10 pt-2">
              Ultimo messaggio: {lastError}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PrinterCard({
  printer,
}: {
  printer: ReturnType<typeof printerStatusLabel>;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 p-5 md:p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="rounded-xl bg-[#f3d8b6]/10 border border-[#f3d8b6]/20 p-2">
          <Printer className="text-[#f3d8b6]" size={22} />
        </div>
        <h3 className="text-base font-extrabold text-[#f3d8b6]">Stampante</h3>
      </div>
      <p
        className={`text-2xl font-bold ${
          printer.ok === true
            ? "text-emerald-200"
            : printer.ok === false
              ? "text-amber-200"
              : "text-white/60"
        }`}
      >
        {printer.label}
      </p>
      <p className="text-sm text-[#c9b299] mt-2 leading-relaxed">{printer.hint}</p>
    </div>
  );
}

function DocumentsCard({
  snap,
  salonId,
}: {
  snap: NonNullable<BridgeDashboardEnrichedRow["fiscal_snapshot"]>;
  salonId: number;
}) {
  const items = [
    { label: "Ultimo scontrino", job: snap.last_by_kind.sale_receipt },
    { label: "Ultimo annullo", job: snap.last_by_kind.void_receipt },
    { label: "Ultima chiusura Z", job: snap.last_by_kind.z_report },
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 p-5 md:p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="rounded-xl bg-[#f3d8b6]/10 border border-[#f3d8b6]/20 p-2">
          <FileText className="text-[#f3d8b6]" size={22} />
        </div>
        <h3 className="text-base font-extrabold text-[#f3d8b6]">Documenti fiscali</h3>
      </div>
      <ul className="space-y-3">
        {items.map(({ label, job }) => {
          const act = formatJobActivity(job, "Nessuno registrato");
          return (
            <li
              key={label}
              className="flex justify-between gap-3 border-b border-white/5 pb-3 last:border-0 last:pb-0"
            >
              <span className="text-sm text-[#c9b299]">{label}</span>
              <span className="text-sm text-right">
                <span className="font-bold text-[#f3d8b6] block">{act.primary}</span>
                {act.secondary ? (
                  <span className="text-white/45 text-xs">
                    {formatRelativeTimeIt(act.secondary)}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      <a
        href={`/dashboard/fiscale?salon_id=${salonId}`}
        className="inline-block mt-4 text-xs font-bold text-[#f3d8b6]/80 hover:text-[#f3d8b6] hover:underline"
      >
        Apri elenco completo documenti →
      </a>
    </div>
  );
}

function ProblemsCard({ problems }: { problems: ReturnType<typeof humanProblemsFromRow> }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 p-5 md:p-6 lg:col-span-2">
      <div className="flex items-center gap-3 mb-4">
        <div className="rounded-xl bg-[#f3d8b6]/10 border border-[#f3d8b6]/20 p-2">
          <ShieldAlert className="text-[#f3d8b6]" size={22} />
        </div>
        <h3 className="text-base font-extrabold text-[#f3d8b6]">Problemi da controllare</h3>
      </div>
      {problems.length === 0 ? (
        <p className="text-sm text-emerald-200/90 leading-relaxed">
          Nessun problema segnalato al momento. La cassa risulta regolare.
        </p>
      ) : (
        <ul className="space-y-3">
          {problems.map((p) => (
            <li
              key={p.code}
              className={`rounded-xl border px-4 py-3 ${
                p.tone === "red"
                  ? "border-amber-500/20 bg-amber-500/5"
                  : "border-[#f3d8b6]/15 bg-[#f3d8b6]/5"
              }`}
            >
              <p className="text-sm font-bold text-[#f3d8b6]">{p.title}</p>
              <p className="text-sm text-[#c9b299] mt-1">{p.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TechnicalDetails({
  row,
  bundle,
}: {
  row: BridgeDashboardEnrichedRow;
  bundle: BridgeInstallationBundle;
  canManage: boolean;
  onMintToken: () => void;
}) {
  const tech = extractTechnicalHealth(row.last_health ?? {});
  const healthJson = JSON.stringify(row.last_health ?? {}, null, 2);

  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-black/50 p-4 md:p-5 space-y-4 text-xs font-mono text-[#c9b299]">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 not-font-mono">
        <TechField label="bridge_id" value={row.bridge_id} />
        <TechField label="versione" value={row.version ?? tech.node_version ?? "—"} />
        <TechField label="node" value={tech.node_version ?? "—"} />
        <TechField label="hostname" value={tech.hostname ?? "—"} />
        <TechField label="journal" value={tech.journal_path ?? "—"} className="sm:col-span-2" />
        <TechField
          label="Manager"
          value={
            row.compact_health.supabase_reachable === true
              ? "OK"
              : row.compact_health.supabase_reachable === false
                ? "NO"
                : "?"
          }
        />
        <TechField label="online" value={row.online ? "sì" : "no"} />
      </div>

      <div>
        <p className="text-[10px] uppercase text-white/40 mb-1 not-font-mono font-bold">
          Coda (raw)
        </p>
        <pre className="overflow-x-auto rounded-xl bg-black/60 border border-white/10 p-3 text-[10px] text-white/70">
          {JSON.stringify(tech.queue_raw, null, 2)}
        </pre>
      </div>

      <div>
        <p className="text-[10px] uppercase text-white/40 mb-1 not-font-mono font-bold">
          Ultimi heartbeat ({bundle.heartbeats.length})
        </p>
        <div className="max-h-40 overflow-y-auto rounded-xl border border-white/10">
          <table className="w-full text-[10px] not-font-mono">
            <thead className="bg-black/60 text-white/45 sticky top-0">
              <tr>
                <th className="px-2 py-1 text-left">Quando</th>
                <th className="px-2 py-1">Stato</th>
                <th className="px-2 py-1">Coda</th>
              </tr>
            </thead>
            <tbody>
              {bundle.heartbeats.map((hb) => (
                <tr key={hb.id} className="border-t border-white/5">
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
      </div>

      <div>
        <p className="text-[10px] uppercase text-white/40 mb-1 not-font-mono font-bold">
          Heartbeat JSON (ultimo)
        </p>
        <pre className="max-h-56 overflow-auto rounded-xl bg-black/60 border border-white/10 p-3 text-[10px] text-white/60">
          {healthJson}
        </pre>
      </div>
    </div>
  );
}

function TechField({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[10px] uppercase text-white/40">{label}</p>
      <p className="text-sm font-semibold text-[#f3d8b6] break-all">{value}</p>
    </div>
  );
}
