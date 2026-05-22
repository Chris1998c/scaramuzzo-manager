"use client";

import { useCallback, useState } from "react";
import { AlertTriangle, KeyRound, Plus, Radio, RefreshCw } from "lucide-react";
import type { BridgeDashboardRow } from "@/lib/bridge/buildBridgeDashboardRows";

type Props = {
  initialRows: BridgeDashboardRow[];
  canManage: boolean;
  salonFilter: number | null;
};

export default function BridgeInstallationsPanel({
  initialRows,
  canManage,
  salonFilter,
}: Props) {
  const [rows, setRows] = useState(initialRows);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newBridgeId, setNewBridgeId] = useState("");
  const [newSalonId, setNewSalonId] = useState("1");
  const [mintMessage, setMintMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs =
        salonFilter != null ? `?salon_id=${encodeURIComponent(String(salonFilter))}` : "";
      const res = await fetch(`/api/bridge/installations${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Errore caricamento");
      setRows(data.installations ?? []);
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
      setMintMessage(
        `Token per ${data.bridge_id} (copiare ora): ${data.token}`,
      );
      try {
        await navigator.clipboard.writeText(data.token);
      } catch {
        /* ignore */
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <p className="text-xs text-[#c9b299]">
          Stato da heartbeat bridge · offline se last_seen &gt; 2 min
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

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full text-sm text-left">
          <thead className="text-[10px] uppercase tracking-wider text-white/50 bg-black/30">
            <tr>
              <th className="px-4 py-3">Salone</th>
              <th className="px-4 py-3">bridge_id</th>
              <th className="px-4 py-3">Stato</th>
              <th className="px-4 py-3">last_seen</th>
              <th className="px-4 py-3">Health</th>
              <th className="px-4 py-3">Coda</th>
              {canManage ? <th className="px-4 py-3">Token</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 7 : 6} className="px-4 py-8 text-center text-[#c9b299]">
                  Nessuna installazione bridge registrata.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-[#f3d8b6]">
                    {row.salon_name ?? row.salon_id}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{row.bridge_id}</td>
                  <td className="px-4 py-3">
                    <StatusBadge online={row.online} status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-[#c9b299]">
                    {row.last_seen_at
                      ? new Date(row.last_seen_at).toLocaleString("it-IT")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <HealthCompact h={row.compact_health} warnings={row.warnings} />
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums">
                    P:{row.compact_health.queue_pending ?? "—"} / Pr:
                    {row.compact_health.queue_processing ?? "—"}
                  </td>
                  {canManage ? (
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => mintToken(row.id)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-[#f3d8b6] hover:underline"
                      >
                        <KeyRound size={14} />
                        Nuovo token
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {rows.some((r) => r.warnings.length > 0) ? (
        <div className="space-y-2">
          {rows.flatMap((r) =>
            r.warnings.map((w) => (
              <div
                key={`${r.id}-${w.code}`}
                className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
                  w.severity === "red"
                    ? "border-red-500/30 bg-red-500/10 text-red-100"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-100"
                }`}
              >
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  <strong>{r.bridge_id}</strong>: {w.message}
                </span>
              </div>
            )),
          )}
        </div>
      ) : null}
    </div>
  );
}

function StatusBadge({ online, status }: { online: boolean; status: string }) {
  const cls = online
    ? "bg-emerald-500/15 text-emerald-200 border-emerald-500/30"
    : "bg-red-500/15 text-red-200 border-red-500/30";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase ${cls}`}
    >
      <Radio size={10} />
      {online ? "online" : status || "offline"}
    </span>
  );
}

function HealthCompact({
  h,
  warnings,
}: {
  h: BridgeDashboardRow["compact_health"];
  warnings: BridgeDashboardRow["warnings"];
}) {
  return (
    <div className="text-[10px] space-y-0.5 text-[#c9b299]">
      <div>v:{h.version ?? "—"}</div>
      <div>
        FPMate:{h.fpmate_reachable === true ? "✓" : h.fpmate_reachable === false ? "✗" : "?"}{" "}
        Supa:{h.supabase_reachable === true ? "✓" : h.supabase_reachable === false ? "✗" : "?"}
      </div>
      {h.last_job_status ? <div>job:{h.last_job_status}</div> : null}
      {warnings.length > 0 ? (
        <div className="text-amber-200/90">{warnings.length} warning</div>
      ) : null}
    </div>
  );
}
