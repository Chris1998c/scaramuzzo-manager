"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabaseClient";
import { fetchActiveStaffForSalon } from "@/lib/staffForSalon";
import { fetchOperationalCalendarSnapshot } from "@/lib/salonOperationalCalendar";
import {
  filterStaffForOperationalAgendaModal,
  hasAssignedStaffUnavailableWarning,
  staffSelectLabelForOperationalDate,
  STAFF_UNAVAILABLE_UI_MESSAGE,
} from "@/lib/agenda/operationalAgendaUi";
import { fetchStaffScheduleForSalon } from "@/lib/staffSchedule";
import OperationalDayBanner from "@/components/agenda/OperationalDayBanner";
import { useRouter } from "next/navigation";
import { X, User, FlaskConical, Banknote, Trash2, Save } from "lucide-react";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { agendaGridDayStartLabel, generateHours, SLOT_MINUTES } from "./utils";
import { resolveGridStartTime } from "@/lib/agenda/appointmentModalForm";
import { useModalFieldTouches } from "@/lib/agenda/appointmentModalSession";
import {
  clampDurationMinutes,
  commitLinePatch,
  parseLocal,
  snapToAgendaSlot,
  toNoZ,
} from "@/lib/agenda/agendaContract";
import type { AgendaAppointment, AgendaCustomer } from "@/lib/agenda/agendaContract";
import {
  collectChangedLineStaffPatches,
  formatLineStaffSaveFailureMessage,
  seedLineStaffDraft,
} from "@/lib/agenda/editAppointmentLineStaff";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toast } from "sonner";
import { buildClienteSchedeTecnicheHref } from "@/lib/customers/clienteSchedaAppointmentContext";
import {
  canSetAppointmentLifecycleStatus,
  canShowLifecycleActions,
  type AgendaLifecycleTarget,
} from "@/lib/agenda/appointmentLifecycle";
import { agendaStatusMeta } from "@/lib/agenda/agendaStatusMeta";
import CustomerSearchField from "@/components/customers/CustomerSearchField";

