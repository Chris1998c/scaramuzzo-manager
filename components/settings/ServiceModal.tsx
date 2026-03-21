"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import type { ServiceSettingsRow } from "@/lib/servicesCatalog";
import {
  createServiceWithSalonPriceAction,
  updateServiceWithSalonPriceAction,
} from "@/app/dashboard/impostazioni/actions";

type CategoryOption = { id: number; name: string };

type Props = {
  open: boolean;
  mode: "create" | "edit";
  row: ServiceSettingsRow | null;
  categories: CategoryOption[];
  salonId: number | null;
  onClose: () => void;
  onSaved: () => void;
};

function defaultFormFromRow(row: ServiceSettingsRow | null): {
  name: string;
  category_id: string;
  duration: string;
  duration_active: string;
  duration_processing: string;
  need_processing: boolean;
  visible_in_agenda: boolean;
  visible_in_cash: boolean;
  color_code: string;
  active: boolean;
  price: string;
} {
  if (!row) {
    return {
      name: "",
      category_id: "",
      duration: "30",
      duration_active: "30",
      duration_processing: "0",
      need_processing: false,
      visible_in_agenda: true,
      visible_in_cash: true,
      color_code: "",
      active: true,
      price: "0",
    };
  }
  return {
    name: row.name,
    category_id: row.category_id != null ? String(row.category_id) : "",
    duration: row.duration != null ? String(row.duration) : "0",
    duration_active: row.duration_active != null ? String(row.duration_active) : "0",
    duration_processing: row.duration_processing != null ? String(row.duration_processing) : "0",
    need_processing: !!row.need_processing,
    visible_in_agenda: !!row.visible_in_agenda,
    visible_in_cash: !!row.visible_in_cash,
    color_code: row.color_code ?? "",
    active: row.active,
    price: String(row.price ?? 0),
  };
}

export default function ServiceModal({
  open,
  mode,
  row,
  categories,
  salonId,
  onClose,
  onSaved,
}: Props) {
  const [form, setForm] = useState(() => defaultFormFromRow(null));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setSaving(false);
    setForm(defaultFormFromRow(mode === "edit" ? row : null));
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
    if (salonId == null || !Number.isFinite(salonId) || salonId <= 0) {
      setError("Seleziona un salone dall’header per impostare prezzi e salvare.");
      return;
    }

    setSaving(true);
    setError("");

    const core = {
      name: form.name,
      category_id: form.category_id ? Number(form.category_id) : null,
      duration: Number(form.duration),
      duration_active: Number(form.duration_active),
      duration_processing: Number(form.duration_processing),
      need_processing: form.need_processing,
      visible_in_agenda: form.visible_in_agenda,
      visible_in_cash: form.visible_in_cash,
      color_code: form.color_code.trim() || null,
      active: form.active,
    };

    const price = Number(form.price.replace(",", "."));

    let result;
    if (mode === "create") {
      result = await createServiceWithSalonPriceAction(salonId, core, price);
    } else {
      if (!row?.id) {
        setError("Servizio non valido.");
        setSaving(false);
        return;
      }
      result = await updateServiceWithSalonPriceAction(row.id, salonId, core, price);
    }

    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
    onClose();
  }

  const fieldClass =
    "w-full rounded-xl border border-[#5c3a21]/50 bg-black/30 px-3 py-2.5 text-sm text-[#f3d8b6] placeholder:text-white/25 outline-none focus:border-[#f3d8b6]/40";

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center p-4"
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
            aria-labelledby="service-modal-title"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[1.75rem] border border-[#5c3a21]/60 bg-[#1a100c] shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[#5c3a21]/40 bg-[#1a100c]/95 px-5 py-4 backdrop-blur">
              <h2 id="service-modal-title" className="text-lg font-black text-[#f3d8b6]">
                {mode === "create" ? "Nuovo servizio" : "Modifica servizio"}
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
                Catalogo globale: il prezzo modifica il listino del salone attivo in{" "}
                <code className="text-[#f3d8b6]/90">service_prices</code>. In creazione, lo stesso
                importo viene copiato anche in <code className="text-white/50">services.price</code>{" "}
                (vincolo DB); cassa e agenda usano i listini per salone.
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
                  Categoria
                </span>
                <select
                  className={fieldClass}
                  value={form.category_id}
                  onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
                >
                  <option value="">— Nessuna —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-[#c9b299]/80">
                    Durata totale (min)
                  </span>
                  <input
                    type="number"
                    min={0}
                    className={fieldClass}
                    value={form.duration}
                    onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))}
                    required
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-[#c9b299]/80">
                    Prezzo salone (€)
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
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-[#c9b299]/80">
                    Durata attiva (min)
                  </span>
                  <input
                    type="number"
                    min={0}
                    className={fieldClass}
                    value={form.duration_active}
                    onChange={(e) => setForm((f) => ({ ...f, duration_active: e.target.value }))}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-[#c9b299]/80">
                    Durata processing (min)
                  </span>
                  <input
                    type="number"
                    min={0}
                    className={fieldClass}
                    value={form.duration_processing}
                    onChange={(e) => setForm((f) => ({ ...f, duration_processing: e.target.value }))}
                  />
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-black uppercase tracking-wider text-[#c9b299]/80">
                  Colore agenda (hex)
                </span>
                <input
                  className={fieldClass}
                  placeholder="#C4A574"
                  value={form.color_code}
                  onChange={(e) => setForm((f) => ({ ...f, color_code: e.target.value }))}
                />
              </label>

              <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-[#5c3a21] bg-black/40 text-emerald-600"
                    checked={form.need_processing}
                    onChange={(e) => setForm((f) => ({ ...f, need_processing: e.target.checked }))}
                  />
                  <span className="text-sm text-[#e8dcc8]">Richiede tempo di posa / processing</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-[#5c3a21] bg-black/40 text-emerald-600"
                    checked={form.visible_in_agenda}
                    onChange={(e) => setForm((f) => ({ ...f, visible_in_agenda: e.target.checked }))}
                  />
                  <span className="text-sm text-[#e8dcc8]">Visibile in agenda</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-[#5c3a21] bg-black/40 text-emerald-600"
                    checked={form.visible_in_cash}
                    onChange={(e) => setForm((f) => ({ ...f, visible_in_cash: e.target.checked }))}
                  />
                  <span className="text-sm text-[#e8dcc8]">Visibile in cassa</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-[#5c3a21] bg-black/40 text-emerald-600"
                    checked={form.active}
                    onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                  />
                  <span className="text-sm text-[#e8dcc8]">Servizio attivo (catalogo)</span>
                </label>
              </div>

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
