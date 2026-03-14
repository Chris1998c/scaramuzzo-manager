"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { motion } from "framer-motion";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import {
  X,
  Search,
  Plus,
  Check,
  User,
  Scissors,
  Clock3,
} from "lucide-react";

interface Props {
  isOpen: boolean;
  close: () => void;
  currentDate: string; // yyyy-mm-dd
  selectedSlot: { time: string; staffId: string | null } | null;
  onCreated?: () => void;
}

/* ================= HELPERS ================= */

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

/* ================= COMPONENT ================= */

export default function AgendaModal({
  isOpen,
  close,
  selectedSlot,
  currentDate,
  onCreated,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { activeSalonId } = useActiveSalon();

  /* ================= DATA ================= */

  const [customers, setCustomers] = useState<any[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);

  /* ================= FORM ================= */

  const [qCustomer, setQCustomer] = useState("");
  const [customerId, setCustomerId] = useState<string>("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [serviceAssignments, setServiceAssignments] = useState<
    Record<number, string | null>
  >({});
  const [qService, setQService] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  /* ================= INIT ================= */

useEffect(() => {
  if (!isOpen || !activeSalonId) return;

  setErr("");
  setSaving(false);
  setQCustomer("");
  setCustomerId("");
  setSelectedServiceIds([]);
  setServiceAssignments({});
  setNotes("");
  setQService("");

  void Promise.all([loadCustomers(), loadServices(), loadStaff()]);
}, [isOpen, activeSalonId]);


  /* ================= FILTER CLIENT ================= */

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

  /* ================= LOADERS ================= */

  async function loadCustomers() {
    const { data, error } = await supabase
      .from("customers")
      .select("id, first_name, last_name, phone")
      .order("last_name");

    if (error) {
      console.error(error);
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
  if (!activeSalonId) {
    setServices([]);
    return;
  }

  // 1) servizi validi per Agenda
  const { data: baseServices, error: baseErr } = await supabase
    .from("services")
    .select("id,name,duration,color_code,need_processing,vat_rate")
    .eq("active", true)
    .eq("visible_in_agenda", true)
    .order("name");

  if (baseErr) {
    console.error("loadServices baseErr:", baseErr);
    return;
  }

  if (!baseServices || baseServices.length === 0) {
    setServices([]);
    return;
  }

  // 2) prezzi per salone attivo
  const serviceIds = baseServices
    .map((s: any) => Number(s.id))
    .filter((x: number) => Number.isFinite(x) && x > 0);

  const { data: prices, error: priceErr } = await supabase
    .from("service_prices")
    .select("service_id, price")
    .eq("salon_id", Number(activeSalonId))
    .in("service_id", serviceIds);

  if (priceErr) {
    console.error("loadServices priceErr:", priceErr);
    return;
  }

  // ✅ chiavi SEMPRE stringa per evitare mismatch "75" vs 75
  const priceMap = new Map<string, number>();
  (prices || []).forEach((p: any) => {
    priceMap.set(String(p.service_id), Number(p.price) || 0);
  });

  // 3) merge finale
  const merged = baseServices.map((s: any) => ({
    ...s,
    price: priceMap.get(String(s.id)) ?? 0,
  }));

  setServices(merged);
}


  async function loadStaff() {
    if (!activeSalonId) {
      setStaffList([]);
      return;
    }

    const { data, error } = await supabase
      .from("staff")
      .select("id, name")
      .eq("salon_id", activeSalonId)
      .eq("active", true)

      .order("name");

    if (error) {
      console.error(error);
      return;
    }

    setStaffList(data || []);
  }

  /* ================= SERVICE LOGIC ================= */

  function toggleService(id: number) {
    setSelectedServiceIds((prev) => {
      if (prev.includes(id)) {
        const copy = { ...serviceAssignments };
        delete copy[id];
        setServiceAssignments(copy);
        return prev.filter((x) => x !== id);
      } else {
        setServiceAssignments((p) => ({
          ...p,
          [id]: selectedSlot?.staffId ?? null,
        }));
        return [...prev, id];
      }
    });
  }

  /* ================= TIMELINE ================= */

  const serviceTimeline = useMemo(() => {
    if (!selectedSlot) return [];

    let cursor = new Date(`${currentDate}T${selectedSlot.time}:00`);

    return selectedServiceIds.map((sid) => {
      const s = services.find((x) => x.id === sid);
      const duration = Math.max(15, Number(s?.duration ?? 15));

      const item = {
        id: sid,
        name: s?.name,
        duration,
        startDate: new Date(cursor),
        startTime: cursor.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      cursor = new Date(cursor.getTime() + duration * 60000);
      return item;
    });
  }, [selectedServiceIds, services, currentDate, selectedSlot]);

  const totalMinutes = useMemo(
    () => serviceTimeline.reduce((acc, s) => acc + s.duration, 0),
    [serviceTimeline]
  );

  const filteredServicesForUi = useMemo(() => {
    const q = qService.toLowerCase().trim();
    if (!q) return services;
    return services.filter((s: any) =>
      String(s.name ?? "")
        .toLowerCase()
        .includes(q)
    );
  }, [qService, services]);

  /* ================= SAVE ================= */

  async function createAppointment() {
    if (!selectedSlot || saving) return;

    if (!activeSalonId) return setErr("Salone non configurato.");
    if (!customerId) return setErr("Seleziona un cliente.");
    if (!selectedServiceIds.length)
      return setErr("Seleziona almeno un servizio.");

    setSaving(true);
    setErr("");

    try {
      const startDt = new Date(
        `${currentDate}T${selectedSlot.time}:00`
      );

      const endDt = new Date(
        startDt.getTime() + Math.max(15, totalMinutes) * 60000
      );

      /* 1️⃣ APPOINTMENT */
      const { data: appData, error: appErr } = await supabase
        .from("appointments")
        .insert({
          salon_id: activeSalonId,
          customer_id: customerId,
          staff_id: toStrOrNull(selectedSlot.staffId),
          start_time: toNoZ(startDt),
          end_time: toNoZ(endDt),
          status: "scheduled",
          notes: notes.trim() || null,
        })
        .select("id")
        .single();

      if (appErr) throw appErr;

      const appointmentId = appData.id;

      /* 2️⃣ SERVICES LINES */
      let cursorMs = startDt.getTime();

      for (const sid of selectedServiceIds) {
        const s = services.find((x) => x.id === sid);
        const duration = Math.max(15, Number(s?.duration ?? 15));

        const payload = {
          appointment_id: appointmentId,
          service_id: sid,
          staff_id: toStrOrNull(serviceAssignments[sid]),
          start_time: toNoZ(new Date(cursorMs)),
          duration_minutes: duration,
          price: Number(s?.price ?? 0),
          vat_rate: Number.isFinite(Number(s?.vat_rate))
            ? Number(s?.vat_rate)
            : 22,
        };

        const { error: lineErr } = await supabase
          .from("appointment_services")
          .insert(payload);

        if (lineErr) throw lineErr;

        cursorMs += duration * 60000;
      }

      onCreated?.();
      close();
    } catch (e: any) {
      console.error(e);
      setErr("Errore durante il salvataggio.");
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen || !selectedSlot) return null;

  /* ================= UI ================= */

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 text-white">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-2xl rounded-[2.5rem] border border-white/10 bg-scz-dark shadow-[0_4px_24px_-4px_rgba(0,0,0,0.4)] overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* HEADER */}
        <div className="px-8 py-6 border-b border-white/10 flex justify-between items-center bg-black/20">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#f3d8b6]/50 font-black">
              Planning Agenda
            </p>
            <h2 className="text-2xl font-black text-[#f3d8b6] mt-0.5">
              {currentDate}
              <span className="text-white/20 mx-2 font-light">/</span>
              {selectedSlot.time}
            </h2>
          </div>
          <button
            onClick={close}
            className="p-3 hover:bg-white/5 rounded-2xl transition-colors border border-white/5"
          >
            <X size={22} className="text-[#f3d8b6]" />
          </button>
        </div>

        {/* CONTENUTO */}
        <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar">
          {/* Cliente */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[#f3d8b6] font-extrabold text-sm uppercase tracking-wider">
              <User size={18} /> Cliente
            </div>

            <div className="relative">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20"
                size={18}
              />
              <input
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-[#f3d8b6]/50 transition-all"
                placeholder="Cerca cliente..."
                value={qCustomer}
                onChange={(e) => setQCustomer(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto">
              {filteredCustomers.slice(0, 20).map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCustomerId(c.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition ${
                    customerId === c.id
                      ? "bg-[#f3d8b6] text-black"
                      : "bg-white/5 text-white/70"
                  }`}
                >
                  {c.full_name}
                </button>
              ))}
            </div>
          </div>

          {/* Servizi */}
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[#f3d8b6] font-extrabold text-sm uppercase tracking-wider">
                <Scissors size={18} /> Servizi
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-scz-dark border border-white/10">
                <Clock3 size={14} className="text-[#f3d8b6]" />
                <span className="text-xs font-black uppercase tracking-wider text-white/80">
                  {totalMinutes} min
                </span>
              </div>
            </div>

            {/* Ricerca servizio */}
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
                size={16}
              />
              <input
                value={qService}
                onChange={(e) => setQService(e.target.value)}
                placeholder="Cerca servizio per nome..."
                className="w-full rounded-2xl bg-black/40 border border-white/10 pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-white/35 outline-none focus:border-[#f3d8b6]/40 focus:ring-1 focus:ring-[#f3d8b6]/30"
              />
            </div>

            {/* Servizi selezionati */}
            {selectedServiceIds.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
                  Servizi selezionati
                </div>
                <div className="flex flex-wrap gap-2">
                  {serviceTimeline.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleService(item.id)}
                      className="group inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[11px] text-white/80 hover:bg-white/10 transition-colors"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[#f3d8b6]" />
                      <span className="font-bold truncate max-w-[120px]">
                        {item.name}
                      </span>
                      <span className="text-white/40 font-mono text-[10px]">
                        {item.startTime} · {item.duration}m
                      </span>
                      <span className="text-white/40 group-hover:text-red-300 text-xs">
                        ×
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Lista servizi filtrata */}
            <div className="grid gap-2 max-h-80 overflow-y-auto custom-scrollbar">
              {filteredServicesForUi.map((s) => {
                const active = selectedServiceIds.includes(s.id);

                return (
                  <div
                    key={s.id}
                    className={`rounded-2xl border px-4 py-3 md:px-5 md:py-3.5 flex items-center gap-4 transition-colors ${
                      active
                        ? "bg-scz-dark border-[#f3d8b6]/40"
                        : "bg-black/30 border-white/10 hover:border-white/30"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleService(s.id)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <div
                        className="w-1.5 h-10 rounded-full"
                        style={{ backgroundColor: s.color_code || "#666" }}
                      />
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-white truncate">
                          {s.name}
                        </p>
                        <p className="text-[11px] text-white/50">
                          {s.duration} min · {s.price}€
                        </p>
                      </div>
                    </button>

                    {active && (
                      <select
                        value={serviceAssignments[s.id] || ""}
                        onChange={(e) =>
                          setServiceAssignments((p) => ({
                            ...p,
                            [s.id]: toStrOrNull(e.target.value),
                          }))
                        }
                        className="bg-black/40 border border-white/15 rounded-xl px-2 py-1 text-[11px] text-[#f3d8b6] max-w-[130px] outline-none focus:border-[#f3d8b6]/50"
                      >
                        <option value="">Auto</option>
                        {staffList.map((st) => (
                          <option key={st.id} value={st.id}>
                            {st.name}
                          </option>
                        ))}
                      </select>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleService(s.id)}
                      className={`ml-1 rounded-xl border px-2.5 py-2 text-xs flex items-center justify-center ${
                        active
                          ? "bg-[#f3d8b6] border-[#f3d8b6] text-black"
                          : "bg-black/40 border-white/15 text-white/70 hover:bg-white/10"
                      }`}
                    >
                      {active ? <Check size={14} /> : <Plus size={14} />}
                    </button>
                  </div>
                );
              })}

              {filteredServicesForUi.length === 0 && (
                <div className="text-xs text-white/40 py-4 text-center border border-dashed border-white/20 rounded-2xl">
                  Nessun servizio trovato per questa ricerca.
                </div>
              )}
            </div>
          </div>

          {/* Note */}
          <div>
            <textarea
              className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white placeholder:text-white/35 outline-none focus:border-[#f3d8b6]/40 focus:ring-1 focus:ring-[#f3d8b6]/30"
              placeholder="Note..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* FOOTER */}
        <div className="p-6 border-t border-white/10 bg-black/20 flex gap-4">
          <button
            disabled={saving}
            onClick={createAppointment}
            className="flex-1 bg-[#f3d8b6] text-black font-black py-4 rounded-2xl"
          >
            {saving ? "Salvataggio..." : "Conferma"}
          </button>

          <button
            disabled={saving}
            onClick={close}
            className="px-6 py-4 bg-white/5 rounded-2xl"
          >
            Annulla
          </button>
        </div>

        {err && (
          <div className="bg-red-500 text-white text-xs font-black text-center py-3 uppercase">
            {err}
          </div>
        )}
      </motion.div>
    </div>
  );
}
