"use client";

import { useCallback, useEffect, useState } from "react";
import { Printer, RefreshCw, Server, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import type { FiscalSettingsSnapshot } from "@/lib/fiscalSettingsTypes";

const FISCAL_ORDER = ["pending", "queued", "printed", "error"] as const;

type CassaStatusFiscalResponse = {
  ok?: boolean;
  error?: string;
  salon?: { id: number; name: string | null };
  is_open?: boolean;
  session?: {
    id: number;
    session_date?: string;
    printer_enabled?: boolean;
    opened_at?: string | null;
    status?: string | null;
  } | null;
  fiscal_today?: { by_status: Record<string, number>; total: number };
};

type BridgeHealthResponse = { ok: true } | { ok: false; error?: string };

type Props = {
  initialSalonId: number | null;
  initialSnapshot: FiscalSettingsSnapshot | null;
  canUseSessionPrinter: boolean;
};

export default function FiscaleStampantePanel({
  initialSalonId,
  initialSnapshot,
  canUseSessionPrinter,
}: Props) {
  const { activeSalonId, isReady, allowedSalons } = useActiveSalon();
  const effectiveSalonId = activeSalonId ?? initialSalonId ?? null;

  const [snap, setSnap] = useState<FiscalSettingsSnapshot | null>(initialSnapshot);
  const [loading, setLoading] = useState(false);

  const loadRemote = useCallback(async (salonId: number) => {
    setLoading(true);
    try {
      const [statusRes, bridgeRes] = await Promise.all([
        fetch(
          `/api/cassa/status?salon_id=${encodeURIComponent(String(salonId))}&include_fiscal_counts=1`,
          { cache: "no-store" },
        ),
        fetch("/api/print-bridge/health", { cache: "no-store" }),
      ]);
      const statusJson = (await statusRes.json()) as CassaStatusFiscalResponse;
      const bridgeJson = (await bridgeRes.json()) as BridgeHealthResponse;

      if (!statusRes.ok || !statusJson.ok) {
        setSnap(null);
        toast.error(statusJson.error ?? "Impossibile leggere lo stato cassa");
        return;
      }

      const bridge: FiscalSettingsSnapshot["bridge"] =
        bridgeJson.ok === true
          ? { ok: true }
          : { ok: false, error: String((bridgeJson as { error?: string }).error ?? "Bridge") };

      const sessionRaw = statusJson.session;
      const fiscalToday = statusJson.fiscal_today ?? { by_status: {}, total: 0 };

      setSnap({
        salonId: salonId,
        salonName: statusJson.salon?.name ?? null,
        bridge,
        session: sessionRaw
          ? {
              id: Number(sessionRaw.id),
              session_date: String(sessionRaw.session_date ?? ""),
              printer_enabled: Boolean(sessionRaw.printer_enabled),
              opened_at:
                sessionRaw.opened_at != null ? String(sessionRaw.opened_at) : null,
              status: sessionRaw.status != null ? String(sessionRaw.status) : null,
            }
          : null,
        fiscalToday,
      });
    } catch (e) {
      console.error("FiscaleStampantePanel", e);
      toast.error("Errore di rete");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isReady || effectiveSalonId == null) {
      setSnap(null);
      return;
    }

    if (
      effectiveSalonId === initialSalonId &&
      initialSnapshot?.salonId === effectiveSalonId
    ) {
      setSnap(initialSnapshot);
      return;
    }

    void loadRemote(effectiveSalonId);
  }, [isReady, effectiveSalonId, initialSalonId, initialSnapshot, loadRemote]);

  const salonLabel =
    effectiveSalonId != null
      ? allowedSalons.find((s) => s.id === effectiveSalonId)?.name ?? snap?.salonName
      : null;

  async function handleRefresh() {
    if (effectiveSalonId == null) return;
    await loadRemote(effectiveSalonId);
    toast.success("Aggiornato");
  }

  async function setPrinterEnabledPersist(next: boolean) {
    if (!canUseSessionPrinter || effectiveSalonId == null || !snap?.session) return;
    const prev = snap.session.printer_enabled;
    setSnap((s) =>
      s?.session
        ? {
            ...s,
            session: { ...s.session, printer_enabled: next },
          }
        : s,
    );
    try {
      const res = await fetch("/api/cassa/session-printer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salon_id: effectiveSalonId,
          printer_enabled: next,
        }),
      });
      const data = (await res.json()) as { error?: string; session?: { printer_enabled?: boolean } };
      if (!res.ok) throw new Error(data?.error ?? "Errore salvataggio");
      if (data.session && typeof data.session.printer_enabled === "boolean") {
        const nextPe = data.session.printer_enabled;
        setSnap((s) =>
          s?.session
            ? {
                ...s,
                session: { ...s.session, printer_enabled: nextPe },
              }
            : s,
        );
      }
    } catch (e) {
      setSnap((s) =>
        s?.session
          ? { ...s, session: { ...s.session, printer_enabled: prev } }
          : s,
      );
      toast.error(e instanceof Error ? e.message : "Errore");
    }
  }

  if (!isReady) {
    return (
      <p className="text-sm text-[#c9b299]">Caricamento contesto salone…</p>
    );
  }

  if (effectiveSalonId == null) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[#c9b299]">
          Seleziona un salone dall&apos;intestazione per vedere stato fiscale e stampante.
        </p>
      </div>
    );
  }

  const pe = snap?.session?.printer_enabled;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-sm text-[#c9b299] leading-relaxed">
        <span className="font-bold text-amber-200/95">Comportamento sistema</span>
        <span className="mx-2 text-white/25">·</span>
        Con stampante abilitata per la sessione cassa, la chiusura vendita richiede Print Bridge
        raggiungibile: se il bridge non risponde, la vendita non viene registrata. Con stampante
        disattivata la vendita si registra e{" "}
        <code className="text-[#f3d8b6]/90">sales.fiscal_status</code> resta{" "}
        <code className="text-white/60">pending</code> fino a integrazioni successive. Il
        callback fiscale aggiorna gli stati <code className="text-white/60">queued</code> →{" "}
        <code className="text-white/60">printed</code> / <code className="text-white/60">error</code>.
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#c9b299]/70">
            Contesto
          </p>
          <p className="text-lg font-bold text-[#f3d8b6]">
            {salonLabel ?? `Salone #${effectiveSalonId}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-xs font-bold text-[#f3d8b6] hover:bg-white/5 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Aggiorna
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center gap-2 text-amber-200/90">
            <Server size={18} />
            <span className="text-sm font-bold">Print Bridge</span>
          </div>
          <p className="mt-2 text-xs text-[#c9b299]/90">
            Raggiungibilità dal server (env <code className="text-white/50">PRINT_BRIDGE_HEALTH_URL</code>
            ).
          </p>
          <div className="mt-3">
            {snap == null && loading ? (
              <span className="text-sm text-[#c9b299]">…</span>
            ) : snap?.bridge.ok ? (
              <span className="inline-flex items-center rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
                Raggiungibile
              </span>
            ) : (
              <span className="text-sm text-rose-300/95">
                {snap?.bridge.ok === false ? snap.bridge.error : "—"}
              </span>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center gap-2 text-amber-200/90">
            <Printer size={18} />
            <span className="text-sm font-bold">Sessione cassa</span>
          </div>
          {snap == null && loading ? (
            <p className="mt-2 text-sm text-[#c9b299]">Caricamento…</p>
          ) : snap?.session ? (
            <div className="mt-2 space-y-1 text-sm text-[#e8dcc8]">
              <p>
                <span className="text-[#c9b299]">Stato:</span>{" "}
                <span className="font-semibold text-emerald-300/95">Aperta</span>
              </p>
              <p className="text-xs text-[#c9b299]">
                Sessione {snap.session.session_date}
                {snap.session.opened_at
                  ? ` · aperta ${new Date(snap.session.opened_at).toLocaleString("it-IT", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}`
                  : ""}
              </p>
              {snap.session.status ? (
                <p className="text-xs text-[#c9b299]/80">
                  Record: <code className="text-white/60">{snap.session.status}</code>
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-sm text-[#c9b299]">
              Nessuna cassa aperta per questo salone. Apri turno dalla cassa per collegare{" "}
              <code className="text-white/50">printer_enabled</code> alla sessione.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-[#5c3a21]/40 bg-black/15 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[#f3d8b6]">
            <ShieldCheck size={18} />
            <span className="text-sm font-bold">Stampante fiscale (sessione)</span>
          </div>
          {typeof pe === "boolean" ? (
            <button
              type="button"
              role="switch"
              aria-checked={pe}
              disabled={!canUseSessionPrinter || !snap?.session || loading}
              onClick={() => void setPrinterEnabledPersist(!pe)}
              className={[
                "relative h-8 w-14 rounded-full transition-colors border",
                pe
                  ? "bg-emerald-500/25 border-emerald-500/40"
                  : "bg-white/5 border-white/15",
                !canUseSessionPrinter || !snap?.session ? "opacity-40 cursor-not-allowed" : "",
              ].join(" ")}
            >
              <span
                className={[
                  "absolute top-1 h-6 w-6 rounded-full bg-[#f3d8b6] shadow transition-transform",
                  pe ? "left-7" : "left-1",
                ].join(" ")}
              />
            </button>
          ) : (
            <span className="text-xs text-[#c9b299]">—</span>
          )}
        </div>
        <p className="mt-2 text-xs text-[#c9b299]/85 leading-relaxed">
          Allineato a <code className="text-white/50">cash_sessions.printer_enabled</code>: se
          attivo, in cassa compare &quot;Registra e stampa&quot; e serve bridge OK; se disattivo,
          &quot;Registra&quot; e <code className="text-white/50">fiscal_status = pending</code>.
        </p>
        {!canUseSessionPrinter ? (
          <p className="mt-2 text-xs text-amber-200/70">
            Il tuo ruolo non consente di modificare questa preferenza (solo staff cassa abilitato).
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-[#5c3a21]/40 overflow-hidden">
        <div className="bg-black/30 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#c9b299]/80">
          Vendite oggi per stato fiscale · {snap?.fiscalToday.total ?? 0} righe
        </div>
        <div className="p-4">
          {snap == null && loading ? (
            <p className="text-sm text-[#c9b299]">Caricamento…</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {FISCAL_ORDER.map((key) => {
                const n = snap?.fiscalToday.by_status[key] ?? 0;
                return (
                  <div
                    key={key}
                    className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-center min-w-[100px]"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#c9b299]/70">
                      {key}
                    </p>
                    <p className="text-lg font-black tabular-nums text-[#f3d8b6]">{n}</p>
                  </div>
                );
              })}
              {Object.keys(snap?.fiscalToday.by_status ?? {}).filter(
                (k) => !FISCAL_ORDER.includes(k as (typeof FISCAL_ORDER)[number]),
              ).length > 0 ? (
                <div className="w-full mt-2 text-xs text-[#c9b299]/80">
                  Altri stati:{" "}
                  {Object.entries(snap?.fiscalToday.by_status ?? {})
                    .filter(([k]) => !FISCAL_ORDER.includes(k as (typeof FISCAL_ORDER)[number]))
                    .map(([k, v]) => `${k} (${v})`)
                    .join(", ")}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
