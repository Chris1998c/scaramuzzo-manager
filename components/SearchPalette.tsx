"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabaseClient"; // ✅ IMPORT GIUSTO
import { motion } from "framer-motion";

interface Props {
  onSelectAppointment?: (a: any) => void;
  onSelectCustomer?: (c: any) => void;
}

export default function SearchPalette({
  onSelectAppointment,
  onSelectCustomer,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
    const supabase = createClient(); // ✅ ORA FUNZIONA
  const [results, setResults] = useState<any[]>([]);
  const [index, setIndex] = useState(0);

  /* LISTE */
  const [customers, setCustomers] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);

  /* SHORTCUT */
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }

      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  /* CARICA DATI */
  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const c = await supabase.from("customers").select("*");
    setCustomers(c.data || []);

    const a = await supabase
      .from("appointments")
      .select("*, customers(*), services(*)");
    setAppointments(a.data || []);

    const s = await supabase.from("services").select("*");
    setServices(s.data || []);

    const st = await supabase.from("staff").select("*");
    setStaff(st.data || []);
  }

  /* RICERCA */
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const q = query.toLowerCase();

    const foundCustomers = customers
      .filter((c) => c.name.toLowerCase().includes(q))
      .map((c) => ({ type: "customer", ...c }));

    const foundAppointments = appointments
      .filter((a) =>
        `${a.customers?.name} ${a.services?.name}`
          .toLowerCase()
          .includes(q)
      )
      .map((a) => ({ type: "appointment", ...a }));

    const foundServices = services
      .filter((s) => s.name.toLowerCase().includes(q))
      .map((s) => ({ type: "service", ...s }));

    const foundStaff = staff
      .filter((s) => s.name.toLowerCase().includes(q))
      .map((s) => ({ type: "staff", ...s }));

    setResults([
      ...foundCustomers,
      ...foundAppointments,
      ...foundServices,
      ...foundStaff,
    ]);

    setIndex(0);
  }, [query]);

  /* ENTER ACTION */
  function handleSelect(item: any) {
    if (item.type === "appointment" && onSelectAppointment) {
      onSelectAppointment(item);
    }
    if (item.type === "customer" && onSelectCustomer) {
      onSelectCustomer(item);
    }
    setOpen(false);
  }

  /* NAVIGATION */
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => (i + 1 < results.length ? i + 1 : i));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => (i - 1 >= 0 ? i - 1 : i));
    }
    if (e.key === "Enter" && results[index]) {
      handleSelect(results[index]);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-start justify-center pt-[10vh]">

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl bg-[#1c0f0a] 
        border border-[#9b6b43]/40 rounded-2xl shadow-xl overflow-hidden"
      >
        {/* INPUT */}
        <div className="p-4 border-b border-[#3a251a]">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Cerca clienti, appuntamenti, servizi..."
            className="w-full bg-[#3a251a] p-4 text-white text-lg rounded-xl outline-none"
          />
        </div>

        {/* RISULTATI */}
        <div className="max-h-[60vh] overflow-y-auto">
          {results.length === 0 && (
            <div className="text-center text-white/50 py-6">
              Nessun risultato
            </div>
          )}

          {results.map((item, i) => (
            <div
              key={item.id}
              onClick={() => handleSelect(item)}
              className={`p-4 cursor-pointer border-b border-[#3a251a] ${
                i === index ? "bg-[#d8a471] text-black" : "text-white"
              }`}
            >
              <div className="font-semibold">
                {item.type === "customer" && `👤 Cliente: ${item.name}`}
                {item.type === "appointment" &&
                  `📅 Appuntamento: ${item.customers?.name} — ${item.services?.name}`}
                {item.type === "service" && `✂️ Servizio: ${item.name}`}
                {item.type === "staff" && `🧑‍💼 Collaboratore: ${item.name}`}
              </div>

              {item.type === "appointment" && (
                <div className="text-sm opacity-70">
                  {item.time} — {item.date}
                </div>
              )}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
