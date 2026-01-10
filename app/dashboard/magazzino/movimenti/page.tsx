"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useUI, MAGAZZINO_CENTRALE_ID } from "@/lib/ui-store";

interface Movement {
  id: number;
  created_at: string;
  product_id: number;
  product_name: string;
  category: string | null;
  quantity: number;
  movement_type: string;
  from_salon: number | null;
  to_salon: number | null;
}

const SALONI_LABEL: Record<number, string> = {
  0: "Magazzino Centrale",
  1: "Corigliano",
  2: "Cosenza",
  3: "Castrovillari",
  4: "Roma",
};

function salonLabel(id: number) {
  return SALONI_LABEL[id] ?? `Salone ${id}`;
}

function toSalonId(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  // accetta 0
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export default function MovimentiPage() {
  const supabase = useMemo(() => createClient(), []);
  const { activeSalonId } = useUI();

  const [role, setRole] = useState("reception");
  const [userSalonId, setUserSalonId] = useState<number | null>(null);

  // contesto definitivo: SEMPRE number (0 = tutti/centrale)
  const [ctx, setCtx] = useState<number>(MAGAZZINO_CENTRALE_ID);

  const [movements, setMovements] = useState<Movement[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "carico" | "scarico" | "trasferimento">("");
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setLoading(true);
        setErrMsg(null);

        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;

        const user = data?.user;
        if (!user) {
          setErrMsg("Utente non autenticato.");
          return;
        }

        const r = String(user.user_metadata?.role ?? "reception");
        const sid = toSalonId(user.user_metadata?.salon_id ?? null);

        if (cancelled) return;
        setRole(r);
        setUserSalonId(sid);
      } catch (e) {
        console.error(e);
        if (!cancelled) setErrMsg("Errore nel caricamento utente.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // ctx definitivo:
  // - reception/cliente -> sempre userSalonId (se manca, blocco)
  // - coordinator/magazzino -> usa activeSalonId (0 = tutti)
  useEffect(() => {
    if (loading) return;

    const isWarehouse = role === "coordinator" || role === "magazzino";

    if (!isWarehouse) {
      setCtx(userSalonId ?? -1); // -1 = stato invalido per bloccare fetch
      return;
    }

    setCtx(Number.isFinite(activeSalonId) ? activeSalonId : MAGAZZINO_CENTRALE_ID);
  }, [activeSalonId, role, userSalonId, loading]);

  async function fetchMovements(contextSalonId: number, searchText: string, type: typeof typeFilter) {
    // contextSalonId:
    // - 0 => "tutti i saloni" (vista aggregata)
    // - >0 => filtra movimenti dove from/to = quel salone
    // - -1 => invalido (non fetchare)
    if (contextSalonId === -1) return;

    let query = supabase
      .from("movimenti_view")
      .select("*")
      .order("created_at", { ascending: false });

    if (contextSalonId !== MAGAZZINO_CENTRALE_ID) {
      query = query.or(`from_salon.eq.${contextSalonId},to_salon.eq.${contextSalonId}`);
    }

    if (searchText.trim()) query = query.ilike("product_name", `%${searchText.trim()}%`);
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

  useEffect(() => {
    if (loading) return;

    // reception senza salon_id: blocco definitivo
    if ((role === "reception" || role === "cliente") && userSalonId === null) return;

    fetchMovements(ctx, search, typeFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, search, typeFilter, loading]);

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

  if (loading) {
    return <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white">Caricamento…</div>;
  }

  if (errMsg) {
    return (
      <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white">
        <h1 className="text-3xl font-bold mb-3">Movimenti</h1>
        <p className="text-white/70">{errMsg}</p>
      </div>
    );
  }

  if ((role === "reception" || role === "cliente") && userSalonId === null) {
    return (
      <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white">
        <h1 className="text-3xl font-bold mb-3">Movimenti</h1>
        <p className="text-white/70">
          Questo utente non ha un <b>salon_id</b> associato. Contatta l’amministratore.
        </p>
      </div>
    );
  }

  const titleSuffix = salonLabel(ctx); // 0 -> Magazzino Centrale

  return (
    <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white">
      <h1 className="text-3xl font-bold mb-3">Movimenti — {titleSuffix}</h1>

      <p className="text-white/60 mb-6">Storico movimenti sincronizzato con il salone attivo.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-8">
        <input
          className="p-4 rounded-xl bg-[#FFF9F4] text-[#341A09] shadow"
          placeholder="Cerca per prodotto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="p-4 rounded-xl bg-[#FFF9F4] text-[#341A09] shadow"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as any)}
        >
          <option value="">Tutti i movimenti</option>
          <option value="carico">Solo carichi</option>
          <option value="scarico">Solo scarichi</option>
          <option value="trasferimento">Solo trasferimenti</option>
        </select>

        <button
          className="bg-[#341A09] text-white rounded-xl shadow px-6 py-4 hover:opacity-90 transition"
          onClick={() => fetchMovements(ctx, search, typeFilter)}
        >
          Aggiorna
        </button>
      </div>

      <div className="bg-[#FFF9F4] text-[#341A09] p-4 md:p-6 rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead>
            <tr className="border-b font-semibold">
              <th className="p-3 text-left">Data</th>
              <th className="p-3 text-left">Prodotto</th>
              <th className="p-3 text-left">Categoria</th>
              <th className="p-3 text-left">Tipo</th>
              <th className="p-3 text-left">Qty</th>
              <th className="p-3 text-left">Direzione</th>
            </tr>
          </thead>

          <tbody>
            {movements.map((m) => (
              <tr key={m.id} className="border-b">
                <td className="p-3">{formatDate(m.created_at)}</td>
                <td className="p-3">{m.product_name}</td>
                <td className="p-3">{m.category ?? "-"}</td>
                <td className="p-3 capitalize">{m.movement_type}</td>
                <td className="p-3">{m.quantity}</td>
                <td className="p-3">{formatDirection(m)}</td>
              </tr>
            ))}

            {movements.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-[#00000080]">
                  Nessun movimento trovato.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
