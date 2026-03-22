"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import type { StaffSettingsRow } from "@/lib/staffSettings";
import { STAFF_ROLE_OPTIONS } from "@/lib/staffSettings";
import { createStaffAction, updateStaffAction } from "@/app/dashboard/impostazioni/staffActions";

type SalonOption = { id: number; name: string };

type Props = {
  open: boolean;
  mode: "create" | "edit";
  row: StaffSettingsRow | null;
  allowedSalons: SalonOption[];
  defaultSalonId: number | null;
  onClose: () => void;
  onSaved: () => void;
};

function defaultForm(
  row: StaffSettingsRow | null,
  defaultSalonId: number | null,
  allowedSalons: SalonOption[],
) {
  const fallbackSalon = defaultSalonId ?? allowedSalons[0]?.id;
  if (!row) {
    return {
      staff_code: "",
      salon_id: fallbackSalon != null ? String(fallbackSalon) : "",
      name: "",
      role: "stylist",
      phone: "",
      active: true,
    };
  }
  return {
    staff_code: row.staff_code,
    salon_id: String(row.salon_id),
    name: row.name,
    role: row.role,
    phone: row.phone ?? "",
    active: row.active,
  };
}

export default function StaffModal({
  open,
  mode,
  row,
  allowedSalons,
  defaultSalonId,
  onClose,
  onSaved,
}: Props) {
  const [form, setForm] = useState(() => defaultForm(null, defaultSalonId, allowedSalons));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setSaving(false);
    setForm(defaultForm(mode === "edit" ? row : null, defaultSalonId, allowedSalons));
  }, [open, mode, row, defaultSalonId, allowedSalons]);

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

    const staffCode = form.staff_code.trim().replace(/\s+/g, " ");
    const name = form.name.trim();
    const salonId = Number(form.salon_id);

    if (!staffCode) {
      setError("Il codice collaboratore è obbligatorio.");
      setSaving(false);
      return;
    }
    if (!name) {
      setError("Il nome è obbligatorio.");
      setSaving(false);
      return;
    }
    if (!form.salon_id || !Number.isFinite(salonId) || salonId <= 0) {
      setError("Seleziona un salone valido.");
      setSaving(false);
      return;
    }
    if (!allowedSalons.some((s) => s.id === salonId)) {
      setError("Salone non consentito per il tuo profilo.");
      setSaving(false);
      return;
    }
    if (!STAFF_ROLE_OPTIONS.includes(form.role as (typeof STAFF_ROLE_OPTIONS)[number])) {
      setError("Ruolo non valido.");
      setSaving(false);
      return;
    }

    let phone: string | null = null;
    if (form.phone.trim()) {
      phone = form.phone.trim().replace(/\s+/g, " ");
      if (phone.length > 40) {
        setError("Telefono troppo lungo (max 40 caratteri).");
        setSaving(false);
        return;
      }
    }

    const payload = {
      staff_code: staffCode,
      salon_id: salonId,
      name,
      role: form.role,
      phone,
      active: form.active,
    };

    let result;
    if (mode === "create") {
      result = await createStaffAction(payload);
    } else {
      if (!row?.id) {
        setError("Collaboratore non valido.");
        setSaving(false);
        return;
      }
      result = await updateStaffAction(row.id, payload);
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
          className="fixed inset-0 z-[102] flex items-end justify-center sm:items-center p-4"
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
            aria-labelledby="staff-modal-title"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[1.75rem] border border-[#5c3a21]/60 bg-[#1a100c] shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[#5c3a21]/40 bg-[#1a100c]/95 px-5 py-4 backdrop-blur">
              <h2 id="staff-modal-title" className="text-lg font-black text-[#f3d8b6]">
                {mode === "create" ? "Nuovo collaboratore" : "Modifica collaboratore"}
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
                Il codice collaboratore (<code className="text-[#f3d8b6]/90">staff_code</code>) è
                univoco in tutto il gestionale e obbligatorio. Non sostituisce la PK né il collegamento
                utente (<code className="text-white/50">user_id</code>), se presente.
              </p>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-black uppercase tracking-wider text-[#c9b299]/80">
                  Codice collaboratore *
                </span>
                <input
                  className={`${fieldClass} font-mono`}
                  value={form.staff_code}
                  onChange={(e) => setForm((f) => ({ ...f, staff_code: e.target.value }))}
                  required
                  maxLength={64}
                  autoComplete="off"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-black uppercase tracking-wider text-[#c9b299]/80">
                  Nome *
                </span>
                <input
                  className={fieldClass}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  maxLength={200}
                  autoComplete="off"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-black uppercase tracking-wider text-[#c9b299]/80">
                  Salone *
                </span>
                <select
                  className={fieldClass}
                  value={form.salon_id}
                  onChange={(e) => setForm((f) => ({ ...f, salon_id: e.target.value }))}
                  required
                >
                  <option value="" disabled>
                    Seleziona salone
                  </option>
                  {allowedSalons.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-black uppercase tracking-wider text-[#c9b299]/80">
                  Ruolo *
                </span>
                <select
                  className={fieldClass}
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  required
                >
                  {STAFF_ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-black uppercase tracking-wider text-[#c9b299]/80">
                  Telefono
                </span>
                <input
                  className={fieldClass}
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  maxLength={40}
                  autoComplete="off"
                />
              </label>

              <label className="flex items-center gap-3 cursor-pointer rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[#5c3a21] bg-black/40 text-emerald-600"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                />
                <span className="text-sm text-[#e8dcc8]">Collaboratore attivo</span>
              </label>

              {mode === "edit" && row?.user_id ? (
                <p className="text-[11px] text-[#c9b299]/80">
                  Account utente collegato: <span className="font-mono text-[#f3d8b6]/80">{row.user_id}</span>
                </p>
              ) : null}

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
                  disabled={saving || allowedSalons.length === 0}
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
