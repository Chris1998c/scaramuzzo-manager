// app/dashboard/in-sala/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { toast } from "sonner";
import WalkInModal from "@/components/in-sala/WalkInModal";
import { useVisibilityPolling } from "@/lib/useVisibilityPolling";
import { LogOut } from "lucide-react";
import { ConfirmActionDialog } from "@/components/ui/ConfirmActionDialog";
import { formatRomeTimeHHmm } from "@/lib/datetime/formatRomeInstant";

type CashStatus = {
  ok: boolean;
  role?: "reception" | "coordinator" | "magazzino" | string;
  salon?: { id: number; name: string | null };
  is_open?: boolean;
  session?: {
    id: number;
    salon_id: number;
    session_date: string | null;
    opening_cash: number | null;
    closing_cash: number | null;
    status: string | null;
    opened_by: string | null;
    opened_at: string | null;
    closed_by: string | null;
    closed_at: string | null;
    notes: string | null;
  } | null;
  totals?: null | {
    day: string;
    today_gross: number;
    today_cash: number;
    today_card: number;
    today_count_sales: number;
    session_gross: number;
    session_cash: number;
    session_card: number;
    session_count_sales: number;
  };
  error?: string;
};

export default function InSalaPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const prevPathnameRef = useRef<string | null>(null);
  const { activeSalonId, isReady } = useActiveSalon();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string>("");

  // CASSA
  const [cashLoading, setCashLoading] = useState(false);
  const [cashErr, setCashErr] = useState<string>("");
  const [cash, setCash] = useState<CashStatus | null>(null);

  const [openCash, setOpenCash] = useState(false);
  const [openCashValue, setOpenCashValue] = useState<number>(0);

  const [closeCash, setCloseCash] = useState(false);
  const [closeCashValue, setCloseCashValue] = useState<number>(0);
  const [closeCashNotes, setCloseCashNotes] = useState<string>("");
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [togliDaSalaTargetId, setTogliDaSalaTargetId] = useState<number | null>(null);

  function fmtEur(n: unknown) {
    const x = typeof n === "number" ? n : Number(n);
    const v = Number.isFinite(x) ? x : 0;
    return v.toFixed(2);
  }

  /** Orari agenda: wall clock già in Europe/Rome nel DB (no shift UTC). */
  function timeHHmm(iso: unknown) {
    const s = String(iso || "");
    return s.length >= 16 ? s.slice(11, 16) : "—";
  }

  async function loadAppointments(options?: { silent?: boolean }) {
    if (!activeSalonId) return;

    const silent = options?.silent === true;
    if (!silent) {
      setLoading(true);
      setErr("");
    }

    const { data, error } = await supabase
      .from("appointments")
      .select(
        "id, customer_id, start_time, end_time, status, source, notes, sale_id, customers(id, first_name, last_name), staff(id, name)",
      )
      .eq("salon_id", Number(activeSalonId))
      .eq("status", "in_sala")
      .order("start_time", { ascending: true });

    if (!silent) setLoading(false);

    if (error) {
      if (!silent) setErr(error.message);
      else console.warn("[in-sala] refresh appuntamenti:", error.message);
      return;
    }
    setRows(data || []);
  }

  async function loadCashStatus(options?: { silent?: boolean }) {
    const silent = options?.silent === true;
    if (!silent) {
      setCashLoading(true);
      setCashErr("");
    }

    try {
      // Reception ignora salon_id; coordinator/magazzino lo usano
      const qs = activeSalonId
        ? `?salon_id=${encodeURIComponent(String(activeSalonId))}`
        : "";
      const res = await fetch(`/api/cassa/status${qs}`, {
        method: "GET",
        cache: "no-store",
      });
      const data = (await res.json()) as CashStatus;

      if (!res.ok)
        throw new Error((data as any)?.error || "Errore status cassa");
      setCash(data);

      // UX: suggerimento closing = opening + incassi cash (solo se utente non ha già scritto)
      const opening = Number(data?.session?.opening_cash) || 0;
      const cashIncassi = Number(data?.totals?.session_cash) || 0;
      const suggested = Math.max(0, opening + cashIncassi);

      if (suggested > 0) {
        setCloseCashValue((prev) =>
          prev === 0 ? Number(suggested.toFixed(2)) : prev,
        );
      }
    } catch (e: any) {
      if (!silent) {
        setCash(null);
        setCashErr(e?.message || "Errore");
      } else {
        console.warn("[in-sala] refresh cassa:", e?.message || e);
      }
    } finally {
      if (!silent) setCashLoading(false);
    }
  }

  async function doOpenCash() {
    if (!activeSalonId) return;
    setCashLoading(true);
    setCashErr("");

    try {
      const res = await fetch("/api/cassa/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salon_id: Number(activeSalonId),
          opening_cash: Number(openCashValue) || 0,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Errore apertura cassa");

      setOpenCash(false);
      await loadCashStatus();
    } catch (e: any) {
      setCashErr(e?.message || "Errore");
    } finally {
      setCashLoading(false);
    }
  }

  function notifyCloseSessionResult(data: {
    already_closed?: boolean;
    fiscal_warning?: string | null;
    fiscal_job?: { id?: unknown } | null;
  }) {
    if (data?.already_closed) {
      toast.message("Sessione già chiusa in precedenza.");
      return;
    }

    const fw =
      typeof data.fiscal_warning === "string" && data.fiscal_warning.trim()
        ? data.fiscal_warning.trim()
        : null;

    const rawId = data?.fiscal_job != null ? (data.fiscal_job as { id?: unknown }).id : undefined;
    const jobId =
      typeof rawId === "number" && Number.isFinite(rawId)
        ? rawId
        : typeof rawId === "string" && Number.isFinite(Number(rawId))
          ? Number(rawId)
          : null;

    if (fw) {
      toast.warning(
        `Sessione cassa chiusa sul gestionale. Nota fiscale / stampa Z: ${fw}${
          jobId != null ? ` · Job accodato (ID ${jobId}).` : ""
        }`,
        { duration: 10_000 },
      );
      return;
    }

    let msg = "Sessione cassa chiusa.";
    if (jobId != null) {
      msg += ` Chiusura giornata (Z) accodata per la stampante fiscale — job ${jobId}. Verificare Print Bridge e Epson FP81 RT.`;
    }
    toast.success(msg, { duration: jobId != null ? 9_000 : 5_000 });
  }

  async function doCloseCash() {
    if (!activeSalonId) return;
    setCashLoading(true);
    setCashErr("");

    try {
      const res = await fetch("/api/cassa/close-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salon_id: Number(activeSalonId),
          closing_cash: Number(closeCashValue) || 0,
          notes: closeCashNotes || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Errore chiusura cassa");

      notifyCloseSessionResult(data);

      setCloseCash(false);
      setCloseCashNotes("");
      setCloseCashValue(0);
      await loadCashStatus();
    } catch (e: any) {
      setCashErr(e?.message || "Errore");
    } finally {
      setCashLoading(false);
    }
  }

  async function refreshAll(options?: { silent?: boolean }) {
    await Promise.all([loadAppointments(options), loadCashStatus(options)]);
  }

  function requestTogliDaSala(appointmentId: number) {
    const row = rows.find((r) => Number(r?.id) === appointmentId);
    const saleId = Number(row?.sale_id);
    if (Number.isFinite(saleId) && saleId > 0) {
      toast.error("Appuntamento già chiuso/venduto: non è possibile togliere dalla sala.");
      return;
    }
    if (String(row?.status || "") !== "in_sala") {
      toast.error("L'appuntamento non è in sala.");
      return;
    }
    setTogliDaSalaTargetId(appointmentId);
  }

  async function confirmTogliDaSala() {
    const appointmentId = togliDaSalaTargetId;
    if (appointmentId == null) return;

    setRemovingId(appointmentId);
    try {
      const res = await fetch("/api/agenda/togli-da-sala", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointment_id: appointmentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Operazione non riuscita");
      toast.success("Cliente rimosso dalla sala.");
      setTogliDaSalaTargetId(null);
      await loadAppointments({ silent: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Errore";
      toast.error(msg);
    } finally {
      setRemovingId(null);
    }
  }

  function handleWalkInCreated(appointmentId: number) {
    void loadAppointments({ silent: true });
    toast.success("Walk-in creato e in sala.", {
      action: {
        label: "Apri cassa",
        onClick: () => router.push(`/dashboard/cassa/${appointmentId}`),
      },
    });
  }

  useEffect(() => {
    if (!isReady) return;
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, activeSalonId]);

  useVisibilityPolling({
    enabled: isReady && activeSalonId != null,
    canPoll: () => !walkInOpen && !openCash && !closeCash,
    onPoll: () => {
      void refreshAll({ silent: true });
    },
  });

  // Refetch when returning to this page (e.g. after closing sale in Cassa) so list is not stale
  useEffect(() => {
    const prev = prevPathnameRef.current;
    prevPathnameRef.current = pathname;
    if (pathname === "/dashboard/in-sala" && prev != null && prev !== "/dashboard/in-sala") {
      void refreshAll({ silent: true });
    }
  }, [pathname]);

  if (!isReady) return null;

  const isCassaOpen = Boolean(cash?.is_open);
  const salonName = cash?.salon?.name ?? null;

  const listCountLabel = loading
    ? "Caricamento…"
    : rows.length === 0
      ? "Nessuno in questo momento"
      : `${rows.length} ${rows.length === 1 ? "appuntamento" : "appuntamenti"}`;

  return (
    <div className="px-3 py-4 pb-24 sm:pb-4 md:px-5 md:py-5 text-white max-w-6xl mx-auto space-y-3">
      {/* Titolo pagina + azioni (un solo walk-in, sticky su mobile) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold text-[#f3d8b6] tracking-tight">
            In sala
          </h1>
          {salonName ? (
            <p className="text-sm text-white/50 truncate">{salonName}</p>
          ) : null}
        </div>
        <div className="hidden sm:flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setWalkInOpen(true)}
            className="h-10 px-4 rounded-lg bg-emerald-500/90 text-black text-sm font-semibold hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          >
            Nuovo walk-in
          </button>
          <button
            type="button"
            onClick={() => void refreshAll({ silent: true })}
            className="h-10 px-4 rounded-lg border border-white/10 text-[#f3d8b6] text-sm font-semibold hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d8b6]/50"
          >
            Aggiorna
          </button>
        </div>
        {/* Mobile: Aggiorna in header; walk-in fisso in basso */}
        <button
          type="button"
          onClick={() => void refreshAll({ silent: true })}
          className="sm:hidden h-10 px-4 rounded-lg border border-white/10 text-[#f3d8b6] text-sm font-semibold hover:bg-white/[0.06] self-start"
        >
          Aggiorna
        </button>
      </div>

      {/* Un solo Nuovo walk-in, sempre raggiungibile su telefono */}
      <div className="sm:hidden fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.08] bg-[#1A0F0A]/95 backdrop-blur-sm px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => setWalkInOpen(true)}
          className="w-full h-11 rounded-lg bg-emerald-500/90 text-black text-sm font-semibold hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
        >
          Nuovo walk-in
        </button>
      </div>

      {/* Stato cassa compatto */}
      <div className="rounded-xl border border-white/[0.08] bg-scz-dark px-3 py-3 md:px-4 space-y-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-sm font-medium text-white/55">Stato cassa</span>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
              cashLoading
                ? "bg-white/10 text-white/50"
                : isCassaOpen
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-red-500/20 text-red-300"
            }`}
          >
            {cashLoading ? "Sincronizzazione…" : isCassaOpen ? "Aperta" : "Chiusa"}
          </span>
          {cashErr ? (
            <span className="text-sm text-red-400/90">{cashErr}</span>
          ) : (
            <span className="text-sm text-white/45 min-w-0 truncate">
              {cash?.session?.opened_at
                ? `Aperta alle ${formatRomeTimeHHmm(cash.session.opened_at)}`
                : isCassaOpen
                  ? "Operativa"
                  : "Apri per abilitare le vendite"}
              {cash?.session?.session_date ? ` · ${cash.session.session_date}` : ""}
            </span>
          )}
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <button
              type="button"
              onClick={() => void loadCashStatus({ silent: true })}
              className="h-9 px-3 rounded-lg border border-white/10 text-sm text-white/75 hover:bg-white/[0.06] disabled:opacity-50"
              disabled={cashLoading}
            >
              Aggiorna stato
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  const qs = activeSalonId
                    ? `?salon_id=${encodeURIComponent(String(activeSalonId))}`
                    : "";
                  const res = await fetch(`/api/cassa/report${qs}`, {
                    method: "GET",
                    cache: "no-store",
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data?.error || "Errore report");
                  const t = data?.totals || {};
                  toast.success(
                    `Report oggi — Lordo € ${(Number(t.gross) || 0).toFixed(2)} · Contanti € ${(Number(t.cash) || 0).toFixed(2)} · POS € ${(Number(t.card) || 0).toFixed(2)} · Vendite ${Number(t.count_sales) || 0}`,
                  );
                } catch (e: any) {
                  toast.error("Errore report: " + (e?.message || "Errore"));
                }
              }}
              className="h-9 px-3 rounded-lg border border-white/10 text-sm text-white/75 hover:bg-white/[0.06] disabled:opacity-50"
              disabled={cashLoading}
            >
              Report oggi
            </button>
            {!isCassaOpen ? (
              <button
                type="button"
                onClick={() => setOpenCash(true)}
                className="h-9 px-3 rounded-lg bg-emerald-500 text-black text-sm font-semibold hover:opacity-95 disabled:opacity-50"
                disabled={cashLoading}
              >
                Apri cassa
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCloseCash(true)}
                className="h-9 px-3 rounded-lg bg-red-500/90 text-white text-sm font-semibold hover:opacity-95 disabled:opacity-50"
                disabled={cashLoading}
              >
                Chiudi cassa
              </button>
            )}
          </div>
        </div>

        {isCassaOpen && cash?.totals ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1 border-t border-white/[0.06]">
            <div className="px-1 py-1">
              <div className="text-[11px] text-white/40">Lordo</div>
              <div className="text-base font-semibold tabular-nums text-[#f3d8b6]">
                € {fmtEur(cash.totals.session_gross)}
              </div>
            </div>
            <div className="px-1 py-1">
              <div className="text-[11px] text-white/40">Contanti</div>
              <div className="text-base font-semibold tabular-nums text-white/90">
                € {fmtEur(cash.totals.session_cash)}
              </div>
            </div>
            <div className="px-1 py-1">
              <div className="text-[11px] text-white/40">POS</div>
              <div className="text-base font-semibold tabular-nums text-white/90">
                € {fmtEur(cash.totals.session_card)}
              </div>
            </div>
            <div className="px-1 py-1">
              <div className="text-[11px] text-white/40">Vendite</div>
              <div className="text-base font-semibold tabular-nums text-white/90">
                {cash.totals.session_count_sales}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {err ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-200 font-medium">
          {err}
        </div>
      ) : null}

      {/* Elenco appuntamenti — etichetta distinta dal titolo pagina */}
      <section className="rounded-xl border border-white/[0.08] bg-scz-dark overflow-hidden">
        <div className="px-3 py-2.5 md:px-4 border-b border-white/[0.06] flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-white/85">Appuntamenti in corso</h2>
          <p className="text-xs text-white/45 tabular-nums">{listCountLabel}</p>
        </div>

        <div className="p-3 md:p-4">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-8">
              <div className="w-6 h-6 border-2 border-[#f3d8b6]/30 border-t-[#f3d8b6] rounded-full animate-spin" />
              <p className="text-sm text-white/50">Caricamento…</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-6 text-center space-y-1">
              <p className="text-sm text-white/70">Nessun appuntamento in sala</p>
              <p className="text-xs text-white/45">
                Usa «Nuovo walk-in» oppure porta un cliente dalla pagina Agenda.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
 {rows.map((a) => {
 const customer = a?.customers
 ? `${a.customers.first_name ?? ""} ${a.customers.last_name ?? ""}`.trim()
 : "Cliente";
 const staff = a?.staff?.name ? String(a.staff.name) : "—";
                const start = timeHHmm(a.start_time);
                const end = timeHHmm(a.end_time);

                return (
                  <div
                    key={a.id}
                    className="rounded-xl border border-white/10 bg-black/20 p-5 md:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:border-white/15 transition-colors"
                  >
                    <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <div className="text-xs font-medium text-white/40 mb-0.5">
                          Cliente
                        </div>
                        <div className="text-lg font-bold text-[#f3d8b6] truncate">
                          {customer}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-white/40 mb-0.5">
                          Operatore
                        </div>
                        <div className="text-sm font-semibold text-white/90">
                          {staff}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-white/40 mb-0.5">
                          Orario
                        </div>
                        <div className="text-sm font-mono text-white/80">
                          {start} – {end}
                        </div>
                      </div>
                      <div className="flex items-end gap-2 flex-wrap">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
 In sala
 </span>
 {a?.source === "walk_in" && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-sky-500/20 text-sky-300 border border-sky-500/30">
                            Walk-In
                          </span>
                        )}
                        {a?.notes && (
                          <span className="text-white/40 text-xs truncate max-w-[120px]" title={a.notes}>
                            {a.notes}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 shrink-0">
 <button
 type="button"
 onClick={() => requestTogliDaSala(Number(a.id))}
 disabled={
 removingId === Number(a.id) ||
 (Number.isFinite(Number(a?.sale_id)) && Number(a.sale_id) > 0)
 }
 title={
 Number.isFinite(Number(a?.sale_id)) && Number(a.sale_id) > 0
 ? "Appuntamento già chiuso/venduto"
 : "Riporta l'appuntamento a prenotato"
                        }
                        className="h-11 px-4 rounded-xl border border-amber-500/35 bg-amber-500/10 text-amber-100 text-sm font-semibold hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
 >
 <LogOut size={14} aria-hidden />
 {removingId === Number(a.id) ? "Rimozione..." : "Togli dalla sala"}
 </button>
 <button
 type="button"
                        onClick={() => router.push(`/dashboard/cassa/${a.id}`)}
                        className="h-11 px-5 rounded-xl bg-[#f3d8b6] text-black text-sm font-semibold hover:opacity-95 active:scale-[0.98] transition-all border border-[#f3d8b6]"
 >
 Vai in cassa
 </button>
 <button
 type="button"
 onClick={() => {
 const cid = a?.customer_id ?? a?.customers?.id;
 if (cid == null || cid === "") {
 toast.error(
 "Nessun cliente collegato. Assegna un cliente dall’agenda, poi riprova.",
                            );
                            return;
                          }
                          router.push(`/dashboard/clienti/${cid}`);
                        }}
                        className="h-11 px-5 rounded-xl border border-white/10 bg-black/30 text-white/70 text-sm font-semibold hover:bg-white/10 transition-colors"
                      >
                        Scheda cliente
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* MODAL: APRI CASSA */}
      {openCash && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#120a06] p-5">
            <div className="text-[#f3d8b6] font-semibold text-lg">Apri cassa</div>
            <div className="text-white/50 text-sm mt-1">
              Inserisci il fondo cassa iniziale (opzionale).
            </div>

            <div className="mt-4 space-y-2">
              <label className="text-[10px] text-white/30 uppercase font-black tracking-widest">
 Fondo cassa (€)
 </label>
 <input
 type="number"
 min={0}
 step="0.5"
                value={openCashValue}
                onChange={(e) =>
                  setOpenCashValue(Math.max(0, Number(e.target.value) || 0))
                }
                className="w-full rounded-2xl bg-black/40 border border-white/10 p-4 text-white font-bold outline-none focus:border-[#f3d8b6]/40"
              />
            </div>

            <div className="mt-6 flex gap-2 justify-end">
              <button
                onClick={() => setOpenCash(false)}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
                disabled={cashLoading}
              >
                Annulla
              </button>
              <button
                onClick={doOpenCash}
                className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-extrabold text-black hover:opacity-90"
 disabled={cashLoading}
 >
 {cashLoading ? "Apertura..." : "Conferma"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CHIUDI CASSA */}
      {closeCash && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#120a06] p-6">
            <div className="text-[#f3d8b6] font-black text-lg">
              Chiudi Cassa
            </div>
            <div className="text-white/50 text-sm mt-1">
              Inserisci il contante in cassetto e (se vuoi) una nota.
            </div>

            <div className="mt-4 space-y-2">
              <label className="text-[10px] text-white/30 uppercase font-black tracking-widest">
 Contante in cassetto (€)
 </label>
 <input
 type="number"
 min={0}
 step="0.5"
                value={closeCashValue}
                onChange={(e) =>
                  setCloseCashValue(Math.max(0, Number(e.target.value) || 0))
                }
                className="w-full rounded-2xl bg-black/40 border border-white/10 p-4 text-white font-bold outline-none focus:border-[#f3d8b6]/40"
              />
            </div>

            <div className="mt-3 space-y-2">
              <label className="text-[10px] text-white/30 uppercase font-black tracking-widest">
                Note (opzionale)
              </label>
              <textarea
                value={closeCashNotes}
                onChange={(e) => setCloseCashNotes(e.target.value)}
                rows={3}
                className="w-full rounded-2xl bg-black/40 border border-white/10 p-4 text-white/90 text-sm outline-none focus:border-[#f3d8b6]/40"
 placeholder="es. Chiusura fine turno, differenza contanti, ecc."
              />
            </div>

            <div className="mt-6 flex gap-2 justify-end">
              <button
                onClick={() => setCloseCash(false)}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
                disabled={cashLoading}
              >
                Annulla
              </button>
              <button
                onClick={doCloseCash}
                className="rounded-xl bg-red-400 px-4 py-2 text-sm font-extrabold text-black hover:opacity-90"
 disabled={cashLoading}
 >
 {cashLoading ? "Chiusura..." : "Conferma"}
 </button>
 </div>
 </div>
 </div>
 )}

 <WalkInModal
 isOpen={walkInOpen}
 close={() => setWalkInOpen(false)}
 onCreated={handleWalkInCreated}
 />

 <ConfirmActionDialog
 open={togliDaSalaTargetId != null}
 onOpenChange={(open) => {
 if (!open && removingId == null) setTogliDaSalaTargetId(null);
 }}
 title="Togli dalla sala"
 description={
 "Il cliente uscirà dalla lista «In sala» e l'appuntamento tornerà a «prenotato».\n\nNessuna vendita verrà modificata."
 }
 confirmLabel="Togli dalla sala"
 variant="warning"
        loading={removingId != null}
        onConfirm={confirmTogliDaSala}
      />
    </div>
  );
}
