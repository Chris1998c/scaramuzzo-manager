"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { fetchActiveStaffForSalon } from "@/lib/staffForSalon";
import { fetchOperationalCalendarSnapshot } from "@/lib/salonOperationalCalendar";
import {
  canSubmitNewBookingOnOperationalDay,
  filterStaffForOperationalAgendaModal,
  hasAssignedStaffUnavailableWarning,
  staffSelectLabelForOperationalDate,
  STAFF_UNAVAILABLE_UI_MESSAGE,
} from "@/lib/agenda/operationalAgendaUi";
import { fetchStaffScheduleForSalon } from "@/lib/staffSchedule";
import OperationalDayBanner from "@/components/agenda/OperationalDayBanner";
import { motion } from "framer-motion";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import {
  normalizeStaffId,
  snapToAgendaSlot,
  toNoZ,
} from "@/lib/agenda/agendaContract";
import {
  X,
  Search,
  Plus,
  Check,
  User,
  Scissors,
  Clock3,
} from "lucide-react";
import { agendaGridDayStartLabel, generateHours, SLOT_MINUTES } from "./utils";
import {
  buildSequentialServiceTimeline,
  filterServicesByQuery,
  numOr,
  resolveGridStartTime,
  toStrOrNull,
  totalTimelineMinutes,
} from "@/lib/agenda/appointmentModalForm";
import { useModalFieldTouches } from "@/lib/agenda/appointmentModalSession";
import { fetchAgendaServices } from "@/lib/servicesCatalog";
import CustomerSearchField from "@/components/customers/CustomerSearchField";

interface Props {
  isOpen: boolean;
  close: () => void;
  currentDate: string; // yyyy-mm-dd
  selectedSlot: { time: string; staffId: string | null } | null;
  onCreated?: () => void;
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

  const [services, setServices] = useState<any[]>([]);
  const [staffListAll, setStaffListAll] = useState<{ id: number; name: string }[]>([]);
  const [staffScheduleMap, setStaffScheduleMap] = useState<
    import("@/lib/staffSchedule").StaffScheduleBySalon
  >(() => new Map());
  const [operationalSnapshot, setOperationalSnapshot] = useState<
    import("@/lib/salonOperationalCalendar").OperationalCalendarSnapshot
  >(() => ({ salonDay: null, staffOverrides: new Map() }));

  /* ================= FORM ================= */

