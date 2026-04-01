"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { toast } from "sonner";
import type { ProductSettingsRow } from "@/lib/productsSettings";
import {
  createProductAction,
  updateProductAction,
} from "@/app/dashboard/impostazioni/productActions";

type Props = {
  open: boolean;
  mode: "create" | "edit";
  row: ProductSettingsRow | null;
  onClose: () => void;
  onSaved: () => void;
};

function defaultForm(row: ProductSettingsRow | null) {
  if (!row) {
    return {
      name: "",
      barcode: "",
      price: "0",
      cost: "",
      category: "",
      active: true,
    };
  }
  return {
    name: row.name,
    barcode: row.barcode ?? "",
    price: String(row.price ?? 0),
    cost: row.cost != null ? String(row.cost) : "",
    category: row.category ?? "",
    active: row.active,
  };
}

export default function ProductModal({ open, mode, row, onClose, onSaved }: Props) {
  const [form, setForm] = useState(() => defaultForm(null));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setSaving(false);
    setForm(defaultForm(mode === "edit" ? row : null));
  }, [open, mode, row]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    setSaving(true);
    setError("");

    const price = Number(String(form.price).replace(",", "."));
    if (!Number.isFinite(price) || price < 0) {
      setError("Prezzo non valido (≥ 0).");
      setSaving(false);
      return;
    }

    const costRaw = String(form.cost).trim();
    let cost: number | null = null;
    if (costRaw !== "") {
      const c = Number(costRaw.replace(",", "."));
      if (!Number.isFinite(c) || c < 0) {
        setError("Costo non valido (≥ 0).");
        setSaving(false);
        return;
      }
      cost = c;
    }

    const payload = {
      name: form.name,
      barcode: form.barcode.trim() ? form.barcode.trim() : null,
      price,
      cost: cost,
      active: form.active,
      category: form.category.trim() ? form.category.trim() : null,
    };

    let result;
    if (mode === "create") {
      result = await createProductAction(payload);
    } else {
      if (!row?.id) {
        setError("Prodotto non valido.");
        setSaving(false);
        return;
      }
      result = await updateProductAction(row.id, payload);
    }

    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(mode === "create" ? "Prodotto creato." : "Prodotto aggiornato.");
    onSaved();
    onClose();
  }

  const fieldClass =
    "w-full rounded-xl border border-[#5c3a21]/50 bg-black/30 px-3 py-2.5 text-sm text-[#f3d8b6] placeholder:text-white/25 outline-none focus:border-[#f3d8b6]/40";

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[101] flex items-end justify-center sm:items-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            aria-label="Chiudi"
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-modal-title"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[1.75rem] border border-[#5c3a21]/60 bg-[#1a100c] shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[#5c3a21]/40 bg-[#1a100c]/95 px-5 py-4 backdrop-blur">
              <h2 id="product-modal-title" className="text-lg font-black text-[#f3d8b6]">
                {mode === "create" ? "Nuovo prodotto" : "Modifica prodotto"}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl p-2 text-[#c9b299] hover:bg-white/10 hover:text-white"
                aria-label="Chiudi finestra"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
              <p className="text-xs text-[#c9b299] leading-relaxed">
                Anagrafica globale: prezzo vendita da <code className="text-[#f3d8b6]/90">products.price</code>.
                Giacenze e movimenti magazzino restano gestiti altrove.
              </p>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-black uppercase tracking-wider text-[#c9b299]/80">
                  Nome *
                </span>
                <input
                  className={fieldClass}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  autoComplete="off"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-black uppercase tracking-wider text-[#c9b299]/80">
                  Barcode / codice
                </span>
                <input
                  className={fieldClass}
                  value={form.barcode}
                  onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                  placeholder="EAN, SKU lettura, ecc."
                  autoComplete="off"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-black uppercase tracking-wider text-[#c9b299]/80">
                  Categoria (testo)
                </span>
                <input
                  className={fieldClass}
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="Opzionale"
                  autoComplete="off"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-[#c9b299]/80">
                    Prezzo vendita (€) *
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={fieldClass}
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    required
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-[#c9b299]/80">
                    Costo (€)
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={fieldClass}
                    value={form.cost}
                    onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                    placeholder="Opzionale"
                  />
                </label>
              </div>

              <label className="flex items-center gap-3 cursor-pointer rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[#5c3a21] bg-black/40 text-emerald-600"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                />
                <span className="text-sm text-[#e8dcc8]">Prodotto attivo (catalogo / cassa)</span>
              </label>

              {error ? (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {error}
                </div>
              ) : null}

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl px-4 py-2.5 text-sm font-bold text-[#c9b299] hover:bg-white/5"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[#0FA958] px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-emerald-900/30 hover:bg-[#0da052] disabled:opacity-50"
                >
                  {saving ? "Salvataggio…" : "Salva"}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
