"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { motion } from "framer-motion";

interface Props {
  isOpen: boolean;
  close: () => void;
  appointment: any;
}

export default function EditAppointmentModal({ isOpen, close, appointment }: Props) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);

  const [customer, setCustomer] = useState<string>("");
  const [service, setService] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [collaborator, setCollaborator] = useState<string | null>(null);
  const [time, setTime] = useState<string>("08:00");

  useEffect(() => {
    if (!isOpen) return;

    loadCustomers();
    loadServices();
    loadStaff();

    if (appointment) {
      setCustomer(appointment.customer_id);
      setService(appointment.service_id);
      setNotes(appointment.notes ?? "");
      setCollaborator(appointment.collaborator_id ?? null);
      setTime(appointment.time);
    }
  }, [isOpen]);

  async function loadCustomers() {
    const c = await supabase.from("customers").select("*").order("name");
    setCustomers(c.data || []);
    setFilteredCustomers(c.data || []);
  }

  async function loadServices() {
    const s = await supabase.from("services").select("*").order("name");
    setServices(s.data || []);
  }

  async function loadStaff() {
    const s = await supabase.from("staff").select("*").eq("active", true).order("name");
    const available = [{ id: null, name: "Disponibile" }];
    setStaff(available.concat(s.data || []));
  }

  async function updateAppointment() {
    await supabase
      .from("appointments")
      .update({
        customer_id: customer,
        service_id: service,
        notes,
        collaborator_id: collaborator,
        time,
      })
      .eq("id", appointment.id);

    close();
  }

  async function deleteAppointment() {
    await supabase.from("appointments").delete().eq("id", appointment.id);
    close();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-[#1c0f0a] p-8 rounded-2xl shadow-xl w-full max-w-lg border border-[#9b6b43]/30"
      >

        <h2 className="text-2xl font-semibold text-white mb-6">
          Modifica Appuntamento
        </h2>

        {/* RICERCA CLIENTE */}
        <input
          type="text"
          placeholder="Cerca cliente (nome o cognome)"
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-3"
          onChange={(e) => {
            const q = e.target.value.toLowerCase();

            const filtered = customers.filter((c) => {
              const full = `${c.name}`.toLowerCase();
              if (full.includes(q)) return true;

              const parts = full.split(" ");
              return parts.some((p: string) => p.startsWith(q));
            });

            setFilteredCustomers(filtered);
          }}
        />

        {/* SELECT CLIENTE */}
        <select
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-4"
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
        >
          <option value="">Seleziona Cliente</option>
          {filteredCustomers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} - {c.phone}
            </option>
          ))}
        </select>

        {/* SELECT SERVIZIO */}
        <select
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-4"
          value={service}
          onChange={(e) => setService(e.target.value)}
        >
          <option value="">Seleziona Servizio</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        {/* ORARIO */}
        <select
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-4"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        >
          {generateHours("08:00", "20:00", 30).map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>

        {/* COLLABORATORE */}
        <select
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-4"
          value={collaborator ?? ""}
          onChange={(e) =>
            setCollaborator(e.target.value === "" ? null : e.target.value)
          }
        >
          {staff.map((s) => (
            <option key={s.id ?? "disp"} value={s.id ?? ""}>
              {s.name}
            </option>
          ))}
        </select>

        {/* NOTE */}
        <textarea
          placeholder="Note"
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-6 h-24"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {/* SALVA */}
        <button
          onClick={updateAppointment}
          className="w-full bg-[#d8a471] text-[#1c0f0a] p-3 rounded-xl font-semibold text-lg mb-4"
        >
          Salva Modifiche
        </button>

        {/* CANCELLA */}
        <button
          onClick={deleteAppointment}
          className="w-full bg-red-700 text-white p-3 rounded-xl font-semibold text-lg mb-6"
        >
          Elimina Appuntamento
        </button>

        <button
          onClick={close}
          className="w-full text-white/70 text-center"
        >
          Annulla
        </button>
      </motion.div>
    </div>
  );
}

/* ------------------------- */
/*       UTILITY FUNZIONI    */
/* ------------------------- */

function generateHours(start: string, end: string, step: number) {
  const res: string[] = [];
  let [h, m] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);

  while (h < endH || (h === endH && m <= endM)) {
    res.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    m += step;
    if (m >= 60) {
      m -= 60;
      h++;
    }
  }
  return res;
}
