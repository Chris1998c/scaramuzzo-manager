"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabaseClient"; // ✅ IMPORT GIUSTO
import { motion } from "framer-motion";

interface Props {
  isOpen: boolean;
  close: () => void;
  selectedSlot: {
    time: string;
    collaborator: string | null;
  } | null;
}

export default function AgendaModal({ isOpen, close, selectedSlot }: Props) {
      const supabase = createClient(); // ✅ ORA FUNZIONA
  const [customers, setCustomers] = useState<any[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);

  const [customer, setCustomer] = useState<string>("");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (!isOpen) return;

    loadCustomers();
    loadServices();
    loadStaff();

    setSelectedServices([]);
    setNotes("");
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

  async function createAppointment() {
    if (!customer || selectedServices.length === 0 || !selectedSlot) return;

    // Calcolo durata totale
    const totalDuration = selectedServices
      .map((id) => services.find((s) => s.id === id)?.duration || 0)
      .reduce((a, b) => a + b, 0);

    await supabase.from("appointments").insert({
      customer_id: customer,
      collaborator_id: selectedSlot.collaborator,
      time: selectedSlot.time,
      duration: totalDuration,
      notes,
      services_multi: selectedServices,
      date: new Date().toISOString().split("T")[0],
    });

    close();
  }

  if (!isOpen || !selectedSlot) return null;

  const toggleService = (id: string) => {
    if (selectedServices.includes(id)) {
      setSelectedServices(selectedServices.filter((s) => s !== id));
    } else {
      setSelectedServices([...selectedServices, id]);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-[#1c0f0a] p-8 rounded-2xl shadow-xl w-full max-w-lg border border-[#9b6b43]/30"
      >

        <h2 className="text-2xl font-semibold text-white mb-6">
          Nuovo Appuntamento
        </h2>

        {/* RICERCA CLIENTE */}
        <input
          type="text"
          placeholder="Cerca cliente (nome o cognome)"
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-3"
          onChange={(e) => {
            const q = e.target.value.toLowerCase();
            const filtered = customers.filter((c) => {
              const full = c.name.toLowerCase();
              if (full.includes(q)) return true;
              const parts = full.split(" ");
              return parts.some((p: string) => p.startsWith(q));
            });
            setFilteredCustomers(filtered);
          }}
        />

        {/* SELECT CLIENTE */}
        <div className="flex gap-2 items-center mb-4">
          <select
            className="w-full p-3 bg-[#3a251a] rounded-xl text-white"
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

          {/* NUOVO CLIENTE */}
          <button
            onClick={() => alert("Apri modale nuovo cliente")}
            className="bg-[#d8a471] text-[#1c0f0a] px-4 py-3 rounded-xl font-bold"
          >
            +
          </button>
        </div>

        {/* SEZIONE SERVIZI MULTIPLI */}
        <div className="bg-[#3a251a] p-3 rounded-xl mb-4 h-40 overflow-y-auto">
          <h3 className="text-[#d8a471] text-sm mb-2">Seleziona Servizi</h3>

          {services.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between py-1 text-white"
            >
              <span>{s.name}</span>
              <button
                className={`px-2 py-1 rounded-lg ${
                  selectedServices.includes(s.id)
                    ? "bg-[#d8a471] text-black"
                    : "bg-[#5a3b2b]"
                }`}
                onClick={() => toggleService(s.id)}
              >
                {selectedServices.includes(s.id) ? "✓" : "+"}
              </button>
            </div>
          ))}
        </div>

        {/* NOTE */}
        <textarea
          placeholder="Note"
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-6 h-24"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {/* CREA */}
        <button
          onClick={createAppointment}
          className="w-full bg-[#d8a471] text-[#1c0f0a] p-3 rounded-xl font-semibold text-lg mb-4"
        >
          Aggiungi Appuntamento
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
