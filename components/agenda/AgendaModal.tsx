"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { motion } from "framer-motion";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { X, Search, Plus, Check, StickyNote, User, Scissors, Clock3 } from "lucide-react";

interface Props {
  isOpen: boolean;
  close: () => void;
  currentDate: string; // yyyy-mm-dd
  selectedSlot: { time: string; staffId: string | null } | null; // ✅ UUID string
  onCreated?: () => void;
}

export default function AgendaModal({
  isOpen,
  close,
  selectedSlot,
  currentDate,
  onCreated,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { activeSalonId } = useActiveSalon();

  const [customers, setCustomers] = useState<any[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);

  const [qCustomer, setQCustomer] = useState("");
  const [customerId, setCustomerId] = useState<string>(""); // ✅ UUID string

  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [notes, setNotes] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    setErr("");
    setSaving(false);
    setQCustomer("");
    setCustomerId("");
    setSelectedServiceIds([]);
    setNotes("");

    void loadCustomers();
    void loadServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    const q = qCustomer.toLowerCase().trim();
    if (!q) return setFilteredCustomers(customers);

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
      .order("last_name");

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

  async function loadServices() {
    const { data, error } = await supabase
      .from("services")
      .select("id, name, price, duration, vat_rate, color_code, active")
      .eq("active", true)
      .order("name");

    if (error) {
      console.error(error);
      setServices([]);
      return;
    }

    setServices(data || []);
  }

  function toggleService(id: number) {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.concat(id)
    );
  }

  const selectedServices = useMemo(() => {
    const map = new Map<number, any>();
    (services || []).forEach((s: any) => map.set(Number(s.id), s));
    return selectedServiceIds.map((id) => map.get(Number(id))).filter(Boolean);
  }, [selectedServiceIds, services]);

  const totalMinutes = useMemo(() => {
    let tot = 0;
    for (const s of selectedServices) tot += Math.max(30, Number(s?.duration ?? 30));
    return tot;
  }, [selectedServices]);

  async function createAppointment() {
    if (!selectedSlot) return;
    if (saving) return;
    setErr("");

    if (activeSalonId == null) return setErr("Salone non selezionato.");
    if (!customerId) return setErr("Seleziona un cliente valido.");
    if (selectedServiceIds.length === 0) return setErr("Seleziona almeno un servizio.");

    setSaving(true);

    const salonId = Number(activeSalonId);
    const startTime = `${currentDate}T${selectedSlot.time}:00`;

    // ✅ UUID: customer_id e staff_id sono stringhe
    const insertAppointment: any = {
      salon_id: salonId,
      customer_id: customerId,
      staff_id: selectedSlot.staffId ?? null,
      start_time: startTime,
      status: "scheduled",
      notes: notes?.trim() || null,
    };

    const { data: appointment, error: appErr } = await supabase
      .from("appointments")
      .insert(insertAppointment)
      .select("*")
      .single();

    if (appErr || !appointment) {
      setErr("Errore creazione appuntamento: " + (appErr?.message || "unknown"));
      setSaving(false);
      return;
    }

    // 2) appointment_services (sequenziali)
    let cursor = new Date(startTime).getTime();

    const rows = selectedServiceIds.map((sid) => {
      const s = services.find((x: any) => Number(x.id) === Number(sid));
      const dur = Math.max(30, Number(s?.duration ?? 30));
      const price = Number(s?.price ?? 0);

      const rawVat = Number(s?.vat_rate ?? 0);
      const vat = rawVat > 1 ? rawVat / 100 : rawVat;

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

    const { error: rowsErr } = await supabase.from("appointment_services").insert(rows);

    if (rowsErr) {
      await supabase.from("appointments").delete().eq("id", appointment.id);
      setErr("Errore inserimento servizi: " + rowsErr.message);
      setSaving(false);
      return;
    }

    // 3) end_time
    const endTime = new Date(cursor).toISOString().replace("Z", "");
    const { error: endErr } = await supabase
      .from("appointments")
      .update({ end_time: endTime })
      .eq("id", appointment.id);

    if (endErr) {
      setErr("Errore aggiornamento fine: " + endErr.message);
      setSaving(false);
      return;
    }

    onCreated?.();
    setSaving(false);
    close();
  }

  if (!isOpen || !selectedSlot) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-2xl rounded-3xl border border-[#5c3a21]/60 bg-[#140b07]/85
                   shadow-[0_30px_90px_rgba(0,0,0,0.55)] overflow-hidden"
      >
        {/* HEADER */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#5c3a21]/50">
          <div className="min-w-0">
            <div className="text-xs text-[#f3d8b6]/70 tracking-wide">Nuovo appuntamento</div>
            <h2 className="text-2xl font-extrabold text-[#f3d8b6] tracking-tight mt-1">
              {currentDate} · {selectedSlot.time}
            </h2>
          </div>

          <button
            onClick={close}
            disabled={saving}
            className="rounded-2xl p-2 bg-black/25 border border-white/10 text-white/70
                       hover:bg-black/35 transition disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* BODY */}
        <div className="p-6 space-y-6">
          {/* CUSTOMER */}
          <div className="rounded-3xl border border-[#5c3a21]/50 bg-black/15 p-5">
            <div className="flex items-center gap-2 text-sm font-extrabold text-[#f3d8b6]">
              <span className="rounded-xl p-2 bg-black/20 border border-[#5c3a21]/60">
                <User size={16} />
              </span>
              Cliente
            </div>

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="relative">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  value={qCustomer}
                  onChange={(e) => setQCustomer(e.target.value)}
                  placeholder="Cerca per nome o telefono…"
                  disabled={saving}
                  className="w-full rounded-2xl bg-[#1c0f0a] border border-[#5c3a21]/60
                             pl-11 pr-4 py-3 text-sm text-white placeholder:text-white/40
                             focus:outline-none focus:ring-2 focus:ring-[#f3d8b6]/25"
                />
              </div>

              <div className="rounded-2xl bg-[#1c0f0a] border border-[#5c3a21]/60 overflow-hidden">
                <div className="max-h-44 overflow-auto">
                  {filteredCustomers.slice(0, 80).map((c: any) => {
                    const active = customerId === String(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCustomerId(String(c.id))}
                        disabled={saving}
                        className={[
                          "w-full px-4 py-3 text-left text-sm transition flex items-center justify-between gap-3",
                          active ? "bg-white/10" : "hover:bg-white/5",
                        ].join(" ")}
                      >
                        <span className="min-w-0">
                          <span className="text-white font-semibold truncate block">{c.full_name}</span>
                          <span className="text-white/45 text-xs truncate block">{c.phone ?? "—"}</span>
                        </span>

                        {active ? (
                          <span className="inline-flex items-center gap-1 rounded-xl px-2 py-1 text-[11px]
                                           bg-[#f3d8b6] text-[#1A0F0A] font-extrabold">
                            <Check size={14} />
                            OK
                          </span>
                        ) : null}
                      </button>
                    );
                  })}

                  {filteredCustomers.length === 0 && (
                    <div className="px-4 py-6 text-sm text-white/50">Nessun cliente trovato.</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* SERVICES */}
          <div className="rounded-3xl border border-[#5c3a21]/50 bg-black/15 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-extrabold text-[#f3d8b6]">
                <span className="rounded-xl p-2 bg-black/20 border border-[#5c3a21]/60">
                  <Scissors size={16} />
                </span>
                Servizi
              </div>

              <div className="inline-flex items-center gap-2 text-xs text-[#c9b299]">
                <Clock3 size={14} className="text-[#f3d8b6]/70" />
                Totale: <span className="text-[#f3d8b6] font-extrabold">{totalMinutes} min</span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {services.map((s: any) => {
                const id = Number(s.id);
                const active = selectedServiceIds.includes(id);
                const color = String(s.color_code || "#a8754f");

                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleService(id)}
                    disabled={saving}
                    className={[
                      "inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition",
                      "border shadow-[0_10px_30px_rgba(0,0,0,0.20)]",
                      active
                        ? "bg-white/10 border-white/15 text-white"
                        : "bg-black/20 border-[#5c3a21]/60 text-[#f3d8b6] hover:bg-white/5",
                    ].join(" ")}
                  >
                    <span className="h-2.5 w-2.5 rounded-full border border-black/30" style={{ backgroundColor: color }} />
                    <span className="truncate max-w-[220px]">{s.name}</span>
                    <span className="text-xs text-white/50">{Math.max(30, Number(s.duration ?? 30))}m</span>
                    <span
                      className={[
                        "ml-1 inline-flex items-center justify-center rounded-xl w-6 h-6",
                        active ? "bg-[#f3d8b6] text-[#1A0F0A]" : "bg-black/25 text-white/70",
                      ].join(" ")}
                    >
                      {active ? <Check size={14} /> : <Plus size={14} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* NOTES */}
          <div className="rounded-3xl border border-[#5c3a21]/50 bg-black/15 p-5">
            <div className="flex items-center gap-2 text-sm font-extrabold text-[#f3d8b6]">
              <span className="rounded-xl p-2 bg-black/20 border border-[#5c3a21]/60">
                <StickyNote size={16} />
              </span>
              Note
            </div>

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={saving}
              placeholder="Es: cliente in ritardo, preferenze, posa, allergie…"
              className="mt-4 w-full rounded-2xl bg-[#1c0f0a] border border-[#5c3a21]/60
                         p-4 text-sm text-white placeholder:text-white/40
                         focus:outline-none focus:ring-2 focus:ring-[#f3d8b6]/25
                         min-h-[110px]"
            />
          </div>

          {err && (
            <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {err}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="p-6 pt-0 flex flex-col sm:flex-row gap-3">
          <button
            onClick={createAppointment}
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3
                       bg-[#f3d8b6] text-[#1A0F0A] font-extrabold
                       shadow-[0_12px_40px_rgba(243,216,182,0.18)]
                       hover:brightness-110 transition disabled:opacity-60"
          >
            {saving ? "Salvataggio…" : "Crea appuntamento"}
          </button>

          <button
            onClick={close}
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3
                       bg-black/20 border border-[#5c3a21]/60 text-[#f3d8b6]
                       hover:bg-white/5 transition disabled:opacity-60"
          >
            Annulla
          </button>
        </div>
      </motion.div>
    </div>
  );
}
