"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import { MAGAZZINO_CENTRALE_ID, salonLabel } from "@/lib/constants";
import type { StaffSettingsRow } from "@/lib/staffSettings";
import {
  STAFF_ROLE_OPTIONS,
  STAFF_ROLE_LABELS,
  STAFF_WEEKDAYS,
} from "@/lib/staffSettings";
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

type FormState = {
  staff_code: string;
  salon_id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  active: boolean;
  associatedSalonIds: Set<number>;
  mobile_enabled: boolean;
  mobile_pin: string;
  clear_mobile_pin: boolean;
  scheduleDays: Set<number>;
};

function defaultForm(
  row: StaffSettingsRow | null,
  defaultSalonId: number | null,
  allowedSalons: SalonOption[],
): FormState {
  const fallbackSalon = defaultSalonId ?? allowedSalons[0]?.id;
  if (!row) {
    const primary = fallbackSalon != null ? fallbackSalon : 0;
    const associated = new Set<number>();
    if (primary > 0) associated.add(primary);
    return {
      staff_code: "",
      salon_id: primary > 0 ? String(primary) : "",
      name: "",
      role: "stylist",
      phone: "",
      email: "",
      active: true,
      associatedSalonIds: associated,
      mobile_enabled: false,
      mobile_pin: "",
      clear_mobile_pin: false,
      scheduleDays: new Set(),
    };
  }

  return {
    staff_code: row.staff_code,
    salon_id: String(row.salon_id),
    name: row.name,
    role: row.role,
    phone: row.phone ?? "",
    email: row.email ?? "",
    active: row.active,
    associatedSalonIds: new Set(row.associated_salon_ids),
    mobile_enabled: row.mobile_enabled,
    mobile_pin: "",
    clear_mobile_pin: false,
    scheduleDays: new Set(row.schedule_active_days),
  };
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-[#f3d8b6]/90 pt-1">
      {children}
    </h3>
  );
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

  const salonOptions = useMemo(
    () => [...allowedSalons].sort((a, b) => a.id - b.id),
    [allowedSalons],
  );

  const primarySalonId = Number(form.salon_id);

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

  function setPrimarySalon(id: string) {
    const n = Number(id);
    setForm((f) => {
      const next = new Set(f.associatedSalonIds);
      if (Number.isFinite(n) && n > 0) next.add(n);
      return { ...f, salon_id: id, associatedSalonIds: next };
    });
  }

  function toggleAssociated(salonId: number) {
    if (salonId === primarySalonId) return;
    setForm((f) => {
      const next = new Set(f.associatedSalonIds);
      if (next.has(salonId)) next.delete(salonId);
      else next.add(salonId);
      next.add(primarySalonId);
      return { ...f, associatedSalonIds: next };
    });
  }

  function toggleScheduleDay(iso: number) {
    setForm((f) => {
      const next = new Set(f.scheduleDays);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return { ...f, scheduleDays: next };
    });
  }

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
      setError("Seleziona un salone primario valido.");
      setSaving(false);
      return;
    }
    if (!allowedSalons.some((s) => s.id === salonId)) {
      setError("Salone primario non consentito per il tuo profilo.");
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

    const email = form.email.trim() ? form.email.trim() : null;

    const associated = [...form.associatedSalonIds];
    if (!associated.includes(salonId)) associated.push(salonId);

    const payload = {
      staff_code: staffCode,
      salon_id: salonId,
      name,
      role: form.role,
      phone,
      email,
      active: form.active,
      associated_salon_ids: associated,
      mobile_enabled: form.mobile_enabled,
      mobile_pin: form.mobile_pin.trim() || null,
      clear_mobile_pin: form.clear_mobile_pin,
      schedule_active_days: [...form.scheduleDays],
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
    toast.success(mode === "create" ? "Collaboratore creato." : "Collaboratore aggiornato.");
    onSaved();
    onClose();
  }

  const fieldClass =
    "w-full rounded-xl border border-[#5c3a21]/50 bg-black/30 px-3 py-2.5 text-sm text-[#f3d8b6] placeholder:text-white/25 outline-none focus:border-[#f3d8b6]/40";

  const scheduleHint =
    form.scheduleDays.size === 0
      ? "Nessun giorno selezionato: visibile in agenda tutti i giorni (comportamento predefinito)."
      : `Visibile in agenda: ${[...form.scheduleDays]
          .sort((a, b) => a - b)
          .map((d) => STAFF_WEEKDAYS.find((w) => w.iso === d)?.short ?? d)
          .join(", ")}`;

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
            className="relative z-10 w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-[1.75rem] border border-[#5c3a21]/60 bg-[#1a100c] shadow-2xl"
          >
            <motion.div
              className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[#5c3a21]/40 bg-[#1a100c]/95 px-5 py-4 backdrop-blur"
            >
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
            </motion.div>

            <form onSubmit={handleSubmit} className="px-5 py-5 space-y-6">
              <p className="text-xs text-[#c9b299] leading-relaxed rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                Anagrafica operativa del salone (<strong className="text-[#f3d8b6]/90">staff</strong>
                ), distinta dagli account gestionale (<span className="text-white/50">users</span>
                ). Il codice <span className="font-mono text-[#f3d8b6]/80">staff_code</span> è
                univoco e serve anche per l&apos;app collaboratori.
              </p>

              <div className="space-y-4">
                <SectionTitle>Anagrafica</SectionTitle>

                <motion.div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-1.5 sm:col-span-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#c9b299]/80">
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

                  <label className="block space-y-1.5 sm:col-span-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#c9b299]/80">
                      Nome *
                    </span>
                    <input
                      className={fieldClass}
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      required
                      maxLength={200}
                      autoComplete="name"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#c9b299]/80">
                      Ruolo operativo *
                    </span>
                    <select
                      className={fieldClass}
                      value={form.role}
                      onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                      required
                    >
                      {STAFF_ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {STAFF_ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-white/10 bg-black/20 px-4 py-3 self-end">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-[#5c3a21] bg-black/40 text-emerald-600"
                      checked={form.active}
                      onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                    />
                    <span className="text-sm text-[#e8dcc8]">Attivo</span>
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#c9b299]/80">
                      Telefono
                    </span>
                    <input
                      className={fieldClass}
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      maxLength={40}
                      autoComplete="tel"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#c9b299]/80">
                      Email contatto
                    </span>
                    <input
                      type="email"
                      className={fieldClass}
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      maxLength={120}
                      autoComplete="email"
                      placeholder="opzionale"
                    />
                  </label>
                </motion.div>
              </div>

              <div className="space-y-4">
                <SectionTitle>Saloni</SectionTitle>

                <label className="block space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#c9b299]/80">
                    Salone primario *
                  </span>
                  <select
                    className={fieldClass}
                    value={form.salon_id}
                    onChange={(e) => setPrimarySalon(e.target.value)}
                    required
                  >
                    <option value="" disabled>
                      Seleziona salone
                    </option>
                    {salonOptions.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {salonLabel(s.id) !== `Salone ${s.id}` ? salonLabel(s.id) : s.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] text-[#c9b299]/75">
                    Salvato anche come <span className="font-mono">staff.salon_id</span> (legacy
                    per agenda e cassa).
                  </span>
                </label>

                <div className="space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#c9b299]/80">
                    Saloni associati
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {salonOptions.map((s) => {
                      const checked = form.associatedSalonIds.has(s.id);
                      const isPrimary = s.id === primarySalonId;
                      const isWarehouse = s.id === MAGAZZINO_CENTRALE_ID;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          disabled={isPrimary}
                          onClick={() => toggleAssociated(s.id)}
                          className={[
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition",
                            checked
                              ? "border-sky-500/40 bg-sky-500/15 text-sky-100"
                              : "border-[#5c3a21]/50 bg-black/25 text-[#c9b299] hover:border-white/20",
                            isPrimary ? "opacity-90 cursor-default ring-1 ring-[#f3d8b6]/30" : "",
                          ].join(" ")}
                        >
                          {salonLabel(s.id) !== `Salone ${s.id}` ? salonLabel(s.id) : s.name}
                          {isPrimary ? (
                            <span className="text-[10px] font-black uppercase text-[#f3d8b6]/80">
                              primario
                            </span>
                          ) : null}
                          {isWarehouse && !isPrimary ? (
                            <span className="text-[10px] text-white/40">hub</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-[11px] text-[#c9b299]/75">
                    Sincronizzati in <span className="font-mono">staff_salons</span> per visibilità
                    in agenda e filtri report.
                  </span>
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
                <div className="flex items-center gap-2">
                  <Smartphone size={18} className="text-violet-300" />
                  <SectionTitle>App collaboratori</SectionTitle>
                </div>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-[#5c3a21] bg-black/40 text-violet-500"
                    checked={form.mobile_enabled}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, mobile_enabled: e.target.checked }))
                    }
                  />
                  <span className="text-sm text-[#e8dcc8]">Accesso mobile attivo</span>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#c9b299]/80">
                    {mode === "edit" && row?.has_mobile_pin && !form.clear_mobile_pin
                      ? "Nuovo PIN (lascia vuoto per non cambiare)"
                      : "PIN app (4–8 cifre)"}
                  </span>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className={`${fieldClass} font-mono tracking-widest max-w-xs`}
                    value={form.mobile_pin}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        mobile_pin: e.target.value.replace(/\D/g, "").slice(0, 8),
                      }))
                    }
                    autoComplete="new-password"
                    placeholder="••••"
                    disabled={form.clear_mobile_pin}
                  />
                </label>

                {mode === "edit" && row?.has_mobile_pin ? (
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-[#5c3a21] bg-black/40 text-red-500"
                      checked={form.clear_mobile_pin}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          clear_mobile_pin: e.target.checked,
                          mobile_pin: e.target.checked ? "" : f.mobile_pin,
                        }))
                      }
                    />
                    <span className="text-sm text-red-200/90">Rimuovi PIN esistente</span>
                  </label>
                ) : null}

                <p className="text-[11px] text-[#c9b299]/80 leading-relaxed">
                  Login app: codice <span className="font-mono">{form.staff_code || "…"}</span> + PIN.
                  {row?.has_mobile_pin && !form.clear_mobile_pin
                    ? " PIN già configurato."
                    : form.mobile_enabled
                      ? " Richiesto se l'accesso mobile è attivo."
                      : ""}
                </p>
              </div>

              <motion.div className="space-y-3 rounded-2xl border border-[#5c3a21]/40 bg-black/20 p-4">
                <SectionTitle>Turni settimanali (salone primario)</SectionTitle>
                <div className="flex flex-wrap gap-2">
                  {STAFF_WEEKDAYS.map((d) => {
                    const on = form.scheduleDays.has(d.iso);
                    return (
                      <button
                        key={d.iso}
                        type="button"
                        onClick={() => toggleScheduleDay(d.iso)}
                        title={d.label}
                        className={[
                          "min-w-[3rem] rounded-xl border px-3 py-2 text-xs font-black transition",
                          on
                            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                            : "border-[#5c3a21]/50 bg-black/30 text-[#c9b299] hover:border-white/15",
                        ].join(" ")}
                      >
                        {d.short}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-[#c9b299]/80">{scheduleHint}</p>
              </motion.div>

              {mode === "edit" && row?.user_id ? (
                <p className="text-[11px] text-[#c9b299]/80 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  Account gestionale collegato:{" "}
                  <span className="font-mono text-[#f3d8b6]/80">{row.user_id}</span> (non modificabile
                  da qui).
                </p>
              ) : null}

              {error ? (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {error}
                </div>
              ) : null}

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 pb-1">
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
                  {saving ? "Salvataggio…" : "Salva collaboratore"}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
