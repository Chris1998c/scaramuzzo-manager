"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { X, User, FlaskConical, Banknote, Trash2, Save } from "lucide-react";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { generateHours, SLOT_MINUTES } from "./utils";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface Props {
  isOpen: boolean;
  close: () => void;
  appointment: any;
  selectedDay: string; // yyyy-mm-dd
  onUpdated?: () => void; // refresh grid
}

function safeName(c: any) {
  const full = `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim();
  return full || "Cliente";
}

// prende HH:MM anche se start_time ha secondi/Z
function timeFromTsSafe(ts: string) {
  const s = String(ts || "");
  const parts = s.split("T");
  if (parts.length < 2) return "08:00";
  const t = parts[1] || "";
  return String(t).slice(0, 5) || "08:00";
}

/** Date locale (no UTC shift) */
function parseLocal(ts: string) {
  const [date, time] = String(ts).split("T");
  const [y, m, d] = String(date).split("-").map(Number);
  const [hh, mm, ss] = String(time || "00:00:00").split(":").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, ss || 0, 0);
}

/** format “YYYY-MM-DDTHH:mm:ss” senza Z */
function toNoZ(dt: Date) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  const ss = String(dt.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
}

function toStrOrNull(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

function statusMeta(status: string | null | undefined) {
  const s = String(status || "scheduled");
  if (s === "in_sala") {
    return {
      label: "IN SALA",
      cls: "bg-emerald-400 text-black border border-emerald-300/80",
    };
  }
  if (s === "done") {
    return {
      label: "COMPLETATO",
      cls: "bg-white/10 text-white/80 border border-white/20",
    };
  }
  if (s === "cancelled") {
    return {
      label: "ANNULLATO",
      cls: "bg-red-500/15 text-red-200 border border-red-400/40",
    };
  }
  return {
    label: "PRENOTATO",
    cls: "bg-black/40 text-[#f3d8b6] border border-white/20",
  };
}

export default function EditAppointmentModal({
  isOpen,
  close,
  appointment,
  selectedDay,
  onUpdated,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { activeSalonId } = useActiveSalon();

  const [customers, setCustomers] = useState<any[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);

  const [qCustomer, setQCustomer] = useState("");
  const [customer, setCustomer] = useState<string>("");
  const [staffId, setStaffId] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>("");
  const [time, setTime] = useState<string>("08:00");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // ore coerenti con griglia (15m) — fino a 20:30
  const hours = useMemo(() => generateHours("08:00", "20:30", SLOT_MINUTES), []);

  useEffect(() => {
    if (!isOpen) return;

    setErr("");
    setSaving(false);
    setQCustomer("");

    void loadCustomers();
    void loadStaffForSalon();

    if (appointment) {
      setCustomer(String(appointment.customer_id ?? ""));
      setStaffId(appointment.staff_id != null ? String(appointment.staff_id) : null);
      setNotes(String(appointment.notes ?? ""));
      setTime(timeFromTsSafe(appointment.start_time));
    } else {
      setCustomer("");
      setStaffId(null);
      setNotes("");
      setTime("08:00");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeSalonId, appointment?.id]);

  // filtro clienti
  useEffect(() => {
    const q = qCustomer.toLowerCase().trim();
    if (!q) {
      setFilteredCustomers(customers);
      return;
    }
    setFilteredCustomers(
      customers.filter((c: any) => {
        const full = String(c.full_name ?? "").toLowerCase();
        const phone = String(c.phone ?? "").toLowerCase();
        return full.includes(q) || phone.includes(q);
      })
    );
  }, [qCustomer, customers]);

  async function loadCustomers() {
    const { data, error } = await supabase
      .from("customers")
      .select("id, first_name, last_name, phone")
      .order("last_name", { ascending: true });

    if (error) {
      console.error(error);
      setCustomers([]);
      setFilteredCustomers([]);
      return;
    }

    const list = (data || []).map((c: any) => ({
      ...c,
      full_name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
    }));

    setCustomers(list);
    setFilteredCustomers(list);
  }

  async function loadStaffForSalon() {
    if (!activeSalonId) {
      setStaff([{ id: null, name: "Disponibile" }]);
      return;
    }

    const { data, error } = await supabase
      .from("staff")
      .select("id, name")
      .eq("salon_id", activeSalonId)
      .eq("active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error(error);
      setStaff([{ id: null, name: "Disponibile" }]);
      return;
    }

    setStaff([{ id: null, name: "Disponibile" }, ...(data || [])]);
  }

  // aggiorna appointment + shift coerente delle righe appointment_services
  async function updateAppointment() {
    if (!appointment?.id) return;
    if (saving) return;

    setErr("");

    const customer_id = customer ? String(customer) : null;
    if (!customer_id) return setErr("Seleziona un cliente valido.");

    if (!time) return setErr("Seleziona un orario.");

    setSaving(true);

    try {
      // durata originale appointment (end-start)
      const oldStart = parseLocal(appointment.start_time);
      const oldEnd = appointment.end_time
        ? parseLocal(appointment.end_time)
        : new Date(oldStart.getTime() + SLOT_MINUTES * 60_000);

      const durationMs = Math.max(SLOT_MINUTES * 60_000, oldEnd.getTime() - oldStart.getTime());

      const newStart = parseLocal(`${selectedDay}T${time}:00`);
      const newEnd = new Date(newStart.getTime() + durationMs);

      // delta per spostare anche le righe appointment_services
      const deltaMs = newStart.getTime() - oldStart.getTime();

      // 1) update appointment
      const payload = {
        customer_id,
        staff_id: staffId ? String(staffId) : null,
        notes: notes?.trim() || null,
        start_time: toNoZ(newStart),
        end_time: toNoZ(newEnd),
      };

      const { error: upErr } = await supabase
        .from("appointments")
        .update(payload)
        .eq("id", appointment.id);

      if (upErr) throw upErr;

      // 2) shift appointment_services start_time (se esistono)
      //    (se delta=0, skip)
      if (deltaMs !== 0) {
        const { data: lines, error: linesErr } = await supabase
          .from("appointment_services")
          .select("id, start_time")
          .eq("appointment_id", appointment.id)
          .order("start_time", { ascending: true });

        if (linesErr) throw linesErr;

        for (const l of lines || []) {
          const ls = parseLocal(l.start_time);
          const shifted = new Date(ls.getTime() + deltaMs);

          const { error: lineUpErr } = await supabase
            .from("appointment_services")
            .update({ start_time: toNoZ(shifted) })
            .eq("id", String(l.id));

          if (lineUpErr) throw lineUpErr;
        }
      }

      onUpdated?.();
      close();
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  }

  function openDeleteConfirm() {
    if (!appointment?.id || saving) return;
    setShowDeleteConfirm(true);
  }

  async function performDeleteAppointment() {
    if (!appointment?.id) return;

    setSaving(true);
    setErr("");

    try {
      const { error: delLinesErr } = await supabase
        .from("appointment_services")
        .delete()
        .eq("appointment_id", appointment.id);

      if (delLinesErr) throw delLinesErr;

      const { error: delErr } = await supabase.from("appointments").delete().eq("id", appointment.id);
      if (delErr) throw delErr;

      onUpdated?.();
      close();
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || "Errore eliminazione");
    } finally {
      setSaving(false);
    }
  }

  async function portaInSala() {
    if (!appointment?.id) return;
    if (saving) return;

    setSaving(true);
    setErr("");

    try {
      const res = await fetch("/api/agenda/porta-in-sala", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointment_id: Number(appointment.id) }),
      });

      const json = await res.json().catch(() => ({}) as any);
      if (!res.ok)
        throw new Error(json?.error || "Errore durante Porta in sala");

      onUpdated?.();
      close();
      router.push(`/dashboard/cassa/${appointment.id}`);
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || "Errore Porta in sala");
    } finally {
      setSaving(false);
    }
  }

  function goToCash() {
    if (!appointment?.id) return;
    close();
    router.push(`/dashboard/cassa/${appointment.id}`);
  }

  function goToSchedeTecniche() {
    const cid = appointment?.customer_id;
    if (!cid) return;
    close();
    router.push(`/dashboard/clienti/${cid}`);
  }

  const headerCustomer = appointment?.customers ? safeName(appointment.customers) : "Appuntamento";
  const headerStatus = statusMeta(appointment?.status);
  const headerTime = timeFromTsSafe(appointment?.start_time);

  const status = String(appointment?.status ?? "").toLowerCase();
  const disablePortaInSalaAndCassa = status === "done" || status === "cancelled";

  const serviceLines = useMemo(() => {
    const raw = Array.isArray(appointment?.appointment_services)
      ? appointment.appointment_services
      : [];
    return raw.map((l: any) => ({
      id: l.id,
      name: l?.services?.name ?? "Servizio",
      duration: l?.duration_minutes ?? l?.services?.duration ?? SLOT_MINUTES,
      color: l?.services?.color_code ?? "#666666",
      staffId: l?.staff_id ?? null,
    }));
  }, [appointment]);

  const staffById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of staff || []) {
      if (s?.id == null) continue;
      map.set(String(s.id), String(s.name ?? ""));
    }
    return map;
  }, [staff]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-xl rounded-3xl border border-white/10 bg-scz-dark shadow-[0_30px_90px_rgba(0,0,0,0.55)] overflow-hidden text-white"
      >
        {/* header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-white/10 bg-black/20">
          <div className="min-w-0 space-y-1.5">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
              Appuntamento
            </div>
            <h2 className="text-2xl font-extrabold text-[#f3d8b6] tracking-tight truncate">
              {headerCustomer}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
              <span>
                {selectedDay} · {headerTime}
              </span>
              <span className="w-px h-3 bg-white/20" />
              <span>
                ID: <span className="text-white/80">{appointment?.id ?? "-"}</span>
              </span>
              <span className="w-px h-3 bg-white/20" />
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${headerStatus.cls}`}
              >
                {headerStatus.label}
              </span>
            </div>
          </div>

          <button
            onClick={close}
            disabled={saving}
            className="rounded-2xl p-2 bg-black/40 border border-white/15 text-white/70 hover:bg-black/60 transition disabled:opacity-50"
            aria-label="Chiudi"
            title="Chiudi"
          >
            <X size={18} />
          </button>
        </div>

        {/* quick actions */}
        <div className="px-6 pt-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={portaInSala}
              disabled={saving || disablePortaInSalaAndCassa}
              className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3
                         bg-[#0FA958] text-white font-extrabold
                         shadow-[0_10px_35px_rgba(15,169,88,0.22)]
                         hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <User size={18} />
              Porta in sala
            </button>

            <button
              onClick={goToSchedeTecniche}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 bg-black/30 border border-white/15 text-[#f3d8b6] font-extrabold hover:bg-black/40 transition disabled:opacity-50"
            >
              Schede <FlaskConical size={18} />
            </button>

            <button
              onClick={goToCash}
              disabled={saving || disablePortaInSalaAndCassa}
              className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 bg-[#f3d8b6] text-[#1A0F0A] font-extrabold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cassa <Banknote size={18} />
            </button>
          </div>

          {err && (
            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {err}
            </div>
          )}
        </div>

        {/* form + servizi */}
        <div className="px-6 py-6 space-y-5">
          {/* Servizi appuntamento (read-only) */}
          <div className="rounded-3xl bg-black/25 border border-white/10 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
                Servizi appuntamento
              </div>
              <div className="text-[11px] text-white/60">
                {serviceLines.length} servizio{serviceLines.length === 1 ? "" : "i"}
              </div>
            </div>
            {serviceLines.length === 0 ? (
              <div className="text-xs text-white/40 italic">
                Nessun servizio associato a questo appuntamento.
              </div>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                {serviceLines.map((l: any) => (
                  <div
                    key={l.id}
                    className="flex items-center gap-3 rounded-2xl bg-black/40 border border-white/10 px-3 py-2.5"
                  >
                    <div
                      className="w-1.5 h-8 rounded-full"
                      style={{ backgroundColor: l.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-white truncate">
                          {l.name}
                        </p>
                        <span className="text-[11px] font-mono text-white/60">
                          {l.duration}m
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-white/50">
                        {l.staffId
                          ? staffById.get(String(l.staffId)) || "Staff assegnato"
                          : "Da assegnare"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Dati appuntamento */}
          <div className="rounded-3xl bg-black/25 border border-white/10 p-4">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
                  Cliente
                </div>
                <input
                  type="text"
                  placeholder="Cerca cliente (nome / telefono)"
                  className="w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none focus:border-[#f3d8b6]/40 focus:ring-1 focus:ring-[#f3d8b6]/30"
                  disabled={saving}
                  value={qCustomer}
                  onChange={(e) => setQCustomer(e.target.value)}
                />

                <select
                  className="w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3 text-sm text-white outline-none focus:border-[#f3d8b6]/40 focus:ring-1 focus:ring-[#f3d8b6]/30"
                  value={customer}
                  disabled={saving}
                  onChange={(e) => setCustomer(e.target.value)}
                >
                  <option value="">Seleziona Cliente</option>
                  {filteredCustomers.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} {c.phone ? `- ${c.phone}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
                    Orario
                  </div>
                  <select
                    className="w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3 text-sm text-white outline-none focus:border-[#f3d8b6]/40 focus:ring-1 focus:ring-[#f3d8b6]/30"
                    value={time}
                    disabled={saving}
                    onChange={(e) => setTime(e.target.value)}
                  >
                    {hours.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
                    Staff
                  </div>
                  <select
                    className="w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3 text-sm text-white outline-none focus:border-[#f3d8b6]/40 focus:ring-1 focus:ring-[#f3d8b6]/30"
                    value={staffId ?? ""}
                    disabled={saving}
                    onChange={(e) =>
                      setStaffId(e.target.value === "" ? null : e.target.value)
                    }
                  >
                    {staff.map((s: any) => (
                      <option key={s.id ?? "free"} value={s.id ?? ""}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
                  Note
                </div>
                <textarea
                  placeholder="Note"
                  className="w-full rounded-2xl bg-black/40 border border-white/10 p-4 text-sm text-white placeholder:text-white/35 outline-none focus:border-[#f3d8b6]/40 focus:ring-1 focus:ring-[#f3d8b6]/30"
                  rows={4}
                  value={notes}
                  disabled={saving}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={updateAppointment}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 bg-[#f3d8b6] text-[#1A0F0A] font-extrabold hover:opacity-90 transition disabled:opacity-50"
            >
              <Save size={18} />
              Salva modifiche
            </button>

            <button
              onClick={openDeleteConfirm}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 bg-red-500/15 text-red-200 border border-red-400/20 font-extrabold hover:bg-red-500/20 transition disabled:opacity-50"
            >
              <Trash2 size={18} />
              Elimina
            </button>
          </div>
        </div>
      </motion.div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={performDeleteAppointment}
        title="Elimina appuntamento"
        description="Vuoi eliminare questo appuntamento? L'operazione non può essere annullata."
        confirmLabel="Elimina"
        variant="danger"
      />
    </div>
  );
}
