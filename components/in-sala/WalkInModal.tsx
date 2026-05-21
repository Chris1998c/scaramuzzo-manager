"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { fetchActiveStaffForSalon } from "@/lib/staffForSalon";
import { nowRomeLocalDate } from "@/lib/agenda/agendaContract";
import {
  fetchStaffScheduleForSalon,
  filterStaffForAgendaDay,
  isoDateFromLocalDate,
  isStaffOffScheduleForAgendaDay,
} from "@/lib/staffSchedule";
import { fetchAgendaServices } from "@/lib/servicesCatalog";
import { SLOT_MINUTES } from "@/components/agenda/utils";
import { Search, X } from "lucide-react";

type Props = {
  isOpen: boolean;
  close: () => void;
  onCreated: (appointmentId: number) => void;
};

export default function WalkInModal({ isOpen, close, onCreated }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { activeSalonId } = useActiveSalon();

  const [customers, setCustomers] = useState<
    { id: string; full_name: string; phone: string | null }[]
  >([]);
  const [filteredCustomers, setFilteredCustomers] = useState<typeof customers>([]);
  const [services, setServices] = useState<
    { id: number; name: string; duration: number | null }[]
  >([]);
  const [staffListAll, setStaffListAll] = useState<{ id: number; name: string }[]>([]);
  const [staffScheduleMap, setStaffScheduleMap] = useState<
    import("@/lib/staffSchedule").StaffScheduleBySalon
  >(() => new Map());

  const walkInDay = useMemo(() => isoDateFromLocalDate(nowRomeLocalDate()), [isOpen]);

  const [qCustomer, setQCustomer] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [qService, setQService] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!isOpen || !activeSalonId) return;
    setErr("");
    setSaving(false);
    setQCustomer("");
    setCustomerId("");
    setStaffId("");
    setSelectedServiceIds([]);
    setQService("");
    setNotes("");
    void Promise.all([loadCustomers(), loadServices(), loadStaff()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeSalonId]);

  useEffect(() => {
    const q = qCustomer.toLowerCase().trim();
    if (!q) {
      setFilteredCustomers(customers);
      return;
    }
    setFilteredCustomers(
      customers.filter((c) => {
        const full = c.full_name.toLowerCase();
        const phone = String(c.phone ?? "").toLowerCase();
        return full.includes(q) || phone.includes(q);
      }),
    );
  }, [qCustomer, customers]);

  async function loadCustomers() {
    const { data, error } = await supabase
      .from("customers")
      .select("id, first_name, last_name, phone")
      .order("last_name");
    if (error) {
      console.error(error);
      return;
    }
    const list = (data ?? []).map((c) => ({
      id: String(c.id),
      full_name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
      phone: c.phone != null ? String(c.phone) : null,
    }));
    setCustomers(list);
    setFilteredCustomers(list);
  }

  async function loadServices() {
    if (!activeSalonId) {
      setServices([]);
      return;
    }
    try {
      const rows = await fetchAgendaServices(supabase, Number(activeSalonId));
      setServices(
        rows.map((s) => ({
          id: s.id,
          name: s.name,
          duration: s.duration,
        })),
      );
    } catch (e) {
      console.error("WalkInModal loadServices:", e);
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
      const [rows, scheduleMap] = await Promise.all([
        fetchActiveStaffForSalon(supabase, salonId, "id, name"),
        fetchStaffScheduleForSalon(supabase, salonId),
      ]);
      setStaffListAll(
        rows.map((r) => ({
          id: Number(r.id),
          name: String(r.name ?? ""),
        })),
      );
      setStaffScheduleMap(scheduleMap);
    } catch (e) {
      console.error("WalkInModal loadStaff:", e);
      setStaffListAll([]);
      setStaffScheduleMap(new Map());
    }
  }

  const staffListForDay = useMemo(
    () =>
      filterStaffForAgendaDay(staffListAll, staffScheduleMap, walkInDay, staffId ? [staffId] : []),
    [staffListAll, staffScheduleMap, walkInDay, staffId],
  );

  function toggleService(id: number) {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const filteredServices = useMemo(() => {
    const q = qService.toLowerCase().trim();
    if (!q) return services;
    return services.filter((s) => s.name.toLowerCase().includes(q));
  }, [services, qService]);

  async function submit() {
    if (saving || !activeSalonId) return;
    if (!customerId) return setErr("Seleziona un cliente.");
    if (!staffId) return setErr("Seleziona un collaboratore.");
    if (!selectedServiceIds.length) return setErr("Seleziona almeno un servizio.");

    setSaving(true);
    setErr("");

    try {
      const res = await fetch("/api/agenda/walk-ins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salon_id: Number(activeSalonId),
          customer_id: customerId,
          staff_id: Number(staffId),
          service_ids: selectedServiceIds,
          notes: notes.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: string;
        appointment_id?: number;
      };
      if (!res.ok) {
        throw new Error(json.error || json.details || "Errore creazione walk-in.");
      }
      const aid = Number(json.appointment_id);
      if (!Number.isFinite(aid) || aid <= 0) {
        throw new Error("Risposta senza appointment_id.");
      }
      onCreated(aid);
      close();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Errore durante il salvataggio.");
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#120a06] p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[#f3d8b6] font-black text-lg">Nuovo Walk-In</div>
            <p className="text-white/50 text-sm mt-1">
              Cliente senza appuntamento — entra subito in sala.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white"
            aria-label="Chiudi"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          <section>
            <label className="text-[10px] font-black uppercase tracking-wider text-white/40">
              Cliente
            </label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <input
                value={qCustomer}
                onChange={(e) => setQCustomer(e.target.value)}
                placeholder="Cerca nome o telefono..."
                className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-[#f3d8b6]/40"
              />
            </div>
            <div className="mt-2 max-h-36 overflow-y-auto rounded-xl border border-white/10 bg-black/30 divide-y divide-white/5">
              {filteredCustomers.slice(0, 50).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCustomerId(c.id)}
                  className={`w-full px-3 py-2 text-left text-sm flex justify-between gap-2 hover:bg-white/5 ${
                    customerId === c.id ? "bg-[#f3d8b6]/15 text-[#f3d8b6]" : "text-white/80"
                  }`}
                >
                  <span>{c.full_name}</span>
                  {c.phone ? <span className="text-white/40 shrink-0">{c.phone}</span> : null}
                </button>
              ))}
            </div>
          </section>

          <section>
            <label className="text-[10px] font-black uppercase tracking-wider text-white/40">
              Collaboratore
            </label>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-white text-sm outline-none focus:border-[#f3d8b6]/40"
            >
              <option value="">— Seleziona —</option>
              {staffListForDay.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                  {isStaffOffScheduleForAgendaDay(staffScheduleMap, s.id, walkInDay)
                    ? " (fuori turno)"
                    : ""}
                </option>
              ))}
            </select>
            {staffListForDay.length === 0 && (
              <p className="mt-1.5 text-[11px] text-amber-200/80">
                Nessun collaboratore disponibile in questo giorno
              </p>
            )}
            {staffId &&
              isStaffOffScheduleForAgendaDay(staffScheduleMap, staffId, walkInDay) && (
                <p className="mt-1 text-[11px] text-white/45">
                  Collaboratore selezionato non in turno oggi.
                </p>
              )}
          </section>

          <section>
            <label className="text-[10px] font-black uppercase tracking-wider text-white/40">
              Servizi
            </label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <input
                value={qService}
                onChange={(e) => setQService(e.target.value)}
                placeholder="Filtra servizi..."
                className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-[#f3d8b6]/40"
              />
            </div>
            <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-white/10 bg-black/30 divide-y divide-white/5">
              {filteredServices.map((s) => {
                const selected = selectedServiceIds.includes(s.id);
                const dur = Math.max(SLOT_MINUTES, Number(s.duration) || SLOT_MINUTES);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleService(s.id)}
                    className={`w-full px-3 py-2 text-left text-sm flex justify-between gap-2 hover:bg-white/5 ${
                      selected ? "bg-[#f3d8b6]/15 text-[#f3d8b6]" : "text-white/80"
                    }`}
                  >
                    <span>{s.name}</span>
                    <span className="text-white/40 shrink-0">{dur} min</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <label className="text-[10px] font-black uppercase tracking-wider text-white/40">
              Note (opzionale)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-white/90 text-sm outline-none focus:border-[#f3d8b6]/40"
            />
          </section>

          {err ? <p className="text-sm text-red-400">{err}</p> : null}
        </div>

        <div className="mt-6 flex gap-2 justify-end">
          <button
            type="button"
            onClick={close}
            disabled={saving}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-50"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="rounded-xl bg-[#f3d8b6] px-4 py-2 text-sm font-extrabold text-black hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Creazione..." : "Crea walk-in"}
          </button>
        </div>
      </div>
    </div>
  );
}