  const [customerId, setCustomerId] = useState<string>("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [serviceAssignments, setServiceAssignments] = useState<
    Record<number, string | null>
  >({});
  const [qService, setQService] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  /** Source of truth submit/UI: orario inizio (non usare selectedSlot.time dopo init). */
  const [selectedStartTime, setSelectedStartTime] = useState<string>("");
  const openedSlotKeyRef = useRef<string | null>(null);
  const initialSlotStaffIdRef = useRef<string | null>(null);
  const { touchedRef, resetTouches, markStartTimeTouched } = useModalFieldTouches();

  const agendaHours = useMemo(
    () =>
      generateHours(
        agendaGridDayStartLabel(Number(activeSalonId) || 0),
        "20:30",
        SLOT_MINUTES
      ),
    [activeSalonId]
  );

  /* ================= INIT ================= */

useEffect(() => {
  if (!isOpen || !activeSalonId) return;

  setErr("");
  setSaving(false);
  setCustomerId("");
  setSelectedServiceIds([]);
  setServiceAssignments({});
  setNotes("");
  setQService("");

  void Promise.all([loadServices(), loadStaff()]);
}, [isOpen, activeSalonId, currentDate]);

  useEffect(() => {
    if (!isOpen) {
      openedSlotKeyRef.current = null;
      initialSlotStaffIdRef.current = null;
      return;
    }
    if (!selectedSlot) return;

    const slotKey = `${selectedSlot.time}|${selectedSlot.staffId ?? ""}`;
    if (openedSlotKeyRef.current === slotKey) return;

    openedSlotKeyRef.current = slotKey;
    initialSlotStaffIdRef.current = selectedSlot.staffId;
    resetTouches();
    setSelectedStartTime(resolveGridStartTime(selectedSlot.time, agendaHours));
  }, [isOpen, selectedSlot?.time, selectedSlot?.staffId, agendaHours, resetTouches]);

  useEffect(() => {
    if (!isOpen || !selectedSlot || agendaHours.length === 0) return;
    if (touchedRef.current.startTime) return;
    setSelectedStartTime((prev) => {
      if (prev && agendaHours.includes(prev)) return prev;
      return resolveGridStartTime(selectedSlot.time, agendaHours);
    });
  }, [agendaHours.length, isOpen, selectedSlot?.time, touchedRef]);


  /* ================= LOADERS ================= */

  async function loadServices() {
    if (!activeSalonId) {
      setServices([]);
      return;
    }
    try {
      const rows = await fetchAgendaServices(supabase, Number(activeSalonId));
      setServices(rows);
    } catch (e) {
      console.error("AgendaModal loadServices:", e);
      setServices([]);
    }
  }


  async function loadStaff() {
    if (!activeSalonId) {
      setStaffListAll([]);
      setStaffScheduleMap(new Map());
      return;
    }

    try {
      const salonId = Number(activeSalonId);
      const [rows, scheduleMap, opSnap] = await Promise.all([
        fetchActiveStaffForSalon(supabase, salonId, "id, name"),
        fetchStaffScheduleForSalon(supabase, salonId),
        fetchOperationalCalendarSnapshot(supabase, salonId, currentDate),
      ]);
      setStaffListAll(
        (rows as { id: number; name: string }[]).map((r) => ({
          id: Number(r.id),
          name: String(r.name ?? ""),
        })),
      );
      setStaffScheduleMap(scheduleMap);
      setOperationalSnapshot(opSnap);
    } catch (error) {
      console.error(error);
      setStaffListAll([]);
      setStaffScheduleMap(new Map());
      setOperationalSnapshot({ salonDay: null, staffOverrides: new Map() });
    }
  }

  const staffIncludeIds = useMemo(() => {
    const ids = new Set<string>();
    if (selectedSlot?.staffId) ids.add(selectedSlot.staffId);
    for (const v of Object.values(serviceAssignments)) {
      if (v) ids.add(v);
    }
    return ids;
  }, [selectedSlot?.staffId, serviceAssignments]);

  const salonClosed = !canSubmitNewBookingOnOperationalDay(operationalSnapshot.salonDay);

  const staffListForDay = useMemo(
    () =>
      filterStaffForOperationalAgendaModal(
        staffListAll,
        staffScheduleMap,
        currentDate,
        operationalSnapshot,
        staffIncludeIds,
      ),
    [staffListAll, staffScheduleMap, currentDate, operationalSnapshot, staffIncludeIds],
  );

  const showUnavailableAssignmentWarning = useMemo(
    () => hasAssignedStaffUnavailableWarning(staffIncludeIds, operationalSnapshot),
    [staffIncludeIds, operationalSnapshot],
  );

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
          [id]: initialSlotStaffIdRef.current,
        }));
        return [...prev, id];
      }
    });
  }

  /* ================= TIMELINE ================= */

  const serviceTimeline = useMemo(
    () =>
      buildSequentialServiceTimeline({
        currentDate,
        startTime: selectedStartTime,
        serviceIds: selectedServiceIds,
        services,
        slotMinutes: SLOT_MINUTES,
      }),
    [selectedServiceIds, services, currentDate, selectedStartTime],
  );

  const totalMinutes = useMemo(
    () => totalTimelineMinutes(serviceTimeline),
    [serviceTimeline],
  );

  const filteredServicesForUi = useMemo(
    () => filterServicesByQuery(services, qService),
    [qService, services],
  );

  /* ================= SAVE ================= */

  async function createAppointment() {
    if (!selectedSlot || saving) return;
    if (salonClosed) return;

    if (!activeSalonId) return setErr("Salone non configurato.");
    if (!customerId) return setErr("Seleziona un cliente.");
    if (!selectedStartTime) return setErr("Seleziona un orario.");
    if (!selectedServiceIds.length)
      return setErr("Seleziona almeno un servizio.");

    setSaving(true);
    setErr("");

    try {
      const startDt = snapToAgendaSlot(
        new Date(`${currentDate}T${selectedStartTime}:00`),
      );
      const payload = {
        salon_id: Number(activeSalonId),
        customer_id: customerId,
        start_time: toNoZ(startDt),
        notes: notes.trim() || null,
        services: selectedServiceIds.map((sid) => {
          const s = services.find((x) => x.id === sid);
          if (!s) throw new Error(`Servizio non disponibile nel catalogo agenda (id ${sid}).`);
          return {
            service_id: sid,
            staff_id: normalizeStaffId(serviceAssignments[sid]),
            duration_minutes: Math.max(SLOT_MINUTES, Number(s.duration ?? SLOT_MINUTES)),
            price: numOr(s.price, 0),
            vat_rate: numOr(s.vat_rate, 22),
          };
        }),
      };

      const res = await fetch("/api/agenda/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; details?: string };
      if (!res.ok) {
        throw new Error(json.error || json.details || "Errore durante la creazione appuntamento.");
      }

      onCreated?.();
      close();
    } catch (e: unknown) {
      console.error("AgendaModal createAppointment failed:", e);
      setErr(e instanceof Error ? e.message : "Errore durante il salvataggio.");
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen || !selectedSlot || !selectedStartTime) return null;

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
              {selectedStartTime}
            </h2>
            <label className="mt-3 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">
              Orario inizio (slot griglia)
              <select
                value={selectedStartTime}
                disabled={saving}
                onChange={(e) => {
                  markStartTimeTouched();
                  setSelectedStartTime(e.target.value);
                }}
                className="mt-1.5 w-full max-w-[11rem] rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[#f3d8b6]/40 focus:ring-1 focus:ring-[#f3d8b6]/25"
              >
                {agendaHours.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
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
          <OperationalDayBanner salonDay={operationalSnapshot.salonDay} />

          {/* Cliente */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[#f3d8b6] font-extrabold text-sm uppercase tracking-wider">
              <User size={18} /> Cliente
            </div>

            <CustomerSearchField
              supabase={supabase}
              enabled={isOpen && !!activeSalonId}
              preloadSalonId={activeSalonId}
              selectedCustomerId={customerId}
              onSelectCustomerId={setCustomerId}
              disabled={saving}
              dropdownZIndexClass="z-[140]"
            />
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
                        className="w-1.5 h-10 rounded-full shrink-0 opacity-90"
                        style={{
                          backgroundColor:
                            String(s.color_code ?? "#a8754f").trim() || "#a8754f",
                        }}
                      />
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-white truncate">
                          {s.name}
                        </p>
                        <p className="text-[11px] text-white/50">{s.duration} min</p>
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
                        {staffListForDay.map((st) => (
                          <option key={st.id} value={st.id}>
                            {staffSelectLabelForOperationalDate(
                              st.name,
                              st.id,
                              staffScheduleMap,
                              currentDate,
                              operationalSnapshot,
                            )}
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

              {staffListForDay.length === 0 && (
                <p className="text-[11px] text-amber-200/80">
                  Nessun collaboratore disponibile in questo giorno
                </p>
              )}
              {showUnavailableAssignmentWarning && (
                <p className="text-[11px] text-amber-200/85">
                  {STAFF_UNAVAILABLE_UI_MESSAGE}
                </p>
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
            disabled={saving || salonClosed}
            onClick={createAppointment}
            className="flex-1 bg-[#f3d8b6] text-black font-black py-4 rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Salvataggio..." : salonClosed ? "Giorno chiuso" : "Conferma"}
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
