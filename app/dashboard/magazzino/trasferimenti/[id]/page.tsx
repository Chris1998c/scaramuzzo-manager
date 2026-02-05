"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { MAGAZZINO_CENTRALE_ID } from "@/lib/constants";

interface Movement {
  id: number;
  created_at: string;
  product_id: number;
  product_name: string;
  quantity: number;
  movement_type: string;
  from_salon: number | null;
  to_salon: number | null;
  reason: string | null;
}

const SALONI_LABEL: Record<number, string> = {
  1: "Corigliano",
  2: "Cosenza",
  3: "Castrovillari",
  4: "Roma",
  5: "Magazzino Centrale",
};

function salonLabel(id: number | null) {
  if (id === null) return "-";
  return SALONI_LABEL[id] ?? `Salone ${id}`;
}

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

export default function TrasferimentoDetailPage() {
  const params = useParams<{ id: string }>();
  const productId = Number(params?.id);

  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [rows, setRows] = useState<Movement[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setErrMsg(null);

        if (!Number.isFinite(productId) || productId <= 0) {
          setErrMsg("ID prodotto non valido.");
          return;
        }

        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (!data.user) {
          setErrMsg("Non autenticato.");
          return;
        }

        const { data: movs, error: movErr } = await supabase
          .from("movimenti_view")
          .select("id,created_at,product_id,product_name,quantity,movement_type,from_salon,to_salon,reason")
          .eq("product_id", productId)
          .order("created_at", { ascending: false });

        if (cancelled) return;

        if (movErr) {
          console.error(movErr);
          setErrMsg("Errore nel recupero movimenti.");
          return;
        }

        setRows((movs as Movement[]) ?? []);
      } catch (e: any) {
        console.error(e);
        if (!cancelled) setErrMsg("Errore pagina dettaglio.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [productId, supabase]);

  const title = rows[0]?.product_name ?? `Prodotto #${productId}`;

  if (loading) {
    return (
      <div className="px-6 py-10 bg-[#1A0F0A] text-[#FDF8F3] min-h-screen">
        Caricamento…
      </div>
    );
  }

  if (errMsg) {
    return (
      <div className="px-6 py-10 bg-[#1A0F0A] text-[#FDF8F3] min-h-screen">
        <h1 className="text-3xl font-bold mb-4">Dettaglio trasferimenti</h1>
        <p className="opacity-70">{errMsg}</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-10 bg-[#1A0F0A] text-[#FDF8F3] min-h-screen">
      <h1 className="text-3xl font-bold mb-2">Dettaglio — {title}</h1>
      <p className="opacity-70 mb-8">Storico movimenti per questo prodotto (read-only).</p>

      <div className="bg-[#FFF9F4] text-[#341A09] p-6 rounded-xl shadow">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b font-semibold">
              <th className="p-3 text-left">Data</th>
              <th className="p-3 text-left">Tipo</th>
              <th className="p-3 text-left">Qty</th>
              <th className="p-3 text-left">Da</th>
              <th className="p-3 text-left">A</th>
              <th className="p-3 text-left">Motivo</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-b">
                <td className="p-3">{formatDate(m.created_at)}</td>
                <td className="p-3 capitalize">{m.movement_type}</td>
                <td className="p-3">{m.quantity}</td>
                <td className="p-3">{salonLabel(m.from_salon)}</td>
                <td className="p-3">{salonLabel(m.to_salon)}</td>
                <td className="p-3">{m.reason ?? "-"}</td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-[#00000080]">
                  Nessun movimento trovato per questo prodotto.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
