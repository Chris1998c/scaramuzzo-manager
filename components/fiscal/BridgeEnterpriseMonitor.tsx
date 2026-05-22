"use client";

import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Plus,
  Radio,
  RefreshCw,
} from "lucide-react";
import type { BridgeDashboardEnrichedRow } from "@/lib/bridge/buildBridgeDashboardRows";
import type { BridgeInstallationBundle } from "@/lib/bridge/fetchBridgeEnterprisePage";
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
  const [expandedId, setExpandedId] = useState<string | null>(
    initialRows[0]?.id ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newBridgeId, setNewBridgeId] = useState("");
  const [newSalonId, setNewSalonId] = useState("1");
  const [mintMessage, setMintMessage] = useState<string | null>(null);

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
      setMintMessage(`Token per ${data.bridge_id} (copiare ora): ${data.token}`);
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <p className="text-xs text-[#c9b299]">
          Monitor enterprise · heartbeat history · job critici · runbook
        </p>
        <button
          type="button"
          onClick={() => refresh()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs font-bold text-[#f3d8b6] hover:bg-white/5 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Aggiorna
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}
      {mintMessage ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100 break-all">
          {mintMessage}
        </div>
      ) : null}

      <BridgeRunbookPanel warningCodes={allWarningCodes} />

      {canManage ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 flex flex-wrap gap-3 items-end">
          <label className="text-xs text-[#c9b299] flex flex-col gap-1">
            bridge_id
            <input
              value={newBridgeId}
              onChange={(e) => setNewBridgeId(e.target.value)}
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
              placeholder="roma_cassa_1"
            />
          </label>
          <label className="text-xs text-[#c9b299] flex flex-col gap-1">
            salon_id
            <select
              value={newSalonId}
              onChange={(e) => setNewSalonId(e.target.value)}
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
            >
              <option value="1">1 Roma</option>
              <option value="2">2 Corigliano</option>
              <option value="3">3 Castrovillari</option>
              <option value="4">4 Cosenza</option>
            </select>
          </label>
          <button
            type="button"
            onClick={createInstallation}
            className="inline-flex items-center gap-2 rounded-xl bg-[#f3d8b6]/15 border border-[#f3d8b6]/30 px-4 py-2 text-sm font-bold text-[#f3d8b6]"
          >
            <Plus size={16} />
            Registra bridge
          </button>
        </div>
      ) : null}

      <div className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-center text-[#c9b299] py-8">Nessuna installazione bridge.</p>
        ) : (
          rows.map((row) => {
            const bundle = bundles[row.id];
            const open = expandedId === row.id;
            return (
              <div
                key={row.id}
                className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(open ? null : row.id)}
                  className="w-full flex flex-wrap items-center gap-3 p-4 text-left hover:bg-white/[0.02]"
                >
                  <StatusBadge row={row} />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm text-[#f3d8b6]">{row.bridge_id}</div>
                    <div className="text-xs text-[#c9b299]">
                      {row.salon_name ?? `Salone ${row.salon_id}`} · last_seen{" "}
                      {formatRelativeTimeIt(row.last_seen_at)}
                    </div>
                  </div>
                  <div className="text-xs tabular-nums text-[#c9b299]">
                    P:{row.compact_health.queue_pending ?? "—"} Pr:
                    {row.compact_health.queue_processing ?? "—"} F:
                    {row.compact_health.queue_failed ?? "—"}
                  </div>
                  {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>

                {open && bundle ? (
                  <div className="border-t border-white/10 p-4 space-y-4">
                    <MetricsGrid row={row} bundle={bundle} />
                    <LastActivityBlock bundle={bundle} salonId={row.salon_id} />
                    <HeartbeatHistoryList heartbeats={bundle.heartbeats} />
                    <FiscalJobActionCenter
                      bridgeId={row.bridge_id}
                      salonId={row.salon_id}
                      snapshot={bundle.fiscal_snapshot}
                      canAct={canActFiscal}
                    />
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => mintToken(row.id)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-[#f3d8b6] hover:underline"
                      >
                        <KeyRound size={14} />
                        Nuovo token
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {row.warnings.length > 0 ? (
                  <div className="px-4 pb-4 space-y-1">
                    {row.warnings.map((w) => (
                      <div
                        key={w.code}
                        className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                          w.severity === "red"
                            ? "border-red-500/30 bg-red-500/10 text-red-100"
                            : "border-amber-500/30 bg-amber-500/10 text-amber-100"
                        }`}
                      >
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        {w.message}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function StatusBadge({ row }: { row: BridgeDashboardEnrichedRow }) {
  const degraded = row.status === "degraded";
  const cls = row.online
    ? degraded
      ? "bg-amber-500/15 text-amber-200 border-amber-500/30"
      : "bg-emerald-500/15 text-emerald-200 border-emerald-500/30"
    : "bg-red-500/15 text-red-200 border-red-500/30";
  const label = row.online ? (degraded ? "degraded" : "online") : "offline";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase ${cls}`}
    >
      <Radio size={10} />
      {label}
    </span>
  );
}

function MetricsGrid({
  row,
  bundle,
}: {
  row: BridgeDashboardEnrichedRow;
  bundle: BridgeInstallationBundle;
}) {
  const h = row.compact_health;
  const snap = bundle.fiscal_snapshot;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
      <Metric label="Versione" value={h.version ?? "—"} />
      <Metric
        label="FPMate"
        value={h.fpmate_reachable === true ? "OK" : h.fpmate_reachable === false ? "NO" : "?"}
        bad={h.fpmate_reachable === false}
      />
      <Metric
        label="Supabase"
        value={
          h.supabase_reachable === true ? "OK" : h.supabase_reachable === false ? "NO" : "?"
        }
        bad={h.supabase_reachable === false}
      />
      <Metric label="Reconcile" value={String(h.reconcile_required ?? 0)} bad={(h.reconcile_required ?? 0) > 0} />
      <Metric label="Pending" value={String(snap.counts.pending)} />
      <Metric label="Processing" value={String(snap.counts.processing)} />
      <Metric label="Failed" value={String(snap.counts.failed)} bad={snap.counts.failed > 0} />
      <Metric
        label="Z oggi"
        value={snap.z_report_completed_today ? "Sì" : "No"}
        bad={!snap.z_report_completed_today}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  bad,
}: {
  label: string;
  value: string;
  bad?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-2 py-1.5 ${
        bad ? "border-red-500/25 bg-red-500/5" : "border-white/10 bg-black/30"
      }`}
    >
      <div className="text-[10px] text-white/40 uppercase">{label}</div>
      <div className={`font-bold ${bad ? "text-red-200" : "text-[#f3d8b6]"}`}>{value}</div>
    </div>
  );
}

function LastActivityBlock({
  bundle,
  salonId,
}: {
  bundle: BridgeInstallationBundle;
  salonId: number;
}) {
  const s = bundle.fiscal_snapshot;
  const items = [
    { label: "Ultimo sale_receipt", job: s.last_by_kind.sale_receipt },
    { label: "Ultimo void_receipt", job: s.last_by_kind.void_receipt },
    { label: "Ultimo z_report", job: s.last_by_kind.z_report },
  ];
  return (
    <div className="text-xs space-y-2">
      <div className="font-bold text-[#f3d8b6]">Ultimi job / documento</div>
      <ul className="space-y-1 text-[#c9b299]">
        {items.map(({ label, job }) => (
          <li key={label}>
            {label}:{" "}
            {job ? (
              <span>
                #{job.id} {job.status}{" "}
                {job.completed_at
                  ? formatRelativeTimeIt(job.completed_at)
                  : formatRelativeTimeIt(job.created_at)}
              </span>
            ) : (
              "—"
            )}
          </li>
        ))}
        <li>
          Ultimo fiscal_document:{" "}
          {s.last_fiscal_document
            ? `#${s.last_fiscal_document.id} ${s.last_fiscal_document.document_type}`
            : "—"}
        </li>
      </ul>
      <a
        href={`/dashboard/fiscale?salon_id=${salonId}`}
        className="text-[#f3d8b6] hover:underline"
      >
        Apri tutti i job fiscali del salone →
      </a>
    </div>
  );
}

function HeartbeatHistoryList({
  heartbeats,
}: {
  heartbeats: BridgeInstallationBundle["heartbeats"];
}) {
  if (!heartbeats.length) {
    return <p className="text-xs text-[#c9b299]">Nessuno storico heartbeat ancora.</p>;
  }
  return (
    <div>
      <div className="text-xs font-bold text-[#f3d8b6] mb-2">Ultimi {heartbeats.length} heartbeat</div>
      <div className="max-h-48 overflow-y-auto rounded-xl border border-white/10">
        <table className="w-full text-[10px]">
          <thead className="bg-black/40 text-white/45 sticky top-0">
            <tr>
              <th className="px-2 py-1 text-left">Quando</th>
              <th className="px-2 py-1">Stato</th>
              <th className="px-2 py-1">P/Pr/F</th>
            </tr>
          </thead>
          <tbody>
            {heartbeats.map((hb) => {
              const h = hb.health;
              return (
                <tr key={hb.id} className="border-t border-white/5">
                  <td className="px-2 py-1 text-[#c9b299]">
                    {formatRelativeTimeIt(hb.created_at)}
                  </td>
                  <td className="px-2 py-1">{hb.status ?? "—"}</td>
                  <td className="px-2 py-1 tabular-nums">
                    {String(h.queue_pending ?? "—")}/{String(h.queue_processing ?? "—")}/
                    {String(h.queue_failed ?? "—")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
