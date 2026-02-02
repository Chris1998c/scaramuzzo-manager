"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { motion } from "framer-motion";
import { MAGAZZINO_CENTRALE_ID } from "@/lib/constants";

interface Props {
  isOpen: boolean;
  close: () => void;
  product: any;
  salons: any[]; // [{id,name}] includi anche centrale (5)
  onCompleted: () => void;
}

type Mode = "carico" | "scarico" | "trasferimento";

export default function StockModal({
  isOpen,
  close,
  product,
  salons,
  onCompleted,
}: Props) {
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>("carico");
  const [quantity, setQuantity] = useState<number>(1);

  // default: centrale (id=5)
  const [fromSalon, setFromSalon] = useState<number>(MAGAZZINO_CENTRALE_ID);
  const [toSalon, setToSalon] = useState<number>(MAGAZZINO_CENTRALE_ID);

  const [saving, setSaving] = useState(false);

  if (!isOpen || !product) return null;

  async function handleConfirm() {
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) return;

    // validazioni base
    if (mode === "scarico" && (fromSalon == null || !Number.isFinite(fromSalon))) return;
    if (mode === "carico" && (toSalon == null || !Number.isFinite(toSalon))) return;
    if (mode === "trasferimento") {
      if (fromSalon == null || toSalon == null) return;
      if (fromSalon === toSalon) return;
    }

    try {
      setSaving(true);

      const args =
        mode === "carico"
          ? {
              p_product_id: Number(product.id),
              p_qty: qty,
              p_from_salon: null,
              p_to_salon: Number(toSalon),
              p_movement_type: "carico",
              p_reason: "manuale",
            }
          : mode === "scarico"
          ? {
              p_product_id: Number(product.id),
              p_qty: qty,
              p_from_salon: Number(fromSalon),
              p_to_salon: null,
              p_movement_type: "scarico",
              p_reason: "manuale",
            }
          : {
              p_product_id: Number(product.id),
              p_qty: qty,
              p_from_salon: Number(fromSalon),
              p_to_salon: Number(toSalon),
              p_movement_type: "trasferimento",
              p_reason: "manuale",
            };

      const { data, error } = await supabase.rpc("stock_move", args);

      if (error) {
        console.error("stock_move error:", error);
        alert(error.message);
        return;
      }

      // opzionale: se vuoi vedere risposta
      // console.log("stock_move ok:", data);

      onCompleted();
      close();
    } catch (e) {
      console.error("StockModal error:", e);
      alert("Errore durante la movimentazione");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-[#1c0f0a] border border-[#9b6b43]/40 rounded-2xl p-8 w-full max-w-lg text-white shadow-2xl"
      >
        <h2 className="text-2xl font-semibold text-[#d8a471] mb-6">
          Movimentazione — {product.name}
        </h2>

        {/* MODALITÀ */}
        <div className="flex gap-2 mb-6">
          {(["carico", "scarico", "trasferimento"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              disabled={saving}
              className={`flex-1 py-3 rounded-xl font-semibold ${
                mode === m ? "bg-[#d8a471] text-black" : "bg-[#3a251a] text-white"
              } ${saving ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>

        {/* SALONI */}
        {mode !== "carico" && (
          <select
            className="w-full p-3 mb-4 bg-[#3a251a] rounded-xl text-white"
            value={fromSalon}
            disabled={saving}
            onChange={(e) => setFromSalon(Number(e.target.value))}
          >
            <option value="">Da salone...</option>
            {salons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}

        {mode !== "scarico" && (
          <select
            className="w-full p-3 mb-4 bg-[#3a251a] rounded-xl text-white"
            value={toSalon}
            disabled={saving}
            onChange={(e) => setToSalon(Number(e.target.value))}
          >
            <option value="">A salone...</option>
            {salons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}

        {/* QUANTITÀ */}
        <input
          type="number"
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-6"
          value={quantity}
          disabled={saving}
          onChange={(e) => setQuantity(Number(e.target.value))}
          min={1}
        />

        {/* BOTTONI */}
        <button
          onClick={handleConfirm}
          disabled={saving}
          className={`w-full bg-[#d8a471] text-[#1c0f0a] py-3 rounded-xl font-bold text-lg mb-4 ${
            saving ? "opacity-60 cursor-not-allowed" : ""
          }`}
        >
          {saving ? "Salvataggio..." : "Conferma"}
        </button>

        <button
          onClick={close}
          disabled={saving}
          className="w-full text-white/70 py-2 text-center"
        >
          Annulla
        </button>
      </motion.div>
    </div>
  );
}
