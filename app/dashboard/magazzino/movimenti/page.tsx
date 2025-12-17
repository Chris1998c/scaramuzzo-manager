"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

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

const SALONI_LABEL = [
  "Magazzino",
  "Corigliano",
  "Cosenza",
  "Castrovillari",
  "Roma",
];

export default function MovimentiPage() {
  const supabase = createClient();

  const [role, setRole] = useState("salone");
  const [salon, setSalon] = useState<number | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;

      if (!user?.user_metadata?.salon_id) return;

      setRole(user.user_metadata.role ?? "salone");
      setSalon(user.user_metadata.salon_id);
    }

    init();
  }, []);

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
      query = query.eq("movement_type", type);
    }

    const { data } = await query;
    setMovements((data as Movement[]) || []);
  }

  useEffect(() => {
    if (salon !== null) {
      fetchMovements(salon, search, typeFilter);
    }
  }, [salon, search, typeFilter]);

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
    const from = m.from_salon ?? activeSalon;
    const to = m.to_salon ?? activeSalon;

    if (m.movement_type === "carico") {
      return `Carico su ${SALONI_LABEL[to]}`;
    }
    if (m.movement_type === "scarico") {
      return `Scarico da ${SALONI_LABEL[from]}`;
    }
    if (m.movement_type === "trasferimento") {
      return `${SALONI_LABEL[from]} → ${SALONI_LABEL[to]}`;
    }

    return m.movement_type;
  }

  return (
    <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white">
      <h1 className="text-3xl font-bold mb-3">
        Movimenti — {SALONI_LABEL[salon]}
      </h1>

      <p className="text-white/60 mb-6">
        Storico movimenti sincronizzato con il salone attivo.
      </p>

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
                <td className="p-3 capitalize">{m.movement_type}</td>
                <td className="p-3">{m.quantity}</td>
                <td className="p-3">{formatDirection(m, salon)}</td>
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