interface Props {
  isOpen: boolean;
  close: () => void;
  appointment: AgendaAppointment;
  selectedDay: string;
  onUpdated?: () => void;
}

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

  const [staffAll, setStaffAll] = useState<EditStaffRow[]>([]);
  const [staffScheduleMap, setStaffScheduleMap] = useState<
    import("@/lib/staffSchedule").StaffScheduleBySalon
  >(() => new Map());
  const [operationalSnapshot, setOperationalSnapshot] = useState<
    import("@/lib/salonOperationalCalendar").OperationalCalendarSnapshot
  >(() => ({ salonDay: null, staffOverrides: new Map() }));

  const [customerId, setCustomerId] = useState<string>("");
  /** Collaboratore per riga appointment_services (chiave = line id). */
  const [lineStaffDraft, setLineStaffDraft] = useState<Record<string, string | null>>(
    {},
  );
  const [notes, setNotes] = useState<string>("");
  /** Source of truth submit/UI per orario (non usare appointment.start_time dopo init). */
  const [selectedStartTime, setSelectedStartTime] = useState<string>("08:00");
  const seededAppointmentIdRef = useRef<string | number | null>(null);
  const { touchedRef, resetTouches, markStartTimeTouched, markCustomerTouched } =
    useModalFieldTouches();

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>("");
  /** Dopo un PATCH lines parziale: invita a riallineare il form al server. */
  const [needsServerReload, setNeedsServerReload] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [lifecycleConfirm, setLifecycleConfirm] = useState<AgendaLifecycleTarget | null>(null);

  // Stessi slot della griglia giorno (apertura salone → 20:30, step 15m)
  const hours = useMemo(
    () => generateHours(agendaGridDayStartLabel(Number(activeSalonId) || 0), "20:30", SLOT_MINUTES),
    [activeSalonId]
  );

  useEffect(() => {
    if (!isOpen) {
      seededAppointmentIdRef.current = null;
      return;
    }

    setErr("");
    setSaving(false);
    setNeedsServerReload(false);
    void loadStaffForSalon();

    if (!appointment) return;
    const apptId = appointment.id;
    if (seededAppointmentIdRef.current === apptId) return;

    seededAppointmentIdRef.current = apptId;
    resetTouches();
    setCustomerId(String(appointment.customer_id ?? ""));
    setLineStaffDraft(seedLineStaffDraft(appointment.appointment_services ?? []));
    setNotes(String(appointment.notes ?? ""));
    setSelectedStartTime(
      resolveGridStartTime(timeFromTsSafe(appointment.start_time), hours),
    );
  }, [isOpen, activeSalonId, appointment?.id, selectedDay, resetTouches]);

  useEffect(() => {
    if (!isOpen || !appointment || hours.length === 0) return;
    if (touchedRef.current.startTime) return;
    setSelectedStartTime((prev) => {
      if (prev && hours.includes(prev)) return prev;
      return resolveGridStartTime(timeFromTsSafe(appointment.start_time), hours);
    });
  }, [hours.length, isOpen, appointment?.id, appointment?.start_time, touchedRef]);

  const handleCustomerSelect = useCallback(
    (id: string) => {
      markCustomerTouched();
      setCustomerId(id);
    },
    [markCustomerTouched],
  );

  async function loadStaffForSalon() {
    if (!activeSalonId) {
      setStaffAll([]);
      setStaffScheduleMap(new Map());
      setOperationalSnapshot({ salonDay: null, staffOverrides: new Map() });
      return;
    }

    try {
      const salonId = Number(activeSalonId);
      const [rows, scheduleMap, opSnap] = await Promise.all([
        fetchActiveStaffForSalon(supabase, salonId, "id, name"),
        fetchStaffScheduleForSalon(supabase, salonId),
        fetchOperationalCalendarSnapshot(supabase, salonId, selectedDay),
      ]);
      setStaffAll((rows as EditStaffRow[]) ?? []);
      setStaffScheduleMap(scheduleMap);
      setOperationalSnapshot(opSnap);
    } catch (error) {
      console.error(error);
      setStaffAll([]);
      setStaffScheduleMap(new Map());
      setOperationalSnapshot({ salonDay: null, staffOverrides: new Map() });
    }
  }

  const lineStaffIncludeIds = useMemo(() => {
    const ids: Array<string | null> = [];
    for (const l of appointment?.appointment_services ?? []) {
      ids.push(l.staff_id != null ? String(l.staff_id) : null);
    }
    for (const v of Object.values(lineStaffDraft)) {
      ids.push(v);
    }
    return ids;
  }, [appointment?.appointment_services, lineStaffDraft]);

  const staffForDay = useMemo(() => {
    const filtered = filterStaffForOperationalAgendaModal(
      staffAll,
      staffScheduleMap,
      selectedDay,
      operationalSnapshot,
      lineStaffIncludeIds,
    );
    return [{ id: null, name: "Non assegnato" }, ...filtered];
  }, [
    staffAll,
    staffScheduleMap,
    selectedDay,
    operationalSnapshot,
    lineStaffIncludeIds,
  ]);

  const staffUnavailableWarning = useMemo(() => {
    return hasAssignedStaffUnavailableWarning(lineStaffIncludeIds, operationalSnapshot);
  }, [lineStaffIncludeIds, operationalSnapshot]);

  const linesStaffKey = useMemo(() => {
    return (appointment?.appointment_services ?? [])
      .map((l) => `${l.id}:${l.staff_id ?? "null"}`)
      .sort()
      .join("|");
  }, [appointment?.appointment_services]);

  const pendingReloadFromKeyRef = useRef<string | null>(null);

  function applyServerFormSnapshot(opts?: { clearError?: boolean }) {
    if (!appointment) return;
    resetTouches();
    setCustomerId(String(appointment.customer_id ?? ""));
    setLineStaffDraft(seedLineStaffDraft(appointment.appointment_services ?? []));
    setNotes(String(appointment.notes ?? ""));
    setSelectedStartTime(
      resolveGridStartTime(timeFromTsSafe(appointment.start_time), hours),
    );
    if (opts?.clearError) setErr("");
    setNeedsServerReload(false);
    pendingReloadFromKeyRef.current = null;
  }

  // Dopo PATCH lines parziale: quando loadAppointments aggiorna le props, riallinea il draft.
  useEffect(() => {
    if (!isOpen || !needsServerReload || !appointment) return;
    if (pendingReloadFromKeyRef.current == null) return;
    if (pendingReloadFromKeyRef.current === linesStaffKey) return;
    applyServerFormSnapshot({ clearError: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo fingerprint staff server
  }, [linesStaffKey, needsServerReload, isOpen, appointment?.id]);

  async function updateAppointment() {
    if (!appointment?.id) return;
    if (saving) return;
    if (needsServerReload) {
      setErr("Ricarica i dati dal server prima di riprovare.");
      return;
    }

    setErr("");

    const customer_id = customerId ? String(customerId) : null;
    if (!customer_id) return setErr("Seleziona un cliente valido.");
    if (!selectedStartTime) return setErr("Seleziona un orario.");

    setSaving(true);

    try {
      const oldStart = parseLocal(appointment.start_time);
      const newStart = snapToAgendaSlot(
        parseLocal(`${selectedDay}T${selectedStartTime}:00`),
      );
      const deltaMs = newStart.getTime() - oldStart.getTime();
      const timeChanged = deltaMs !== 0;

      // Mai staff_id sull'appuntamento: aggiornerebbe tutte le righe e annullerebbe assegnazioni miste.
      const payload: Record<string, unknown> = {
        customer_id,
        notes: notes?.trim() || null,
      };
      if (timeChanged) payload.start_time = toNoZ(newStart);

      const res = await fetch(`/api/agenda/appointments/${appointment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; details?: string };
      if (!res.ok) {
        throw new Error(json.error || json.details || "Errore salvataggio");
      }

      const linePatches = collectChangedLineStaffPatches({
        lines: (appointment.appointment_services ?? []).map((l) => ({
          id: l.id,
          staff_id: l.staff_id,
          name: l.services?.name ?? "Servizio",
        })),
        draftByLineId: lineStaffDraft,
      });

      const succeeded: Array<{ serviceName: string }> = [];
      for (let i = 0; i < linePatches.length; i++) {
        const p = linePatches[i]!;
        const lineRes = await commitLinePatch(supabase, {
          appointmentId: Number(appointment.id),
          lineId: p.lineId,
          patch: { staff_id: p.staff_id },
        });
        if (!lineRes.ok) {
          const remainingCount = linePatches.length - i - 1;
          pendingReloadFromKeyRef.current = linesStaffKey;
          setNeedsServerReload(true);
          setErr(
            formatLineStaffSaveFailureMessage({
              succeeded,
              failedServiceName: p.serviceName,
              failedMessage: lineRes.error.message,
              remainingCount,
            }),
          );
          onUpdated?.();
          return;
        }
        succeeded.push({ serviceName: p.serviceName });
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
    if (!appointment?.id || saving) return;

    setSaving(true);
    setErr("");

    try {
      const res = await fetch(`/api/agenda/appointments/${appointment.id}`, {
        method: "DELETE",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; details?: string };
      if (!res.ok) {
        throw new Error(json.error || json.details || "Errore eliminazione");
      }

      setShowDeleteConfirm(false);
      toast.success("Appuntamento eliminato.");
      onUpdated?.();
      close();
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Errore eliminazione";
      toast.error(msg);
      setErr(msg);
      throw e;
    } finally {
      setSaving(false);
    }
  }

  async function applyLifecycleStatus(target: AgendaLifecycleTarget) {
    if (!appointment?.id) return;
    const gate = canSetAppointmentLifecycleStatus({
      status: appointment.status,
      sale_id: appointment.sale_id,
      target,
    });
    if (!gate.allowed) {
      setErr(gate.reason ?? "Azione non disponibile");
      return;
    }

    setSaving(true);
    setErr("");
    try {
      const res = await fetch(`/api/agenda/appointments/${appointment.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: target }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Errore aggiornamento stato");
      setLifecycleConfirm(null);
      onUpdated?.();
      close();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Errore aggiornamento stato";
      toast.error(msg);
      setErr(msg);
      throw e;
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
    const fromForm = customerId?.trim() ?? "";
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
    const appointmentId = Number(appointment?.id);
    if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
      toast.error("Appuntamento non valido.");
      return;
    }
    close();
    router.push(buildClienteSchedeTecnicheHref(cid, appointmentId));
  }

  const headerCustomer = appointment?.customers ? safeName(appointment.customers) : "Appuntamento";
  const headerStatus = agendaStatusMeta(appointment?.status);
  const headerTime = selectedStartTime || timeFromTsSafe(appointment?.start_time);

  const status = String(appointment?.status ?? "").toLowerCase();
  const isNoShow = status === "no_show" || status === "noshow";
  const disablePortaInSalaAndCassa =
    status === "done" || status === "cancelled" || isNoShow;
  const showLifecycle = canShowLifecycleActions({
    status: appointment?.status,
    sale_id: appointment?.sale_id,
  });
  const formLocked = disablePortaInSalaAndCassa;
  const canOpenClienteSchede = Boolean(getClienteIdForSchedeLink());

  const serviceLines = useMemo(() => {
    return (appointment.appointment_services ?? []).map((l) => {
      const color = String(l.services?.color_code ?? "#a8754f").trim() || "#a8754f";
      return {
        id: l.id,
        name: l.services?.name ?? "Servizio",
        duration: clampDurationMinutes(l.duration_minutes ?? l.services?.duration),
        accent: color,
      };
    });
  }, [appointment]);

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
            <div className="text-[11px] font-medium text-white/45">
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
            <div className="mt-2 rounded-lg border border-red-400/20 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-200 space-y-1.5">
 <p>{err}</p>
 {needsServerReload && (
 <button
 type="button"
                  disabled={saving}
                  onClick={() => {
                    onUpdated?.();
                    applyServerFormSnapshot({ clearError: true });
                  }}
                  className="rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide bg-red-500/15 border border-red-400/25 text-red-100 hover:bg-red-500/25 transition disabled:opacity-50"
                >
                  Ricarica dal server
                </button>
              )}
            </div>
          )}

          {showLifecycle && (
            <div className="mt-2 grid grid-cols-2 gap-1.5">
 <button
 type="button"
 disabled={saving}
 onClick={() => setLifecycleConfirm("cancelled")}
                className="rounded-lg px-2 py-1.5 text-[10px] font-bold text-red-200/95 bg-red-500/10 border border-red-400/20 hover:bg-red-500/15 transition disabled:opacity-50"
 >
 Segna come annullato
 </button>
 <button
 type="button"
 disabled={saving}
 onClick={() => setLifecycleConfirm("no_show")}
                className="rounded-lg px-2 py-1.5 text-[10px] font-bold text-amber-100/95 bg-amber-500/10 border border-amber-400/20 hover:bg-amber-500/15 transition disabled:opacity-50"
              >
                Segna come no-show
              </button>
            </div>
          )}
        </div>

        {/* form + servizi */}
        <div className="px-3 py-2.5 space-y-2.5 overflow-y-auto custom-scrollbar flex-1 min-h-0">
          <OperationalDayBanner salonDay={operationalSnapshot.salonDay} />

          {/* Servizi: nome/durata read-only; collaboratore editabile per riga */}
          <div className="rounded-lg bg-black/25 border border-white/10 p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-medium text-white/45">
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
              <div className="space-y-1.5 max-h-[14rem] overflow-y-auto custom-scrollbar pr-0.5">
                {serviceLines.map((l) => {
                  const lineKey = String(l.id);
                  const draftStaff =
                    Object.prototype.hasOwnProperty.call(lineStaffDraft, lineKey)
                      ? lineStaffDraft[lineKey]
                      : null;
                  return (
                    <div
                      key={l.id}
                      className="rounded-lg border border-white/[0.08] px-2 py-1.5 bg-black/30 space-y-1"
                    >
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-[3px] h-7 shrink-0 rounded-full"
                          style={{ backgroundColor: l.accent }}
                        />
                        <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                          <p className="text-xs font-semibold text-white/95 truncate">
                            {l.name}
                          </p>
                          <span className="text-[10px] font-mono text-white/55 shrink-0">
                            {l.duration}′
                          </span>
                        </div>
                      </div>
                      <select
                        className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1.5 text-[11px] text-white outline-none focus:border-[#f3d8b6]/40 focus:ring-1 focus:ring-[#f3d8b6]/25"
 value={draftStaff ?? ""}
 disabled={saving || formLocked || needsServerReload}
 aria-label={`Collaboratore per ${l.name}`}
 onChange={(e) => {
 const v = e.target.value === "" ? null : e.target.value;
 setLineStaffDraft((prev) => ({ ...prev, [lineKey]: v }));
 }}
 >
 {staffForDay.map((s) => (
 <option key={String(s.id ?? "free")} value={s.id ?? ""}>
                            {s.id == null
                              ? s.name
                              : staffSelectLabelForOperationalDate(
                                  s.name,
                                  s.id,
                                  staffScheduleMap,
                                  selectedDay,
                                  operationalSnapshot,
                                )}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}
            {staffForDay.length <= 1 && (
              <p className="text-[10px] text-amber-200/80">
                Nessun collaboratore disponibile in questo giorno
              </p>
            )}
            {staffUnavailableWarning && (
              <p className="text-[10px] text-amber-200/85">
                {STAFF_UNAVAILABLE_UI_MESSAGE}
              </p>
            )}
          </div>

          {/* Dati appuntamento */}
          <div className="rounded-lg bg-black/25 border border-white/10 p-2">
            <div className="grid grid-cols-1 gap-2">
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-white/45">
 Cliente
 </div>
 <CustomerSearchField
 supabase={supabase}
 enabled={isOpen}
 preloadSalonId={activeSalonId}
 selectedCustomerId={customerId}
 onSelectCustomerId={handleCustomerSelect}
 initialDisplayLabel={headerCustomer}
 disabled={saving || formLocked || needsServerReload}
 variant="compact"
 placeholder="Cerca nome o telefono"
 dropdownZIndexClass="z-[170]"
                />
              </div>

              <div className="space-y-1">
                <div className="text-[11px] font-medium text-white/45">
                  Orario
                </div>
                <select
                  className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-2 text-xs text-white outline-none focus:border-[#f3d8b6]/40 focus:ring-1 focus:ring-[#f3d8b6]/25"
                  value={selectedStartTime}
                  disabled={saving || formLocked || needsServerReload}
                  onChange={(e) => {
                    markStartTimeTouched();
                    setSelectedStartTime(e.target.value);
                  }}
                >
                  {hours.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <div className="text-[11px] font-medium text-white/45">
 Note
 </div>
 <textarea
 placeholder="Note…"
                  className="w-full rounded-lg bg-black/40 border border-white/10 px-2.5 py-2 text-xs text-white placeholder:text-white/35 outline-none focus:border-[#f3d8b6]/40 focus:ring-1 focus:ring-[#f3d8b6]/25 resize-none"
                  rows={2}
                  value={notes}
                  disabled={saving || formLocked || needsServerReload}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 pb-0.5">
            <button
              onClick={updateAppointment}
              disabled={saving || formLocked || needsServerReload}
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
 onClose={() => {
 if (!saving) setShowDeleteConfirm(false);
 }}
 onConfirm={performDeleteAppointment}
 title="Elimina appuntamento"
 description="Vuoi eliminare questo appuntamento? L'operazione non può essere annullata."
 confirmLabel="Elimina"
 variant="danger"
 loading={saving}
 />

 <ConfirmDialog
 isOpen={lifecycleConfirm === "cancelled"}
 onClose={() => {
 if (!saving) setLifecycleConfirm(null);
 }}
 onConfirm={() => applyLifecycleStatus("cancelled")}
 loading={saving}
 title="Segna come annullato"
 description="L'appuntamento resterà in agenda come annullato e non occuperà più la disponibilità del collaboratore."
 confirmLabel="Segna come annullato"
 variant="danger"
 />
 <ConfirmDialog
 isOpen={lifecycleConfirm === "no_show"}
 onClose={() => {
 if (!saving) setLifecycleConfirm(null);
 }}
 onConfirm={() => applyLifecycleStatus("no_show")}
 loading={saving}
 title="Segna come no-show"
 description="Il cliente non si è presentato. L'appuntamento resterà tracciato come no-show."
 confirmLabel="Segna come no-show"
 variant="danger"
      />
    </div>
  );
}
