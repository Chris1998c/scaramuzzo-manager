"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { X, User, FlaskConical, Banknote, Trash2, Save } from "lucide-react";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { generateHours, SLOT_MINUTES } from "./utils";

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

// ✅ robust: prende HH:MM anche se start_time ha secondi o Z
function timeFromTsSafe(ts: string) {
  const s = String(ts || "");
  const parts = s.split("T");
  if (parts.length < 2) return "08:00";
  const t = parts[1];
  return String(t).slice(0, 5) || "08:00";
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

  // ✅ ore coerenti con griglia/box (15 min)
  const hours = useMemo(() => generateHours("08:00", "20:00", SLOT_MINUTES), []);

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

  // ✅ filtro search in tempo reale (e mantiene lista completa)
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
    const sid = activeSalonId == null ? null : Number(activeSalonId);

    let q = supabase.from("staff").select("id, name, active, salon_id").eq("active", true);
    if (sid != null) q = q.eq("salon_id", sid);

    const { data, error } = await q.order("name", { ascending: true });

    if (error) {
      console.error(error);
      setStaff([{ id: null, name: "Disponibile" }]);
      return;
    }

    const available = [{ id: null, name: "Disponibile" }];
    setStaff(available.concat(data || []));
  }

  async function updateAppointment() {
    if (!appointment?.id) return;
    if (saving) return;

    setErr("");

    const customer_id = Number.parseInt(String(customer), 10);
    if (!Number.isFinite(customer_id) || customer_id <= 0) {
      setErr("Seleziona un cliente valido.");
      return;
    }
    if (!time) {
      setErr("Seleziona un orario.");
      return;
    }

    setSaving(true);

    // ✅ mantieni durata originale (end-start)
    const oldStart = new Date(appointment.start_time);
    const oldEnd = appointment.end_time
      ? new Date(appointment.end_time)
      : new Date(oldStart.getTime() + SLOT_MINUTES * 60_000);

    const durationMs = Math.max(SLOT_MINUTES * 60_000, oldEnd.getTime() - oldStart.getTime());

    const newStart = new Date(`${selectedDay}T${time}:00`);
    const newEnd = new Date(newStart.getTime() + durationMs);

    const payload: any = {
      customer_id,
      staff_id: staffId ? Number(staffId) : null,
      notes: notes?.trim() || null,
      start_time: newStart.toISOString().replace("Z", ""),
      end_time: newEnd.toISOString().replace("Z", ""),
    };

    const { error } = await supabase.from("appointments").update(payload).eq("id", appointment.id);

    setSaving(false);

    if (error) {
      setErr(error.message);
      return;
    }

    onUpdated?.();
    close();
  }

  async function deleteAppointment() {
    if (!appointment?.id) return;
    if (saving) return;

    const ok = confirm("Vuoi eliminare questo appuntamento?");
    if (!ok) return;

    setSaving(true);
    setErr("");

    const { error } = await supabase.from("appointments").delete().eq("id", appointment.id);

    setSaving(false);

    if (error) {
      setErr(error.message);
      return;
    }

    onUpdated?.();
    close();
  }

  async function portaInSala() {
    if (!appointment?.id) return;
    if (saving) return;

    setSaving(true);
    setErr("");

    const { error } = await supabase
      .from("appointments")
      .update({ status: "in_sala" })
      .eq("id", appointment.id);

    setSaving(false);

    if (error) {
      setErr(error.message);
      return;
    }

    onUpdated?.();
    close();

    // ✅ default gestionale
    router.push(`/dashboard/cassa/${appointment.id}`);
    // se la tua route è /cassa/[id], cambia in:
    // router.push(`/cassa/${appointment.id}`);
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

  if (!isOpen) return null;

  const headerCustomer = appointment?.customers ? safeName(appointment.customers) : "Appuntamento";

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-xl rounded-3xl border border-[#5c3a21]/60 bg-[#140b07]/85
                   shadow-[0_30px_90px_rgba(0,0,0,0.55)] overflow-hidden text-white"
      >
        {/* header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-[#5c3a21]/50">
          <div className="min-w-0">
            <div className="text-xs text-[#f3d8b6]/70 tracking-wide">Appuntamento</div>
            <h2 className="text-2xl font-extrabold text-[#f3d8b6] tracking-tight mt-1 truncate">
              {headerCustomer}
            </h2>
            <div className="text-xs text-white/50 mt-2">
              ID: <span className="text-white/70">{appointment?.id ?? "-"}</span>
            </div>
          </div>

          <button
            onClick={close}
            disabled={saving}
            className="rounded-2xl p-2 bg-black/25 border border-white/10 text-white/70
                       hover:bg-black/35 transition disabled:opacity-50"
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
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3
                         bg-[#0FA958] text-white font-extrabold
                         shadow-[0_10px_35px_rgba(15,169,88,0.22)]
                         hover:brightness-110 transition disabled:opacity-50"
            >
              <User size={18} />
              Porta in sala
            </button>

            <button
              onClick={goToSchedeTecniche}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3
                         bg-black/20 border border-[#5c3a21]/60 text-[#f3d8b6] font-extrabold
                         hover:bg-black/28 transition disabled:opacity-50"
            >
              Schede <FlaskConical size={18} />
            </button>

            <button
              onClick={goToCash}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3
                         bg-[#f3d8b6] text-[#1A0F0A] font-extrabold
                         hover:opacity-90 transition disabled:opacity-50"
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

        {/* form */}
        <div className="px-6 py-6 space-y-4">
          <div className="rounded-3xl bg-black/20 border border-[#5c3a21]/50 p-4">
            <div className="grid grid-cols-1 gap-3">
              <input
                type="text"
                placeholder="Cerca cliente (nome / telefono)"
                className="w-full rounded-2xl bg-[#1c0f0a] border border-[#5c3a21]/60 px-4 py-3
                           text-sm text-white placeholder:text-white/35
                           focus:outline-none focus:ring-2 focus:ring-[#f3d8b6]/25"
                disabled={saving}
                value={qCustomer}
                onChange={(e) => setQCustomer(e.target.value)}
              />

              <select
                className="w-full rounded-2xl bg-[#1c0f0a] border border-[#5c3a21]/60 px-4 py-3
                           text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#f3d8b6]/25"
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  className="w-full rounded-2xl bg-[#1c0f0a] border border-[#5c3a21]/60 px-4 py-3
                             text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#f3d8b6]/25"
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

                <select
                  className="w-full rounded-2xl bg-[#1c0f0a] border border-[#5c3a21]/60 px-4 py-3
                             text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#f3d8b6]/25"
                  value={staffId ?? ""}
                  disabled={saving}
                  onChange={(e) => setStaffId(e.target.value === "" ? null : e.target.value)}
                >
                  {staff.map((s: any) => (
                    <option key={s.id ?? "free"} value={s.id ?? ""}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <textarea
                placeholder="Note"
                className="w-full rounded-2xl bg-[#1c0f0a] border border-[#5c3a21]/60 p-4
                           text-sm text-white placeholder:text-white/35
                           focus:outline-none focus:ring-2 focus:ring-[#f3d8b6]/25"
                rows={4}
                value={notes}
                disabled={saving}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={updateAppointment}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3
                         bg-[#f3d8b6] text-[#1A0F0A] font-extrabold
                         hover:opacity-90 transition disabled:opacity-50"
            >
              <Save size={18} />
              Salva modifiche
            </button>

            <button
              onClick={deleteAppointment}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3
                         bg-red-500/15 text-red-200 border border-red-400/20 font-extrabold
                         hover:bg-red-500/20 transition disabled:opacity-50"
            >
              <Trash2 size={18} />
              Elimina
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
