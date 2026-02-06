// components/agenda/EditAppointmentModal.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { motion } from "framer-motion";
import { timeFromTs } from "@/lib/appointmentTime";
import { generateHours } from "./utils";
import { useRouter } from "next/navigation";

interface Props {
  isOpen: boolean;
  close: () => void;
  appointment: any;
  selectedDay: string; // yyyy-mm-dd
  onUpdated?: () => void; // refresh grid
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

  const [customers, setCustomers] = useState<any[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);

  const [customer, setCustomer] = useState<string>("");
  const [staffId, setStaffId] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>("");
  const [time, setTime] = useState<string>("08:00");

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    void loadCustomers();
    void loadStaff();

    if (appointment) {
      setCustomer(String(appointment.customer_id ?? ""));
      setStaffId(appointment.staff_id != null ? String(appointment.staff_id) : null);
      setNotes(String(appointment.notes ?? ""));
      setTime(timeFromTs(appointment.start_time));
    }

    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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

  async function loadStaff() {
    const { data, error } = await supabase
      .from("staff")
      .select("id, name, active")
      .eq("active", true)
      .order("name", { ascending: true });

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
    if (!customer || !time) {
      alert("Seleziona cliente e orario.");
      return;
    }
    if (saving) return;

    setSaving(true);

    // mantieni durata originale
    const oldStart = new Date(appointment.start_time);
    const oldEnd = appointment.end_time
      ? new Date(appointment.end_time)
      : new Date(oldStart.getTime() + 30 * 60_000);

    const durationMs = oldEnd.getTime() - oldStart.getTime();

    const newStart = new Date(`${selectedDay}T${time}:00`);
    const newEnd = new Date(newStart.getTime() + durationMs);

    const { error } = await supabase
      .from("appointments")
      .update({
        customer_id: Number(customer),
        staff_id: staffId ? Number(staffId) : null,
        notes,
        start_time: newStart.toISOString().replace("Z", ""),
        end_time: newEnd.toISOString().replace("Z", ""),
      })
      .eq("id", appointment.id);

    if (error) {
      alert("Errore salvataggio: " + error.message);
      setSaving(false);
      return;
    }

    onUpdated?.();
    setSaving(false);
    close();
  }

  async function deleteAppointment() {
    if (!appointment?.id) return;
    if (saving) return;

    const ok = confirm("Vuoi eliminare questo appuntamento?");
    if (!ok) return;

    setSaving(true);

    const { error } = await supabase.from("appointments").delete().eq("id", appointment.id);

    if (error) {
      alert("Errore eliminazione: " + error.message);
      setSaving(false);
      return;
    }

    onUpdated?.();
    setSaving(false);
    close();
  }

  function goToCash() {
    if (!appointment?.id) return;
    // niente API qui: solo “porta in sala” -> vai a /cassa/:id
    close();
    router.push(`/cassa/${appointment.id}`);
  }

  if (!isOpen) return null;

  const hours = generateHours("08:00", "20:00", 30);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-[#1c0f0a] p-8 rounded-2xl shadow-xl w-full max-w-lg border border-[#9b6b43]/30"
      >
        <h2 className="text-2xl font-semibold text-white mb-6">Appuntamento</h2>

        <button
          onClick={goToCash}
          disabled={saving}
          className={`w-full bg-[#22c55e] text-[#0b120c] p-3 rounded-xl font-semibold text-lg mb-4 ${
            saving ? "opacity-70 cursor-not-allowed" : ""
          }`}
        >
          Porta in sala (Cassa)
        </button>

        <input
          type="text"
          placeholder="Cerca cliente (nome o cognome)"
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-3"
          disabled={saving}
          onChange={(e) => {
            const q = e.target.value.toLowerCase().trim();
            const filtered = customers.filter((c: any) =>
              String(c.full_name ?? "").toLowerCase().includes(q)
            );
            setFilteredCustomers(filtered);
          }}
        />

        <select
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-4"
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

        <select
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-4"
          value={time}
          disabled={saving}
          onChange={(e) => setTime(e.target.value)}
        >
          {hours.map((h: string) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>

        <select
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-4"
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

        <textarea
          placeholder="Note"
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-4 h-24"
          value={notes}
          disabled={saving}
          onChange={(e) => setNotes(e.target.value)}
        />

        <button
          onClick={updateAppointment}
          disabled={saving}
          className={`w-full bg-[#d8a471] text-[#1c0f0a] p-3 rounded-xl font-semibold text-lg mb-3 ${
            saving ? "opacity-70 cursor-not-allowed" : ""
          }`}
        >
          Salva Modifiche
        </button>

        <button
          onClick={deleteAppointment}
          disabled={saving}
          className={`w-full bg-red-700 text-white p-3 rounded-xl font-semibold text-lg mb-4 ${
            saving ? "opacity-70 cursor-not-allowed" : ""
          }`}
        >
          Elimina Appuntamento
        </button>

        <button
          onClick={close}
          disabled={saving}
          className={`w-full text-white/70 text-center ${saving ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          Annulla
        </button>
      </motion.div>
    </div>
  );
}
