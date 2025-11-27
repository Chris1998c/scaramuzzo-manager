"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { motion } from "framer-motion";

interface Props {
  isOpen: boolean;
  close: () => void;
  product: any;
  salons: any[];
  onCompleted: () => void;
}

export default function StockModal({
  isOpen,
  close,
  product,
  salons,
  onCompleted,
}: Props) {
  const [mode, setMode] = useState<"carico" | "scarico" | "trasferimento">(
    "carico"
  );
    const supabase = createClient(); // ✅ ORA FUNZIONA
  const [quantity, setQuantity] = useState<number>(1);
  const [fromSalon, setFromSalon] = useState<number>(5); // Magazzino Centrale
  const [toSalon, setToSalon] = useState<number>(1);

  if (!isOpen || !product) return null;

  async function handleConfirm() {
    if (quantity <= 0) return;

    if (mode === "carico") {
      await supabase.from("product_stock").insert({
        product_id: product.id,
        salon_id: toSalon,
        quantity,
      });

      await supabase.from("stock_movements").insert({
        type: "carico",
        product_id: product.id,
        quantity,
        from_salon: null,
        to_salon: toSalon,
      });
    }

    if (mode === "scarico") {
      await supabase
        .from("product_stock")
        .update({ quantity: product.quantity - quantity })
        .eq("product_id", product.id)
        .eq("salon_id", fromSalon);

      await supabase.from("stock_movements").insert({
        type: "scarico",
        product_id: product.id,
        quantity,
        from_salon: fromSalon,
        to_salon: null,
      });
    }

    if (mode === "trasferimento") {
      await supabase
        .from("product_stock")
        .update({ quantity: product.quantity - quantity })
        .eq("product_id", product.id)
        .eq("salon_id", fromSalon);

      await supabase.from("product_stock").insert({
        product_id: product.id,
        salon_id: toSalon,
        quantity,
      });

      await supabase.from("stock_movements").insert({
        type: "trasferimento",
        product_id: product.id,
        quantity,
        from_salon: fromSalon,
        to_salon: toSalon,
      });
    }

    onCompleted();
    close();
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
          {["carico", "scarico", "trasferimento"].map((m) => (
            <button
              key={m}
              onClick={() => setMode(m as any)}
              className={`flex-1 py-3 rounded-xl font-semibold ${
                mode === m
                  ? "bg-[#d8a471] text-black"
                  : "bg-[#3a251a] text-white"
              }`}
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
          onChange={(e) => setQuantity(Number(e.target.value))}
          min={1}
        />

        {/* BOTTONI */}
        <button
          onClick={handleConfirm}
          className="w-full bg-[#d8a471] text-[#1c0f0a] py-3 rounded-xl font-bold text-lg mb-4"
        >
          Conferma
        </button>

        <button
          onClick={close}
          className="w-full text-white/70 py-2 text-center"
        >
          Annulla
        </button>
      </motion.div>
    </div>
  );
}
