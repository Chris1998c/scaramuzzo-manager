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
  StickyNote,
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
    console.log("ACTIVE SALON ID:", activeSalonId);

    return;
  }
  

  /* 1️⃣ prendo servizi validi per Agenda */
  const { data: baseServices, error: baseErr } = await supabase
    .from("services")
    .select("id,name,duration,color_code,need_processing,vat_rate")
    .eq("is_active", true)
    .eq("visible_in_agenda", true)
    .order("name");

  if (baseErr) {
    console.error(baseErr);
    return;
  }

  if (!baseServices || baseServices.length === 0) {
    setServices([]);
    return;
  }

  /* 2️⃣ prendo prezzi per salone attivo */
  const serviceIds = baseServices.map((s) => s.id);

  const { data: prices, error: priceErr } = await supabase
    .from("service_prices")
    .select("service_id, price")
    .eq("salon_id", activeSalonId)
    .in("service_id", serviceIds);

  if (priceErr) {
    console.error(priceErr);
    return;
  }

  const priceMap = new Map<number, number>();
  (prices || []).forEach((p) => {
    priceMap.set(p.service_id, Number(p.price));
  });

  /* 3️⃣ merge finale */
  const merged = baseServices.map((s) => ({
    ...s,
    price: priceMap.get(s.id) ?? 0,
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
      .eq("is_active", true)

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
        className="w-full max-w-2xl rounded-[2.5rem] border border-[#5c3a21]/60 bg-[#140b07] shadow-[0_0_100px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* HEADER */}
        <div className="px-8 py-6 border-b border-[#5c3a21]/40 flex justify-between items-center bg-black/20">
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
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-[#f3d8b6] font-extrabold text-sm uppercase tracking-wider">
                <Scissors size={18} /> Servizi
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f3d8b6]/10 border border-[#f3d8b6]/20">
                <Clock3 size={14} />
                <span className="text-xs font-black uppercase">
                  {totalMinutes} min
                </span>
              </div>
            </div>

            <div className="grid gap-3">
              {services.map((s) => {
                const active = selectedServiceIds.includes(s.id);

                return (
                  <div
                    key={s.id}
                    className={`p-4 rounded-2xl border transition ${
                      active
                        ? "bg-[#f3d8b6]/5 border-[#f3d8b6]/40"
                        : "bg-white/[0.02] border-white/5"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <button
                        onClick={() => toggleService(s.id)}
                        className="flex items-center gap-4"
                      >
                        <div
                          className="w-1.5 h-10 rounded-full"
                          style={{ backgroundColor: s.color_code || "#666" }}
                        />
                        <div>
                          <p className="font-bold">
                            {s.name}
                          </p>
                          <p className="text-xs text-white/40">
                            {s.duration} min • {s.price}€
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
                          className="bg-transparent text-xs text-[#f3d8b6]"
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
                        onClick={() => toggleService(s.id)}
                        className="p-2"
                      >
                        {active ? <Check /> : <Plus />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Note */}
          <div>
            <textarea
              className="w-full bg-white/5 border border-white/10 rounded-2xl p-4"
              placeholder="Note..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* FOOTER */}
        <div className="p-6 border-t border-[#5c3a21]/40 bg-black/40 flex gap-4">
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
