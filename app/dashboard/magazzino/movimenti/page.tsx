"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

interface Movement {
  id: number;
  created_at: string;
  product_id: number;
  product_name: string;
  category: string | null;
  qty: number;
  type: string; // "carico" | "scarico" | "trasferimento" ...
  from_salon: number | null;
  to_salon: number | null;
}

const SALONI_LABEL = [
  "Magazzino",
  "Corigliano",
  "Cosenza",
  "Castrovillari",
  "Roma",
];

export default function MovimentiPage() {
   const supabase = createClient();
  const [role, setRole] = useState<string>("salone");
  const [salon, setSalon] = useState<number | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  // ============================
  // LOAD USER + MOVIMENTI
  // ============================
  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return;

      const r = user.user_metadata?.role ?? "salone";
      const s = user.user_metadata?.salon_id ?? 0;

      setRole(r);
      setSalon(s);

      fetchMovements(s, "", "");
    }

    init();
  }, []);

  // ============================
  // FETCH MOVIMENTI per salone attivo
  // ============================
  async function fetchMovements(
    salonId: number,
    searchText: string,
    type: string
  ) {
    let query = supabase
      .from("movimenti_view")
      .select("*")
      .or(`from_salon.eq.${salonId},to_salon.eq.${salonId}`)
      .order("created_at", { ascending: false });

    if (searchText) {
      query = query.ilike("product_name", `%${searchText}%`);
    }

    if (type) {
      query = query.eq("type", type);
    }

    const { data } = await query;
    setMovements((data as Movement[]) || []);
  }

  // ============================
  // EFFETTI FILTRI
  // ============================
  useEffect(() => {
    if (salon !== null) {
      fetchMovements(salon, search, typeFilter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeFilter]);

  if (salon === null) return null;

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

function formatDirection(m: Movement, activeSalon: number): string {
  const safeFrom = m.from_salon !== null ? m.from_salon : activeSalon;
  const safeTo = m.to_salon !== null ? m.to_salon : activeSalon;

  if (m.type === "carico") {
    return `Carico su ${SALONI_LABEL[safeTo]}`;
  }
  if (m.type === "scarico") {
    return `Scarico da ${SALONI_LABEL[safeFrom]}`;
  }
  if (m.type === "trasferimento") {
    return `${SALONI_LABEL[safeFrom]} → ${SALONI_LABEL[safeTo]}`;
  }

  return m.type;
}


  return (
    <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white">
      <h1 className="text-3xl font-bold mb-3 text-white">
        Movimenti — {SALONI_LABEL[salon]}
      </h1>

      <p className="text-white/60 mb-6">
        Storico di carichi, scarichi e trasferimenti, sincronizzato con il
        selettore salone in alto.
      </p>

      {/* FILTRI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <input
          className="p-4 rounded-xl bg-[#FFF9F4] text-[#341A09] shadow"
          placeholder="Cerca per prodotto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="p-4 rounded-xl bg-[#FFF9F4] text-[#341A09] shadow"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">Tutti i movimenti</option>
          <option value="carico">Solo carichi</option>
          <option value="scarico">Solo scarichi</option>
          <option value="trasferimento">Solo trasferimenti</option>
        </select>

        <button
          className="bg-[#341A09] text-white rounded-xl shadow px-6"
          onClick={() => fetchMovements(salon, search, typeFilter)}
        >
          Aggiorna
        </button>
      </div>

      {/* TABELLA MOVIMENTI */}
      <div className="bg-[#FFF9F4] text-[#341A09] p-6 rounded-xl shadow">
        <table className="w-full text-sm">
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
                <td className="p-3">{m.category}</td>
                <td className="p-3 capitalize">{m.type}</td>
                <td className="p-3">{m.qty}</td>
                <td className="p-3">{formatDirection(m, salon)}</td>
              </tr>
            ))}

            {movements.length === 0 && (
              <tr>
                <td className="p-4 text-center text-sm text-[#00000080]" colSpan={6}>
                  Nessun movimento registrato per questo salone con i filtri
                  applicati.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Info privilegi */}
      {(role === "magazzino" || role === "coordinator") && (
        <p className="mt-4 text-xs text-white/40">
          Come utente {role}, puoi cambiare salone dal selettore in alto per
          consultare i movimenti degli altri punti vendita.
        </p>
      )}
    </div>
  );
}
