"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { motion } from "framer-motion";

interface Props {
  isOpen: boolean;
  close: () => void;
  currentDate: string; // yyyy-mm-dd
  selectedSlot: {
    time: string; // HH:MM
    staffId: number | null;
  } | null;
  onCreated?: () => void; // ✅ refresh grid
}

export default function AgendaModal({
  isOpen,
  close,
  selectedSlot,
  currentDate,
  onCreated,
}: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [customers, setCustomers] = useState<any[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);

  const [customerId, setCustomerId] = useState<string>("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [notes, setNotes] = useState<string>("");

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    void loadCustomers();
    void loadServices();

    setCustomerId("");
    setSelectedServiceIds([]);
    setNotes("");
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  async function getCurrentSalonId(): Promise<number | null> {
    const { data } = await supabase.auth.getUser();
    const meta: any = data?.user?.user_metadata || {};
    const sid = meta?.current_salon_id ?? meta?.salon_id ?? null;
    return sid == null ? null : Number(sid);
  }

  async function loadCustomers() {
    const { data } = await supabase
      .from("customers")
      .select("id, first_name, last_name, phone")
      .order("last_name");

    const list = (data || []).map((c: any) => ({
      ...c,
      full_name: `${c.first_name} ${c.last_name}`.trim(),
    }));

    setCustomers(list);
    setFilteredCustomers(list);
  }

  async function loadServices() {
    const { data } = await supabase
      .from("services")
      .select("id, name, price, duration, vat_rate, color_code, active")
      .eq("active", true)
      .order("name");

    setServices(data || []);
  }

  const toggleService = (id: number) => {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.concat(id)
    );
  };

  async function createAppointment() {
    if (!selectedSlot) return;
    if (saving) return;

    if (!customerId) {
      alert("Seleziona un cliente.");
      return;
    }

    if (selectedServiceIds.length === 0) {
      alert("Seleziona almeno un servizio.");
      return;
    }

    setSaving(true);

    const salonId = await getCurrentSalonId();
    const startTime = `${currentDate}T${selectedSlot.time}:00`;
    const customer_id = Number(customerId);

    // 1) crea appointments
    const insertAppointment: any = {
      customer_id,
      staff_id: selectedSlot.staffId ?? null,
      start_time: startTime,
      status: "scheduled",
      notes,
    };

    if (salonId != null) insertAppointment.salon_id = salonId;

    const { data: appointment, error: appErr } = await supabase
      .from("appointments")
      .insert(insertAppointment)
      .select("*")
      .single();

    if (appErr || !appointment) {
      alert("Errore creazione appuntamento: " + (appErr?.message || "unknown"));
      setSaving(false);
      return;
    }

    // 2) crea righe appointment_services (sequenziali)
    let cursor = new Date(startTime).getTime();

    const rows = selectedServiceIds.map((sid) => {
      const s = services.find((x: any) => Number(x.id) === Number(sid));
      const dur = Math.max(30, Number(s?.duration ?? 30));
      const price = Number(s?.price ?? 0);
      const vat = Number(s?.vat_rate ?? 0.22);

      const rowStart = new Date(cursor).toISOString().replace("Z", "");
      cursor += dur * 60_000;

      return {
        appointment_id: appointment.id,
        service_id: Number(sid),
        staff_id: selectedSlot.staffId ?? null,
        start_time: rowStart,
        duration_minutes: dur,
        price,
        vat_rate: vat,
      };
    });

    const { error: rowsErr } = await supabase
      .from("appointment_services")
      .insert(rows);

    if (rowsErr) {
      // rollback: elimina appuntamento appena creato
      await supabase.from("appointments").delete().eq("id", appointment.id);
      alert("Errore inserimento servizi: " + rowsErr.message);
      setSaving(false);
      return;
    }

    // 3) aggiorna end_time dell’appuntamento
    const endTime = new Date(cursor).toISOString().replace("Z", "");
    const { error: endErr } = await supabase
      .from("appointments")
      .update({ end_time: endTime })
      .eq("id", appointment.id);

    if (endErr) {
      alert("Errore aggiornamento fine: " + endErr.message);
      setSaving(false);
      return;
    }

    onCreated?.(); // ✅ refresh grid
    close();
  }

  if (!isOpen || !selectedSlot) return null;

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

        <input
          type="text"
          placeholder="Cerca cliente (nome o cognome)"
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-3"
          onChange={(e) => {
            const q = e.target.value.toLowerCase().trim();
            const filtered = customers.filter((c: any) => {
              const full = String(c.full_name ?? "").toLowerCase();
              return full.includes(q);
            });
            setFilteredCustomers(filtered);
          }}
        />

        <select
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-4"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          disabled={saving}
        >
          <option value="">Seleziona Cliente</option>
          {filteredCustomers.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.full_name} - {c.phone}
            </option>
          ))}
        </select>

        <div className="bg-[#3a251a] p-3 rounded-xl mb-4 h-40 overflow-y-auto">
          <h3 className="text-[#d8a471] text-sm mb-2">Seleziona Servizi</h3>
          {services.map((s: any) => (
            <div
              key={s.id}
              className="flex items-center justify-between py-1 text-white"
            >
              <span>{s.name}</span>
              <button
                type="button"
                disabled={saving}
                className={`px-2 py-1 rounded-lg ${
                  selectedServiceIds.includes(Number(s.id))
                    ? "bg-[#d8a471] text-black"
                    : "bg-[#5a3b2b]"
                } ${saving ? "opacity-60 cursor-not-allowed" : ""}`}
                onClick={() => toggleService(Number(s.id))}
              >
                {selectedServiceIds.includes(Number(s.id)) ? "✓" : "+"}
              </button>
            </div>
          ))}
        </div>

        <textarea
          placeholder="Note"
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-6 h-24"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={saving}
        />

        <button
          onClick={createAppointment}
          disabled={saving}
          className={`w-full bg-[#d8a471] text-[#1c0f0a] p-3 rounded-xl font-semibold text-lg mb-4 ${
            saving ? "opacity-70 cursor-not-allowed" : ""
          }`}
        >
          {saving ? "Salvataggio..." : "Aggiungi Appuntamento"}
        </button>

        <button
          onClick={close}
          disabled={saving}
          className={`w-full text-white/70 text-center ${
            saving ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          Annulla
        </button>
      </motion.div>
    </div>
  );
}
