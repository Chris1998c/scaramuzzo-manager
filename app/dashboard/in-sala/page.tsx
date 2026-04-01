// app/dashboard/in-sala/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { toast } from "sonner";
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

  function fmtEur(n: unknown) {
    const x = typeof n === "number" ? n : Number(n);
    const v = Number.isFinite(x) ? x : 0;
    return v.toFixed(2);
  }

  function timeHHmm(iso: unknown) {
    const s = String(iso || "");
    return s.length >= 16 ? s.slice(11, 16) : "—";
  }

  async function loadAppointments() {
    if (!activeSalonId) return;

    setLoading(true);
    setErr("");

    const { data, error } = await supabase
      .from("appointments")
      .select(
        "id, customer_id, start_time, end_time, status, notes, customers(id, first_name, last_name), staff(id, name)",
      )
      .eq("salon_id", Number(activeSalonId))
      .eq("status", "in_sala")
      .order("start_time", { ascending: true });

    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }
    setRows(data || []);
  }

  async function loadCashStatus() {
    setCashLoading(true);
    setCashErr("");

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
      setCash(null);
      setCashErr(e?.message || "Errore");
    } finally {
      setCashLoading(false);
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

  async function refreshAll() {
    await Promise.all([loadAppointments(), loadCashStatus()]);
  }

  useEffect(() => {
    if (!isReady) return;
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, activeSalonId]);

  // Refetch when returning to this page (e.g. after closing sale in Cassa) so list is not stale
  useEffect(() => {
    const prev = prevPathnameRef.current;
    prevPathnameRef.current = pathname;
    if (pathname === "/dashboard/in-sala" && prev != null && prev !== "/dashboard/in-sala") {
      void refreshAll();
    }
  }, [pathname]);

  if (!isReady) return null;

  const isCassaOpen = Boolean(cash?.is_open);
  const salonName = cash?.salon?.name ?? null;

  return (
    <div className="p-6 md:p-8 text-white max-w-6xl mx-auto space-y-7">
      {/* HERO / HEADER */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-scz-dark shadow-[0_4px_24px_-4px_rgba(0,0,0,0.4)]">
        <div className="border-b border-white/10 bg-black/20 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-[#f3d8b6] tracking-tight">
                In sala
              </h1>
              <p className="mt-1 text-sm text-white/50">
                Control room · appuntamenti in sala
                {salonName ? ` · ${salonName}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => router.push("/dashboard/agenda")}
                className="h-11 px-5 rounded-xl border border-white/10 bg-black/20 text-white/80 font-bold text-[10px] uppercase tracking-wider hover:bg-white/10 transition-colors"
              >
                ← Agenda
              </button>
              <button
                type="button"
                onClick={refreshAll}
                className="h-11 px-5 rounded-xl bg-[#f3d8b6] text-black font-black text-[10px] uppercase tracking-wider hover:opacity-95 transition-colors"
              >
                Aggiorna
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* STATO CASSA + METRICHE LIVE */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-scz-dark shadow-[0_4px_24px_-4px_rgba(0,0,0,0.4)]">
        <div className="border-b border-white/10 bg-black/20 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
            Stato cassa
          </div>
          <span
            className={`inline-flex items-center px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
              cashLoading
                ? "bg-white/10 text-white/50"
                : isCassaOpen
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-red-500/20 text-red-300 border border-red-500/30"
            }`}
          >
            {cashLoading ? "Sync..." : isCassaOpen ? "Aperta" : "Chiusa"}
          </span>
        </div>
        <div className="p-6 md:p-7 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="min-w-0">
              {cashErr ? (
                <p className="text-sm font-medium text-red-400/90">{cashErr}</p>
              ) : (
                <p className="text-sm text-white/60">
                  {cash?.session?.opened_at
                    ? `Aperta alle ${timeHHmm(cash.session.opened_at)}`
                    : isCassaOpen
                      ? "Cassa operativa."
                      : "Apri la cassa per abilitare le vendite."}
                  {cash?.session?.session_date ? ` · Giorno ${cash.session.session_date}` : ""}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={loadCashStatus}
                className="h-11 px-5 rounded-xl border border-white/10 bg-black/30 text-white/70 font-bold text-[10px] uppercase tracking-wider hover:bg-white/10 disabled:opacity-50"
                disabled={cashLoading}
              >
                Stato cassa
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const qs = activeSalonId ? `?salon_id=${encodeURIComponent(String(activeSalonId))}` : "";
                    const res = await fetch(`/api/cassa/report${qs}`, { method: "GET", cache: "no-store" });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data?.error || "Errore report");
                    const t = data?.totals || {};
                    toast.success(
                      `Report oggi — Lordo € ${(Number(t.gross) || 0).toFixed(2)} · Contanti € ${(Number(t.cash) || 0).toFixed(2)} · POS € ${(Number(t.card) || 0).toFixed(2)} · Vendite ${Number(t.count_sales) || 0}`
                    );
                  } catch (e: any) {
                    toast.error("Errore report: " + (e?.message || "Errore"));
                  }
                }}
                className="h-11 px-5 rounded-xl border border-white/10 bg-black/30 text-white/70 font-bold text-[10px] uppercase tracking-wider hover:bg-white/10 disabled:opacity-50"
                disabled={cashLoading}
              >
                Report oggi
              </button>
              {!isCassaOpen ? (
                <button
                  type="button"
                  onClick={() => setOpenCash(true)}
                  className="h-11 px-5 rounded-xl bg-emerald-500 text-black font-black text-[10px] uppercase tracking-wider hover:opacity-95 disabled:opacity-50"
                  disabled={cashLoading}
                >
                  Apri cassa
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setCloseCash(true)}
                  className="h-11 px-5 rounded-xl bg-red-500/90 text-white font-black text-[10px] uppercase tracking-wider hover:opacity-95 disabled:opacity-50"
                  disabled={cashLoading}
                >
                  Chiudi cassa
                </button>
              )}
            </div>
          </div>

          {isCassaOpen && cash?.totals && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-[10px] font-black uppercase tracking-wider text-white/40">Sessione lordo</div>
                <div className="mt-1 text-xl font-extrabold text-[#f3d8b6]">€ {fmtEur(cash.totals.session_gross)}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-[10px] font-black uppercase tracking-wider text-white/40">Contanti</div>
                <div className="mt-1 text-xl font-extrabold text-white/90">€ {fmtEur(cash.totals.session_cash)}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-[10px] font-black uppercase tracking-wider text-white/40">POS</div>
                <div className="mt-1 text-xl font-extrabold text-white/90">€ {fmtEur(cash.totals.session_card)}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-[10px] font-black uppercase tracking-wider text-white/40">Vendite</div>
                <div className="mt-1 text-xl font-extrabold text-white/90">{cash.totals.session_count_sales}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {err && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-200 font-medium">
          {err}
        </div>
      )}

      {/* LIVE SERVICE BOARD — Lista appuntamenti in sala */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-scz-dark shadow-[0_4px_24px_-4px_rgba(0,0,0,0.4)]">
        <div className="border-b border-white/10 bg-black/20 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
              In sala
            </div>
            <div className="mt-1 text-sm text-white/50">
              {loading
                ? "Caricamento..."
                : rows.length === 0
                  ? "Nessun appuntamento in sala"
                  : `${rows.length} ${rows.length === 1 ? "appuntamento" : "appuntamenti"} in sala`}
            </div>
          </div>
          {!loading && rows.length > 0 && (
            <span className="rounded-full bg-[#f3d8b6]/10 border border-[#f3d8b6]/20 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-[#f3d8b6]">
              Live
            </span>
          )}
        </div>

        <div className="p-6 md:p-7">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 md:py-20">
              <div className="w-10 h-10 border-2 border-[#f3d8b6]/30 border-t-[#f3d8b6] rounded-full animate-spin" />
              <p className="mt-4 text-sm text-white/50 font-medium">Caricamento appuntamenti...</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 md:py-24 text-center">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-3xl text-white/20 mb-4">
                👤
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
                Nessun appuntamento in sala
              </p>
              <p className="mt-2 text-sm text-white/50 max-w-[280px]">
                Porta i clienti in sala dall’Agenda per vederli qui e aprire la cassa.
              </p>
              <button
                type="button"
                onClick={() => router.push("/dashboard/agenda")}
                className="mt-6 h-11 px-5 rounded-xl font-black uppercase tracking-[0.15em] text-[10px] bg-[#f3d8b6]/10 border border-[#f3d8b6]/30 text-[#f3d8b6] hover:bg-[#f3d8b6]/20 transition-colors"
              >
                Vai all’Agenda
              </button>
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
                        <div className="text-[10px] font-black uppercase tracking-wider text-white/40 mb-0.5">
                          Cliente
                        </div>
                        <div className="text-lg font-bold text-[#f3d8b6] truncate">
                          {customer}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-wider text-white/40 mb-0.5">
                          Operatore
                        </div>
                        <div className="text-sm font-semibold text-white/90">
                          {staff}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-wider text-white/40 mb-0.5">
                          Orario
                        </div>
                        <div className="text-sm font-mono text-white/80">
                          {start} – {end}
                        </div>
                      </div>
                      <div className="flex items-end gap-2">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          In sala
                        </span>
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
                        onClick={() => router.push(`/dashboard/cassa/${a.id}`)}
                        className="h-11 px-5 rounded-xl bg-[#f3d8b6] text-black font-black uppercase tracking-[0.15em] text-[10px] hover:opacity-95 active:scale-[0.98] transition-all border border-[#f3d8b6]"
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
                        className="h-11 px-5 rounded-xl border border-white/10 bg-black/30 text-white/70 font-bold uppercase tracking-[0.1em] text-[10px] hover:bg-white/10 transition-colors"
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
      </div>

      {/* MODAL: APRI CASSA */}
      {openCash && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#120a06] p-6">
            <div className="text-[#f3d8b6] font-black text-lg">Apri Cassa</div>
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
    </div>
  );
}
