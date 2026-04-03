"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabaseClient";
import { fetchActiveStaffForSalon } from "@/lib/staffForSalon";
import { useRouter } from "next/navigation";
import { X, User, FlaskConical, Banknote, Trash2, Save } from "lucide-react";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { agendaGridDayStartLabel, generateHours, SLOT_MINUTES } from "./utils";
import {
  clampDurationMinutes,
  syncAppointmentHeaderFromDb,
  parseLocal,
  toNoZ,
  normalizeStaffId,
} from "@/lib/agenda/agendaContract";
import type { AgendaAppointment, AgendaCustomer } from "@/lib/agenda/agendaContract";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toast } from "sonner";

interface Props {
  isOpen: boolean;
  close: () => void;
  appointment: AgendaAppointment;
  selectedDay: string;
  onUpdated?: () => void;
}

type EditCustomerRow = {
  id: string | number;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  full_name: string;
};

type EditStaffRow = { id: number | null; name: string };

function safeName(c: AgendaCustomer | null | undefined) {
  const full = `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim();
  return full || "Cliente";
}

// prende HH:MM anche se start_time ha secondi/Z
function timeFromTsSafe(ts: string) {
  const s = String(ts || "");
  const parts = s.split("T");
  if (parts.length < 2) return "08:00";
  const t = parts[1] || "";
  return String(t).slice(0, 5) || "08:00";
}

function toStrOrNull(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

function statusMeta(status: string | null | undefined) {
  const s = String(status || "scheduled");
  if (s === "in_sala") {
    return {
      label: "IN SALA",
      cls: "bg-emerald-400 text-black border border-emerald-300/80",
    };
  }
  if (s === "done") {
    return {
      label: "COMPLETATO",
      cls: "bg-white/10 text-white/80 border border-white/20",
    };
  }
  if (s === "cancelled") {
    return {
      label: "ANNULLATO",
      cls: "bg-red-500/15 text-red-200 border border-red-400/40",
    };
  }
  return {
    label: "PRENOTATO",
    cls: "bg-black/40 text-[#f3d8b6] border border-white/20",
  };
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
  const { activeSalonId } = useActiveSalon();

  const [customers, setCustomers] = useState<EditCustomerRow[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<EditCustomerRow[]>([]);
  const [staff, setStaff] = useState<EditStaffRow[]>([]);

  const [qCustomer, setQCustomer] = useState("");
  const [customer, setCustomer] = useState<string>("");
  const [staffId, setStaffId] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>("");
  const [time, setTime] = useState<string>("08:00");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Stessi slot della griglia giorno (apertura salone → 20:30, step 15m)
  const hours = useMemo(
    () => generateHours(agendaGridDayStartLabel(Number(activeSalonId) || 0), "20:30", SLOT_MINUTES),
    [activeSalonId]
  );

  useEffect(() => {
    if (!isOpen) return;

    setErr("");
    setSaving(false);
    setQCustomer("");

    void loadCustomers();
    void loadStaffForSalon();

    if (appointment) {
      setCustomer(String(appointment.customer_id ?? ""));
      setStaffId(appointment.staff_id != null ? String(appointment.staff_id) : null);
      setNotes(String(appointment.notes ?? ""));
      const t0 = timeFromTsSafe(appointment.start_time);
      setTime(hours.includes(t0) ? t0 : hours[0] ?? t0);
    } else {
      setCustomer("");
      setStaffId(null);
      setNotes("");
      setTime(hours[0] ?? "08:00");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeSalonId, appointment?.id, hours]);

  // filtro clienti
  useEffect(() => {
    const q = qCustomer.toLowerCase().trim();
    if (!q) {
      setFilteredCustomers(customers);
      return;
    }
    setFilteredCustomers(
      customers.filter((c) => {
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

  async function loadStaffForSalon() {
    if (!activeSalonId) {
      setStaff([{ id: null, name: "Disponibile" }]);
      return;
    }

    try {
      const rows = await fetchActiveStaffForSalon(supabase, Number(activeSalonId), "id, name");
      setStaff([{ id: null, name: "Disponibile" }, ...((rows as EditStaffRow[]) ?? [])]);
    } catch (error) {
      console.error(error);
      setStaff([{ id: null, name: "Disponibile" }]);
    }
  }

  async function updateAppointment() {
    if (!appointment?.id) return;
    if (saving) return;

    setErr("");

    const customer_id = customer ? String(customer) : null;
    if (!customer_id) return setErr("Seleziona un cliente valido.");
    if (!time) return setErr("Seleziona un orario.");

    setSaving(true);

    try {
      const oldStart = parseLocal(appointment.start_time);
      const newStart = parseLocal(`${selectedDay}T${time}:00`);
      const deltaMs = newStart.getTime() - oldStart.getTime();
      const staffNorm = normalizeStaffId(staffId);
      const timeChanged = deltaMs !== 0;
      const staffChanged = staffNorm !== appointment.staff_id;

      const { error: metaErr } = await supabase
        .from("appointments")
        .update({
          customer_id,
          notes: notes?.trim() || null,
        })
        .eq("id", appointment.id);
      if (metaErr) throw metaErr;

      const { data: lineRows, error: linesErr } = await supabase
        .from("appointment_services")
        .select("id, start_time, duration_minutes, staff_id")
        .eq("appointment_id", appointment.id)
        .order("start_time", { ascending: true })
        .order("id", { ascending: true });

      if (linesErr) throw linesErr;

      if (!lineRows?.length) {
        const oldEnd = appointment.end_time
          ? parseLocal(appointment.end_time)
          : new Date(oldStart.getTime() + SLOT_MINUTES * 60_000);
        const durationMs = Math.max(
          SLOT_MINUTES * 60_000,
          oldEnd.getTime() - oldStart.getTime()
        );
        const newEnd = new Date(newStart.getTime() + durationMs);
        if (timeChanged || staffChanged) {
          const { error: hErr } = await supabase
            .from("appointments")
            .update({
              start_time: toNoZ(newStart),
              end_time: toNoZ(newEnd),
              staff_id: staffNorm,
            })
            .eq("id", appointment.id);
          if (hErr) throw hErr;
        }
      } else if (timeChanged || staffChanged) {
        for (const l of lineRows) {
          const patch: Record<string, unknown> = {};
          if (staffChanged) patch.staff_id = staffNorm;
          if (timeChanged) {
            const ls = parseLocal(String(l.start_time));
            patch.start_time = toNoZ(new Date(ls.getTime() + deltaMs));
          }
          const { error: u } = await supabase.from("appointment_services").update(patch).eq("id", l.id);
          if (u) throw u;
        }
        const synced = await syncAppointmentHeaderFromDb(supabase, Number(appointment.id));
        if (!synced.ok) throw synced.error;
      }

      onUpdated?.();
      close();
    } catch (e: unknown) {
      console.error(e);
      setErr(e instanceof Error ? e.message : "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  }

  function openDeleteConfirm() {
    if (!appointment?.id || saving) return;
    setShowDeleteConfirm(true);
  }

  async function performDeleteAppointment() {
    if (!appointment?.id) return;

    setSaving(true);
    setErr("");

    try {
      const { error: delLinesErr } = await supabase
        .from("appointment_services")
        .delete()
        .eq("appointment_id", appointment.id);

      if (delLinesErr) throw delLinesErr;

      const { error: delErr } = await supabase.from("appointments").delete().eq("id", appointment.id);
      if (delErr) throw delErr;

      onUpdated?.();
      close();
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || "Errore eliminazione");
    } finally {
      setSaving(false);
    }
  }

  async function portaInSala() {
    if (!appointment?.id) return;
    if (saving) return;

    setSaving(true);
    setErr("");

    try {
      const res = await fetch("/api/agenda/porta-in-sala", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointment_id: Number(appointment.id) }),
      }); 

      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok)
        throw new Error(json?.error || "Errore durante Porta in sala");

      onUpdated?.();
      close();
      router.push(`/dashboard/cassa/${appointment.id}`);
    } catch (e: unknown) {
      console.error(e);
      setErr(e instanceof Error ? e.message : "Errore Porta in sala");
    } finally {
      setSaving(false);
    }
  }

  function goToCash() {
    if (!appointment?.id) return;
    close();
    router.push(`/dashboard/cassa/${appointment.id}`);
  }

  function getClienteIdForSchedeLink(): string | null {
    const fromForm = customer?.trim() ?? "";
    if (fromForm) return fromForm;
    const aid = appointment?.customer_id;
    if (aid == null || aid === "") return null;
    return String(aid);
  }

  function goToSchedeTecniche() {
    const cid = getClienteIdForSchedeLink();
    if (!cid) {
      toast.error(
        "Nessun cliente collegato a questo appuntamento. Seleziona o crea un cliente nel modulo sopra, salva, poi riprova.",
      );
      return;
    }
    close();
    router.push(`/dashboard/clienti/${cid}`);
  }

  const headerCustomer = appointment?.customers ? safeName(appointment.customers) : "Appuntamento";
  const headerStatus = statusMeta(appointment?.status);
  const headerTime = timeFromTsSafe(appointment?.start_time);

  const status = String(appointment?.status ?? "").toLowerCase();
  const disablePortaInSalaAndCassa = status === "done" || status === "cancelled";
  const canOpenClienteSchede = Boolean(getClienteIdForSchedeLink());

  const serviceLines = useMemo(() => {
    return (appointment.appointment_services ?? []).map((l) => {
      const color = String(l.services?.color_code ?? "#a8754f").trim() || "#a8754f";
      return {
        id: l.id,
        name: l.services?.name ?? "Servizio",
        duration: clampDurationMinutes(l.duration_minutes ?? l.services?.duration),
        accent: color,
        staffId: l.staff_id ?? null,
      };
    });
  }, [appointment]);

  const staffById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of staff || []) {
      if (s?.id == null) continue;
      map.set(String(s.id), String(s.name ?? ""));
    }
    return map;
  }, [staff]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/65 backdrop-blur-sm p-2 sm:p-2.5">
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-[19.5rem] sm:max-w-[22rem] max-h-[min(92vh,640px)] rounded-xl border border-white/10 bg-scz-dark shadow-[0_24px_70px_rgba(0,0,0,0.5)] overflow-hidden text-white flex flex-col"
      >
        {/* header */}
        <div className="flex items-start justify-between gap-2 px-3 py-2.5 border-b border-white/10 bg-black/25 shrink-0">
          <div className="min-w-0 space-y-0.5">
            <div className="text-[8px] font-bold uppercase tracking-[0.16em] text-white/45">
              Appuntamento
            </div>
            <h2 className="text-base sm:text-lg font-bold text-[#f3d8b6] tracking-tight line-clamp-2">
              {headerCustomer}
            </h2>
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-white/55">
              <span>
                {selectedDay} · {headerTime}
              </span>
              <span className="w-px h-2.5 bg-white/20" />
              <span>
                #{appointment?.id ?? "-"}
              </span>
              <span className="w-px h-2.5 bg-white/20" />
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide ${headerStatus.cls}`}
              >
                {headerStatus.label}
              </span>
            </div>
          </div>

          <button
            onClick={close}
            disabled={saving}
            className="rounded-lg p-1 bg-black/40 border border-white/12 text-white/65 hover:bg-black/55 transition shrink-0 disabled:opacity-50"
            aria-label="Chiudi"
            title="Chiudi"
          >
            <X size={15} />
          </button>
        </div>

        {/* quick actions */}
        <div className="px-3 pt-2.5 shrink-0">
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={portaInSala}
              disabled={saving || disablePortaInSalaAndCassa}
              className="inline-flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 rounded-lg px-2 py-1.5 text-[10px] sm:text-[11px] leading-tight
                         bg-[#0FA958] text-white font-bold
                         shadow-[0_6px_20px_rgba(15,169,88,0.18)]
                         hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <User size={14} className="shrink-0" />
              <span className="text-center">In sala</span>
            </button>

            <button
              type="button"
              onClick={goToSchedeTecniche}
              disabled={saving || !canOpenClienteSchede}
              title={
                canOpenClienteSchede
                  ? "Apri scheda cliente e schede tecniche"
                  : "Collega un cliente all’appuntamento per aprire le schede"
              }
              className="inline-flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 rounded-lg px-2 py-1.5 text-[10px] sm:text-[11px] font-bold bg-black/35 border border-white/12 text-[#f3d8b6] hover:bg-black/45 transition disabled:opacity-50 disabled:cursor-not-allowed leading-tight"
            >
              <FlaskConical size={14} className="shrink-0" />
              <span className="text-center">Scheda</span>
            </button>

            <button
              onClick={goToCash}
              disabled={saving || disablePortaInSalaAndCassa}
              className="inline-flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 rounded-lg px-2 py-1.5 text-[10px] sm:text-[11px] font-bold bg-[#f3d8b6] text-[#1A0F0A] hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed leading-tight"
            >
              <Banknote size={14} className="shrink-0" />
              <span className="text-center">Cassa</span>
            </button>
          </div>

          {err && (
            <div className="mt-2 rounded-lg border border-red-400/20 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-200">
              {err}
            </div>
          )}
        </div>

        {/* form + servizi */}
        <div className="px-3 py-2.5 space-y-2.5 overflow-y-auto custom-scrollbar flex-1 min-h-0">
          {/* Servizi appuntamento (read-only) */}
          <div className="rounded-lg bg-black/25 border border-white/10 p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/45">
                Servizi
              </div>
              <div className="text-[10px] text-white/55 tabular-nums">
                {serviceLines.length}
              </div>
            </div>
            {serviceLines.length === 0 ? (
              <div className="text-[11px] text-white/40 italic leading-snug">
                Nessun servizio collegato.
              </div>
            ) : (
              <div className="space-y-1 max-h-[5.5rem] overflow-y-auto custom-scrollbar pr-0.5">
                {serviceLines.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2 py-1.5 bg-black/30"
                  >
                    <div
                      className="w-[3px] h-7 shrink-0 rounded-full"
                      style={{ backgroundColor: l.accent }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5">
                        <p className="text-xs font-semibold text-white/95 truncate">
                          {l.name}
                        </p>
                        <span className="text-[10px] font-mono text-white/55 shrink-0">
                          {l.duration}′
                        </span>
                      </div>
                      <div className="text-[10px] text-white/45 truncate">
                        {l.staffId
                          ? staffById.get(String(l.staffId)) || "Staff"
                          : "Da assegnare"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Dati appuntamento */}
          <div className="rounded-lg bg-black/25 border border-white/10 p-2">
            <div className="grid grid-cols-1 gap-2">
              <div className="space-y-1">
                <div className="text-[8px] font-bold uppercase tracking-[0.14em] text-white/45">
                  Cliente
                </div>
                <input
                  type="text"
                  placeholder="Cerca nome o telefono"
                  className="w-full rounded-lg bg-black/40 border border-white/10 px-2.5 py-2 text-xs text-white placeholder:text-white/35 outline-none focus:border-[#f3d8b6]/40 focus:ring-1 focus:ring-[#f3d8b6]/25"
                  disabled={saving}
                  value={qCustomer}
                  onChange={(e) => setQCustomer(e.target.value)}
                />

                <select
                  className="w-full rounded-lg bg-black/40 border border-white/10 px-2.5 py-2 text-xs text-white outline-none focus:border-[#f3d8b6]/40 focus:ring-1 focus:ring-[#f3d8b6]/25"
                  value={customer}
                  disabled={saving}
                  onChange={(e) => setCustomer(e.target.value)}
                >
                  <option value="">Seleziona cliente</option>
                  {filteredCustomers.map((c) => (
                    <option key={String(c.id)} value={String(c.id)}>
                      {c.full_name}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="text-[8px] font-bold uppercase tracking-[0.14em] text-white/45">
                    Orario
                  </div>
                  <select
                    className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-2 text-xs text-white outline-none focus:border-[#f3d8b6]/40 focus:ring-1 focus:ring-[#f3d8b6]/25"
                    value={time}
                    disabled={saving}
                    onChange={(e) => setTime(e.target.value)}
                  >
                    {hours.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <div className="text-[8px] font-bold uppercase tracking-[0.14em] text-white/45">
                    Staff
                  </div>
                  <select
                    className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-2 text-xs text-white outline-none focus:border-[#f3d8b6]/40 focus:ring-1 focus:ring-[#f3d8b6]/25"
                    value={staffId ?? ""}
                    disabled={saving}
                    onChange={(e) =>
                      setStaffId(e.target.value === "" ? null : e.target.value)
                    }
                  >
                    {staff.map((s) => (
                      <option key={String(s.id ?? "free")} value={s.id ?? ""}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-[8px] font-bold uppercase tracking-[0.14em] text-white/45">
                  Note
                </div>
                <textarea
                  placeholder="Note…"
                  className="w-full rounded-lg bg-black/40 border border-white/10 px-2.5 py-2 text-xs text-white placeholder:text-white/35 outline-none focus:border-[#f3d8b6]/40 focus:ring-1 focus:ring-[#f3d8b6]/25 resize-none"
                  rows={2}
                  value={notes}
                  disabled={saving}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 pb-0.5">
            <button
              onClick={updateAppointment}
              disabled={saving}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs bg-[#f3d8b6] text-[#1A0F0A] font-bold hover:opacity-90 transition disabled:opacity-50"
            >
              <Save size={14} />
              Salva
            </button>

            <button
              onClick={openDeleteConfirm}
              disabled={saving}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs bg-red-500/12 text-red-200 border border-red-400/18 font-bold hover:bg-red-500/18 transition disabled:opacity-50"
            >
              <Trash2 size={14} />
              Elimina
            </button>
          </div>
        </div>
      </motion.div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={performDeleteAppointment}
        title="Elimina appuntamento"
        description="Vuoi eliminare questo appuntamento? L'operazione non può essere annullata."
        confirmLabel="Elimina"
        variant="danger"
      />
    </div>
  );
}
