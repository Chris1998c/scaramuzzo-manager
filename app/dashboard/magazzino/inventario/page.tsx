"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import Link from "next/link";

interface Product {
  product_id: number;
  name: string;
  category: string | null;
  barcode: string | null;
  quantity: number;
}

const MAGAZZINO_CENTRALE_ID = 0;

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

function toSalonId(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export default function InventarioPage() {
  const supabase = useMemo(() => createClient(), []);

  const [role, setRole] = useState<string>("reception");
  const [userSalonId, setUserSalonId] = useState<number | null>(null);

  // salon selezionato per la vista inventario
  const [salon, setSalon] = useState<number | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // LOAD USER
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

        // Default vista:
        // - reception: il proprio salone
        // - magazzino/coordinator: magazzino centrale
        if (r === "magazzino" || r === "coordinator") {
          setSalon(MAGAZZINO_CENTRALE_ID);
        } else {
          setSalon(sid);
        }
      } catch (e: any) {
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

  async function fetchProducts(salonId: number, search: string, cat: string) {
    let query = supabase
      .from("products_with_stock")
      .select("product_id, name, category, barcode, quantity")
      .eq("salon_id", salonId);

    if (search) query = query.ilike("name", `%${search}%`);
    if (cat) query = query.eq("category", cat);

    const { data, error } = await query;
    if (error) {
      console.error(error);
      setProducts([]);
      return;
    }

    setProducts((data as Product[]) || []);
  }

  // FILTRI LIVE
  useEffect(() => {
    if (salon !== null) {
      fetchProducts(salon, filter, category);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salon, filter, category]);

  if (loading) {
    return (
      <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white">
        Caricamento…
      </div>
    );
  }

  if (errMsg) {
    return (
      <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white">
        <h1 className="text-3xl font-bold mb-3">Inventario</h1>
        <p className="text-white/70">{errMsg}</p>
      </div>
    );
  }

  if (salon === null) {
    return (
      <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white">
        <h1 className="text-3xl font-bold mb-3">Inventario</h1>
        <p className="text-white/70">
          salon_id non presente: non posso mostrare l’inventario.
        </p>
      </div>
    );
  }

  const isWarehouse = role === "magazzino" || role === "coordinator";
  const canCarico = isWarehouse && salon === MAGAZZINO_CENTRALE_ID;

  return (
    <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold mb-2">
            Inventario — {salonLabel(salon)}
          </h1>
          <p className="text-white/60">
            {isWarehouse
              ? "Selettore vista: centrale o saloni."
              : "Visualizzazione del tuo salone."}
          </p>
        </div>

        {/* Selettore salone SOLO per coordinator/magazzino */}
        {isWarehouse && (
          <div className="flex items-center gap-3">
            <label className="text-sm text-white/70">Vista salone</label>
            <select
              value={salon}
              onChange={(e) => setSalon(Number(e.target.value))}
              className="bg-[#FFF9F4] text-[#341A09] rounded-xl px-4 py-3 shadow"
            >
              <option value={0}>Magazzino Centrale</option>
              <option value={1}>Corigliano</option>
              <option value={2}>Cosenza</option>
              <option value={3}>Castrovillari</option>
              <option value={4}>Roma</option>
            </select>
          </div>
        )}
      </div>

      {/* FILTRI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 mt-8">
        <input
          className="p-4 rounded-xl bg-[#FFF9F4] text-[#341A09] shadow"
          placeholder="Cerca prodotto..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />

        <input
          className="p-4 rounded-xl bg-[#FFF9F4] text-[#341A09] shadow"
          placeholder="Categoria"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />

        <button
          className="bg-[#341A09] text-white rounded-xl shadow px-6"
          onClick={() => fetchProducts(salon, filter, category)}
        >
          Aggiorna
        </button>
      </div>

      {/* TABELLA */}
      <div className="bg-[#FFF9F4] text-[#341A09] p-6 rounded-xl shadow">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b font-semibold">
              <th className="p-3 text-left">Prodotto</th>
              <th className="p-3 text-left">Categoria</th>
              <th className="p-3 text-left">Barcode</th>
              <th className="p-3 text-left">Giacenza</th>
              <th className="p-3 text-right">Azioni</th>
            </tr>
          </thead>

          <tbody>
            {products.map((p) => (
              <tr key={p.product_id} className="border-b">
                <td className="p-3">{p.name}</td>
                <td className="p-3">{p.category ?? "-"}</td>
                <td className="p-3">{p.barcode || "-"}</td>

                <td className="p-3">
                  {p.quantity <= 5 ? (
                    <span className="text-red-600 font-bold">{p.quantity}</span>
                  ) : (
                    p.quantity
                  )}
                </td>

                <td className="p-3 text-right space-x-3">
                  {/* CARICO: ha senso solo dalla vista Centrale -> verso un salone (lo scegli in pagina carico) */}
                  {canCarico && (
                    <Link
                      href={`/dashboard/magazzino/carico?product=${p.product_id}`}
                      className="px-3 py-1 bg-[#0FA958] text-white rounded"
                    >
                      Carico
                    </Link>
                  )}

                  {/* SCARICO: sempre sul salone attualmente in vista, ma se reception controlliamo che coincida col suo */}
                  <Link
                    href={`/dashboard/magazzino/scarico?product=${p.product_id}`}
                    className="px-3 py-1 bg-red-600 text-white rounded"
                  >
                    Scarico
                  </Link>

                  {(role === "magazzino" || role === "coordinator") && (
                    <>
                      <Link
                        href={`/dashboard/magazzino/prodotto/${p.product_id}/modifica`}
                        className="px-3 py-1 bg-[#341A09] text-white rounded"
                      >
                        Modifica
                      </Link>

                      <Link
                        href={`/dashboard/magazzino/prodotto/${p.product_id}/qr`}
                        className="px-3 py-1 bg-[#B88A54] text-white rounded"
                      >
                        QR
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {products.length === 0 && (
          <div className="text-center text-sm opacity-60 py-10">
            Nessun prodotto trovato.
          </div>
        )}
      </div>

      {/* Nota per reception */}
      {role === "reception" && userSalonId !== null && salon !== userSalonId && (
        <div className="mt-6 text-sm text-yellow-700 bg-yellow-100 rounded-xl p-4">
          Nota: come reception, dovresti lavorare solo sul tuo salone.
        </div>
      )}
    </div>
  );
}
