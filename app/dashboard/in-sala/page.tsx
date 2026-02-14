// app/dashboard/in-sala/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
        "id, start_time, end_time, status, notes, customers(id, first_name, last_name), staff(id, name)",
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

  if (!isReady) return null;

  const isCassaOpen = Boolean(cash?.is_open);
  const salonName = cash?.salon?.name ?? null;

  return (
    <div className="p-6 text-white">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-[#f3d8b6]">IN SALA</h1>
            <p className="text-white/50 text-sm">
              Appuntamenti attualmente in sala
              {salonName ? ` — ${salonName}` : ""}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => router.push("/dashboard/agenda")}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
            >
              ← Agenda
            </button>
            <button
              onClick={refreshAll}
              className="rounded-xl bg-[#f3d8b6] px-4 py-2 text-sm font-bold text-black hover:opacity-90"
            >
              Aggiorna
            </button>
          </div>
        </div>

        {/* CASSA BAR */}
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div
                className={`text-[10px] uppercase font-black tracking-[0.2em] px-3 py-1 rounded-full border ${
                  isCassaOpen
                    ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                    : "bg-red-500/10 text-red-300 border-red-500/20"
                }`}
              >
                {isCassaOpen ? "Cassa aperta" : "Cassa chiusa"}
              </div>

              {cashLoading ? (
                <div className="text-white/50 text-xs">Sync...</div>
              ) : cashErr ? (
                <div className="text-red-200/80 text-xs truncate">
                  {cashErr}
                </div>
              ) : (
                <div className="text-white/50 text-xs truncate">
                  {cash?.session?.opened_at
                    ? `Aperta: ${timeHHmm(cash.session.opened_at)}`
                    : ""}
                  {cash?.session?.session_date
                    ? ` · Giorno: ${cash.session.session_date}`
                    : ""}
                </div>
              )}
            </div>

            {isCassaOpen && cash?.totals ? (
              <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="rounded-xl border border-white/10 bg-black/30 p-2">
                  <div className="text-white/40">Sessione lordo</div>
                  <div className="font-extrabold text-[#f3d8b6]">
                    € {fmtEur(cash.totals.session_gross)}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 p-2">
                  <div className="text-white/40">Sessione contanti</div>
                  <div className="font-extrabold">
                    € {fmtEur(cash.totals.session_cash)}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 p-2">
                  <div className="text-white/40">Sessione POS</div>
                  <div className="font-extrabold">
                    € {fmtEur(cash.totals.session_card)}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 p-2">
                  <div className="text-white/40">N. vendite</div>
                  <div className="font-extrabold">
                    {cash.totals.session_count_sales}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
            <button
              onClick={loadCashStatus}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
              disabled={cashLoading}
            >
              Stato cassa
            </button>
            <button
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
  `Report oggi — Lordo € ${(Number(t.gross) || 0).toFixed(2)} · Contanti € ${(Number(t.cash) || 0).toFixed(2)} · POS € ${(Number(t.card) || 0).toFixed(2)} · Vendite ${Number(t.count_sales) || 0}`
);

                } catch (e: any) {
                  toast.error("Errore report: " + (e?.message || "Errore"));
                }
              }}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
              disabled={cashLoading}
            >
              Report oggi
            </button>

            {!isCassaOpen ? (
              <button
                onClick={() => setOpenCash(true)}
                className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-extrabold text-black hover:opacity-90"
                disabled={cashLoading}
              >
                Apri cassa
              </button>
            ) : (
              <button
                onClick={() => setCloseCash(true)}
                className="rounded-xl bg-red-400 px-4 py-2 text-sm font-extrabold text-black hover:opacity-90"
                disabled={cashLoading}
              >
                Chiudi cassa
              </button>
            )}
          </div>
        </div>
      </div>

      {(err || cashErr) && (
        <div className="mb-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">
          {err || cashErr}
        </div>
      )}

      {loading ? (
        <div className="text-white/60 text-sm">Caricamento...</div>
      ) : rows.length === 0 ? (
        <div className="text-white/60 text-sm">
          Nessun appuntamento in sala.
        </div>
      ) : (
        <div className="space-y-3">
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
                className="rounded-2xl border border-white/10 bg-black/20 p-4 flex items-center justify-between"
              >
                <div className="min-w-0">
                  <div className="text-[#f3d8b6] font-extrabold truncate">
                    {customer}
                  </div>
                  <div className="text-white/60 text-xs mt-0.5">
                    {start}–{end} · Operatore: {staff}
                  </div>
                  {a?.notes && (
                    <div className="text-white/40 text-xs mt-1 line-clamp-1 italic">
                      {a.notes}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => router.push(`/dashboard/cassa/${a.id}`)}
                    className="rounded-xl bg-[#f3d8b6] px-3 py-2 text-xs font-bold text-black hover:opacity-90"
                  >
                    Vai in cassa
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
