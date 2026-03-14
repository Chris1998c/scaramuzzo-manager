"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { MAGAZZINO_CENTRALE_ID } from "@/lib/constants";
import { History, RefreshCw } from "lucide-react";

interface Movement {
  id: number;
  created_at: string;
  product_id: number;
  product_name: string;
  category: string | null;
  quantity: number;
  movement_type: "carico" | "scarico" | "trasferimento" | string;
  from_salon: number | null;
  to_salon: number | null;
}

const SALONI_LABEL: Record<number, string> = {
  1: "Corigliano",
  2: "Cosenza",
  3: "Castrovillari",
  4: "Roma",
  5: "Magazzino Centrale",
};

function salonLabel(id: number) {
  return SALONI_LABEL[id] ?? `Salone ${id}`;
}

function toSalonId(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 1 ? n : null; // ✅ 1..n (qui 1..5)
}

export default function MovimentiPage() {
  const supabase = useMemo(() => createClient(), []);

  const { role, activeSalonId, isReady, receptionSalonId, allowedSalons } = useActiveSalon();

  const [userSalonId, setUserSalonId] = useState<number | null>(null);

  // ✅ contesto: SEMPRE 1..5
  const [ctxSalonId, setCtxSalonId] = useState<number>(MAGAZZINO_CENTRALE_ID);

  const [movements, setMovements] = useState<Movement[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "carico" | "scarico" | "trasferimento">("");
  const [loadingUser, setLoadingUser] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const isWarehouse = role === "coordinator" || role === "magazzino";

  // ---------------------------
  // LOAD USER (solo per cliente; reception usa receptionSalonId dal provider)
  // ---------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      try {
        setLoadingUser(true);
        setErrMsg(null);

        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;

        const user = data?.user;
        if (!user) {
          setErrMsg("Utente non autenticato.");
          return;
        }

        const sid = toSalonId(user.user_metadata?.salon_id ?? null);

        if (cancelled) return;
        setUserSalonId(sid);
      } catch (e) {
        console.error(e);
        if (!cancelled) setErrMsg("Errore nel caricamento utente.");
      } finally {
        if (!cancelled) setLoadingUser(false);
      }
    }

    loadUser();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // ---------------------------
  // CTX DEFINITIVO
  // - warehouse -> segue activeSalonId (dallo switcher)
  // - reception -> receptionSalonId (staff.salon_id, come API/Trasferimenti/Scarico)
  // - cliente -> userSalonId (da metadata)
  // ---------------------------
  useEffect(() => {
    if (!isReady) return;
    if (loadingUser) return;

    if (!isWarehouse) {
      if (role === "reception") {
        if (receptionSalonId == null) {
          setCtxSalonId(MAGAZZINO_CENTRALE_ID);
          return;
        }
        setCtxSalonId(receptionSalonId);
      } else {
        if (userSalonId == null) {
          setCtxSalonId(MAGAZZINO_CENTRALE_ID);
          return;
        }
        setCtxSalonId(userSalonId);
      }
      return;
    }

    const v =
      Number.isFinite(activeSalonId) &&
      (activeSalonId as number) >= 1
        ? (activeSalonId as number)
        : MAGAZZINO_CENTRALE_ID;

    setCtxSalonId(v);
  }, [isReady, loadingUser, isWarehouse, role, activeSalonId, receptionSalonId, userSalonId]);

  // ---------------------------
  // FETCH MOVEMENTS (filtrato SEMPRE su ctxSalonId)
  // ---------------------------
  async function fetchMovements(salonId: number, searchText: string, type: typeof typeFilter) {
    let query = supabase
      .from("movimenti_view")
      .select("*")
      .order("created_at", { ascending: false });

    // ✅ SEMPRE: dove from_salon o to_salon = salone corrente
    query = query.or(`from_salon.eq.${salonId},to_salon.eq.${salonId}`);

    const st = searchText.trim();
    if (st) query = query.ilike("product_name", `%${st}%`);
    if (type) query = query.eq("movement_type", type);

    const { data, error } = await query;

    if (error) {
      console.error(error);
      setMovements([]);
      setErrMsg("Errore nel caricamento movimenti.");
      return;
    }

    setErrMsg(null);
    setMovements((data as Movement[]) || []);
  }

  // fetch automatico quando cambia ctx/filtri
  useEffect(() => {
    if (!isReady) return;
    if (loadingUser) return;

    if (!isWarehouse && (role === "reception" ? receptionSalonId == null : userSalonId == null))
      return;

    fetchMovements(ctxSalonId, search, typeFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, loadingUser, role, receptionSalonId, ctxSalonId, search, typeFilter]);

  function formatDate(dateString: string): string {
    const d = new Date(dateString);
    return d.toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatDirection(m: Movement): string {
    const from = m.from_salon;
    const to = m.to_salon;

    if (m.movement_type === "carico") {
      return `Carico su ${to == null ? "-" : salonLabel(to)}`;
    }
    if (m.movement_type === "scarico") {
      return `Scarico da ${from == null ? "-" : salonLabel(from)}`;
    }
    if (m.movement_type === "trasferimento") {
      return `${from == null ? "-" : salonLabel(from)} → ${to == null ? "-" : salonLabel(to)}`;
    }
    return m.movement_type;
  }

  // ---------------------------
  // UI STATES
  // ---------------------------
  if (!isReady || loadingUser) {
    return (
      <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white">
        Caricamento…
      </div>
    );
  }

  if (errMsg) {
    return (
      <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white">
        <h1 className="text-3xl font-bold mb-3">Movimenti</h1>
        <p className="text-white/70">{errMsg}</p>
      </div>
    );
  }

  if (!isWarehouse && (role === "reception" ? receptionSalonId === null : userSalonId === null)) {
    return (
      <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white">
        <h1 className="text-3xl font-bold mb-3">Movimenti</h1>
        <p className="text-white/70">
          Questo utente non ha un <b>salon_id</b> associato. Contatta l’amministratore.
        </p>
      </div>
    );
  }

  const salonName =
    allowedSalons.find((s) => s.id === ctxSalonId)?.name ?? salonLabel(ctxSalonId);

  return (
    <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white space-y-6">
      {/* HERO */}
      <div className="rounded-3xl border border-white/10 bg-scz-dark shadow-[0_0_60px_rgba(0,0,0,0.25)] overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 md:p-7 bg-black/20 border-b border-white/10">
          <div className="flex items-start gap-4">
            <div className="shrink-0 rounded-2xl p-3 bg-black/30 border border-white/10">
              <History className="text-[#f3d8b6]" size={28} strokeWidth={1.7} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-wider text-white/50 mb-1">
                Magazzino
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-[#f3d8b6] tracking-tight">
                Movimenti
              </h1>
              <p className="text-white/60 mt-1">
                Storico per <span className="font-semibold text-white/90">{salonName}</span>
              </p>
              <p className="text-white/50 text-sm mt-1">
                {isWarehouse
                  ? "Cambia salone dallo switcher in alto."
                  : "Storico del tuo salone."}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="shrink-0 self-start sm:self-center inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 bg-black/30 border border-white/10 text-[#f3d8b6] font-semibold hover:bg-black/40 transition"
            onClick={() => fetchMovements(ctxSalonId, search, typeFilter)}
          >
            <RefreshCw size={18} />
            Aggiorna
          </button>
        </div>
      </div>

      {/* FILTRI */}
      <div className="rounded-2xl border border-white/10 bg-scz-dark p-4 md:p-5 space-y-4">
        <div className="text-[10px] font-black uppercase tracking-wider text-white/50">
          Filtri
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1.5">Cerca prodotto</label>
            <input
              className="w-full p-3 rounded-xl bg-black/30 border border-white/10 text-white placeholder:text-white/40 focus:border-[#f3d8b6]/50 focus:outline-none focus:ring-1 focus:ring-[#f3d8b6]/30"
              placeholder="Nome prodotto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1.5">Tipo movimento</label>
            <select
              className="w-full p-3 rounded-xl bg-black/30 border border-white/10 text-white focus:border-[#f3d8b6]/50 focus:outline-none focus:ring-1 focus:ring-[#f3d8b6]/30"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            >
              <option value="">Tutti i movimenti</option>
              <option value="carico">Solo carichi</option>
              <option value="scarico">Solo scarichi</option>
              <option value="trasferimento">Solo trasferimenti</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-black/30 border border-white/10 text-[#f3d8b6] font-semibold hover:bg-black/40 transition"
              onClick={() => fetchMovements(ctxSalonId, search, typeFilter)}
            >
              <RefreshCw size={16} />
              Aggiorna
            </button>
          </div>
        </div>
      </div>

      {/* TABELLA */}
      <div className="rounded-2xl border border-white/10 bg-scz-dark overflow-hidden">
        {movements.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-white/10 bg-black/20">
                  <th className="p-3 text-left text-[10px] font-black uppercase tracking-wider text-white/50">
                    Data
                  </th>
                  <th className="p-3 text-left text-[10px] font-black uppercase tracking-wider text-white/50">
                    Prodotto
                  </th>
                  <th className="p-3 text-left text-[10px] font-black uppercase tracking-wider text-white/50">
                    Categoria
                  </th>
                  <th className="p-3 text-left text-[10px] font-black uppercase tracking-wider text-white/50">
                    Tipo
                  </th>
                  <th className="p-3 text-left text-[10px] font-black uppercase tracking-wider text-white/50">
                    Qty
                  </th>
                  <th className="p-3 text-left text-[10px] font-black uppercase tracking-wider text-white/50">
                    Direzione
                  </th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} className="border-b border-white/5 hover:bg-white/[0.03] transition">
                    <td className="p-3 text-white/80 tabular-nums">{formatDate(m.created_at)}</td>
                    <td className="p-3 font-medium text-white">{m.product_name}</td>
                    <td className="p-3 text-white/60">{m.category ?? "—"}</td>
                    <td className="p-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                          m.movement_type === "carico"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : m.movement_type === "scarico"
                              ? "bg-red-500/20 text-red-300"
                              : "bg-[#f3d8b6]/15 text-[#f3d8b6]"
                        }`}
                      >
                        {m.movement_type}
                      </span>
                    </td>
                    <td className="p-3 font-semibold text-[#f3d8b6] tabular-nums">{m.quantity}</td>
                    <td className="p-3 text-white/70 text-xs">{formatDirection(m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-2xl p-4 bg-black/20 border border-white/10 mb-3">
              <History className="text-white/30" size={36} strokeWidth={1.5} />
            </div>
            <p className="text-white/60 font-medium">Nessun movimento trovato.</p>
            <p className="text-white/40 text-sm mt-1">
              Modifica i filtri o attendi nuovi movimenti per questo salone.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
