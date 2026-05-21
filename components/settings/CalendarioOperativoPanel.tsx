"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  deleteSalonOperationalDayAction,
  deleteStaffScheduleOverrideAction,
  fetchOperationalCalendarMonthAction,
  fetchSalonStaffForOperationalCalendarAction,
  saveSalonOperationalDayAction,
  saveStaffScheduleOverrideAction,
} from "@/app/dashboard/impostazioni/operationalCalendarActions";
import {
  currentYearMonthRome,
  formatOperationalDateIt,
  formatTimeRange,
  mergeOperationalCalendarCards,
  OPERATIONAL_BADGE,
  parseYearMonth,
  shiftYearMonth,
  type OperationalCalendarCard,
  type OperationalExceptionFormKind,
} from "@/lib/operationalCalendarSettings";

type SalonOption = { id: number; name: string };

type Props = {
  /** Salone dall'header o default pagina */
  salonId: number | null;
  salonLabel: string | null;
  allowedSalons: SalonOption[];
  canChooseSalon: boolean;
  canManage: boolean;
};

const FORM_KIND_OPTIONS: Array<{ value: OperationalExceptionFormKind; label: string }> = [
  { value: "open_extra", label: "Apertura straordinaria salone" },
  { value: "closed", label: "Chiusura straordinaria salone" },
  { value: "staff_available", label: "Collaboratore disponibile" },
  { value: "staff_unavailable", label: "Collaboratore non disponibile" },
];

function isStaffFormKind(k: OperationalExceptionFormKind): boolean {
  return k === "staff_available" || k === "staff_unavailable";
}

export default function CalendarioOperativoPanel({
  salonId: headerSalonId,
  salonLabel,
  allowedSalons,
  canChooseSalon,
  canManage,
}: Props) {
  const [pickedSalonId, setPickedSalonId] = useState<number | null>(headerSalonId);
  const [yearMonth, setYearMonth] = useState(currentYearMonthRome);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [cards, setCards] = useState<OperationalCalendarCard[]>([]);
  const [staffOptions, setStaffOptions] = useState<Array<{ id: number; name: string }>>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [formKind, setFormKind] = useState<OperationalExceptionFormKind>("open_extra");
  const [operativeDate, setOperativeDate] = useState("");
  const [staffId, setStaffId] = useState<number | "">("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");
  const [editSalonId, setEditSalonId] = useState<number | null>(null);
  const [editStaffId, setEditStaffId] = useState<number | null>(null);

  useEffect(() => {
    setPickedSalonId(headerSalonId);
  }, [headerSalonId]);

  const effectiveSalonId = canChooseSalon ? pickedSalonId : headerSalonId;
  const monthMeta = useMemo(() => parseYearMonth(yearMonth), [yearMonth]);

  const resetForm = useCallback(() => {
    setFormKind("open_extra");
    setOperativeDate("");
    setStaffId("");
    setStartTime("");
    setEndTime("");
    setNotes("");
    setEditSalonId(null);
    setEditStaffId(null);
  }, []);

  const openCreateForm = useCallback(() => {
    resetForm();
    setFormOpen(true);
    setError(null);
    setOkMsg(null);
  }, [resetForm]);

  const loadMonth = useCallback(async () => {
    setError(null);
    if (effectiveSalonId == null) {
      setCards([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await fetchOperationalCalendarMonthAction(effectiveSalonId, yearMonth);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      setCards([]);
      return;
    }
    setCards(mergeOperationalCalendarCards(res.data));
  }, [effectiveSalonId, yearMonth]);

  const loadStaffOptions = useCallback(async () => {
    if (effectiveSalonId == null) {
      setStaffOptions([]);
      return;
    }
    const res = await fetchSalonStaffForOperationalCalendarAction(effectiveSalonId);
    if (res.ok) setStaffOptions(res.staff);
    else setStaffOptions([]);
  }, [effectiveSalonId]);

  useEffect(() => {
    void loadMonth();
  }, [loadMonth]);

  useEffect(() => {
    void loadStaffOptions();
  }, [loadStaffOptions]);

  function openEditCard(card: OperationalCalendarCard) {
    setFormOpen(true);
    setError(null);
    setOkMsg(null);
    setOperativeDate(card.operative_date);
    setNotes(card.notes ?? "");
    if (card.kind === "salon") {
      setEditSalonId(card.id);
      setEditStaffId(null);
      setFormKind(card.salonKind === "closed" ? "closed" : "open_extra");
      setStartTime(card.open_start_time ?? "");
      setEndTime(card.open_end_time ?? "");
      setStaffId("");
    } else {
      setEditSalonId(null);
      setEditStaffId(card.id);
      setFormKind(card.staffKind === "unavailable" ? "staff_unavailable" : "staff_available");
      setStaffId(card.staff_id);
      setStartTime(card.start_time ?? "");
      setEndTime(card.end_time ?? "");
    }
  }

  async function handleDelete(card: OperationalCalendarCard) {
    if (!canManage || effectiveSalonId == null) return;
    if (!window.confirm("Eliminare questa eccezione?")) return;
    setError(null);
    setOkMsg(null);
    const res =
      card.kind === "salon"
        ? await deleteSalonOperationalDayAction(card.id, effectiveSalonId)
        : await deleteStaffScheduleOverrideAction(card.id, effectiveSalonId);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOkMsg("Eccezione eliminata.");
    if (
      (card.kind === "salon" && editSalonId === card.id) ||
      (card.kind === "staff" && editStaffId === card.id)
    ) {
      setFormOpen(false);
      resetForm();
    }
    void loadMonth();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage || effectiveSalonId == null) return;
    setSaving(true);
    setError(null);
    setOkMsg(null);

    const trimmedDate = operativeDate.trim();
    const st = startTime.trim() || null;
    const en = endTime.trim() || null;
    const noteVal = notes.trim() || null;

    let res: { ok: true } | { ok: false; error: string };

    if (isStaffFormKind(formKind)) {
      const sid = Number(staffId);
      res = await saveStaffScheduleOverrideAction({
        id: editStaffId,
        salon_id: effectiveSalonId,
        staff_id: sid,
        operative_date: trimmedDate,
        kind: formKind === "staff_unavailable" ? "unavailable" : "available",
        start_time: st,
        end_time: en,
        notes: noteVal,
      });
    } else {
      res = await saveSalonOperationalDayAction({
        id: editSalonId,
        salon_id: effectiveSalonId,
        operative_date: trimmedDate,
        kind: formKind === "closed" ? "closed" : "open_extra",
        open_start_time: formKind === "open_extra" ? st : null,
        open_end_time: formKind === "open_extra" ? en : null,
        notes: noteVal,
      });
    }

    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOkMsg(editSalonId != null || editStaffId != null ? "Eccezione aggiornata." : "Eccezione salvata.");
    setFormOpen(false);
    resetForm();
    void loadMonth();
  }

  const salonDisplay =
    allowedSalons.find((s) => s.id === effectiveSalonId)?.name ??
    salonLabel ??
    (effectiveSalonId != null ? `#${effectiveSalonId}` : null);

  if (effectiveSalonId == null) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-100/90">
        {canChooseSalon ? (
          <>Seleziona un salone per gestire il calendario operativo.</>
        ) : (
          <>Nessun salone operativo disponibile per questo profilo.</>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#f3d8b6]/20 bg-[#f3d8b6]/5 px-4 py-3 text-sm text-[#c9b299] leading-relaxed">
        <span className="inline-flex items-center gap-2 font-bold text-[#f3d8b6]">
          <CalendarDays size={18} className="shrink-0" />
          Calendario operativo
        </span>
        <p className="mt-2">
          Eccezioni per <strong className="text-[#f3d8b6]">{salonDisplay}</strong>: aperture o chiusure
          straordinarie del salone e disponibilità puntuali dei collaboratori. Valgono per l&apos;agenda
          al momento della prenotazione.
        </p>
      </div>

      {!canManage ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-100/90">
          Sola lettura: creazione e modifica sono riservate al ruolo <strong>coordinator</strong>.
        </div>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        {canChooseSalon && allowedSalons.length > 1 ? (
          <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-[#c9b299]/80">
            Salone
            <select
              value={pickedSalonId ?? ""}
              onChange={(e) => setPickedSalonId(Number(e.target.value) || null)}
              className="rounded-xl border border-[#5c3a21]/50 bg-black/30 px-3 py-2.5 text-sm font-semibold text-[#f3d8b6] min-w-[200px]"
            >
              {allowedSalons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-sm text-[#c9b299]">
            Salone: <span className="font-bold text-[#f3d8b6]">{salonDisplay}</span>
          </p>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Mese precedente"
            onClick={() => {
              const prev = shiftYearMonth(yearMonth, -1);
              if (prev) setYearMonth(prev);
            }}
            className="rounded-xl border border-[#5c3a21]/50 bg-black/25 p-2 text-[#f3d8b6] hover:bg-white/10"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-[140px] text-center text-sm font-bold text-[#f3d8b6] capitalize">
            {monthMeta?.label ?? yearMonth}
          </span>
          <button
            type="button"
            aria-label="Mese successivo"
            onClick={() => {
              const next = shiftYearMonth(yearMonth, 1);
              if (next) setYearMonth(next);
            }}
            className="rounded-xl border border-[#5c3a21]/50 bg-black/25 p-2 text-[#f3d8b6] hover:bg-white/10"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {canManage ? (
          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#0FA958] px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-emerald-900/25 hover:bg-[#0da052]"
          >
            <Plus size={18} />
            Aggiungi eccezione
          </button>
        ) : null}
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200"
        >
          {error}
        </div>
      ) : null}

      {okMsg ? (
        <div className="rounded-xl border border-emerald-500/35 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">
          {okMsg}
        </div>
      ) : null}

      {formOpen && canManage ? (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-[#5c3a21]/50 bg-black/25 p-5 space-y-4"
        >
          <p className="text-sm font-bold text-[#f3d8b6]">
            {editSalonId != null || editStaffId != null ? "Modifica eccezione" : "Nuova eccezione"}
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs font-bold text-[#c9b299]/90">
              Data *
              <input
                type="date"
                required
                value={operativeDate}
                onChange={(e) => setOperativeDate(e.target.value)}
                className="rounded-xl border border-[#5c3a21]/50 bg-black/30 px-3 py-2.5 text-sm text-[#f3d8b6]"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-bold text-[#c9b299]/90">
              Tipo *
              <select
                required
                value={formKind}
                onChange={(e) => {
                  const v = e.target.value as OperationalExceptionFormKind;
                  setFormKind(v);
                  if (!isStaffFormKind(v)) setStaffId("");
                  if (v === "closed") {
                    setStartTime("");
                    setEndTime("");
                  }
                }}
                disabled={editSalonId != null || editStaffId != null}
                className="rounded-xl border border-[#5c3a21]/50 bg-black/30 px-3 py-2.5 text-sm text-[#f3d8b6] disabled:opacity-60"
              >
                {FORM_KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            {isStaffFormKind(formKind) ? (
              <label className="flex flex-col gap-1.5 text-xs font-bold text-[#c9b299]/90 sm:col-span-2">
                Collaboratore *
                <select
                  required
                  value={staffId === "" ? "" : String(staffId)}
                  onChange={(e) => setStaffId(e.target.value ? Number(e.target.value) : "")}
                  className="rounded-xl border border-[#5c3a21]/50 bg-black/30 px-3 py-2.5 text-sm text-[#f3d8b6]"
                >
                  <option value="">— Seleziona —</option>
                  {staffOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {(formKind === "open_extra" || isStaffFormKind(formKind)) && (
              <>
                <label className="flex flex-col gap-1.5 text-xs font-bold text-[#c9b299]/90">
                  Orario inizio (opz.)
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="rounded-xl border border-[#5c3a21]/50 bg-black/30 px-3 py-2.5 text-sm text-[#f3d8b6]"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-bold text-[#c9b299]/90">
                  Orario fine (opz.)
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="rounded-xl border border-[#5c3a21]/50 bg-black/30 px-3 py-2.5 text-sm text-[#f3d8b6]"
                  />
                </label>
              </>
            )}

            <label className="flex flex-col gap-1.5 text-xs font-bold text-[#c9b299]/90 sm:col-span-2">
              Note (opz.)
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                placeholder="Es. mercoledì straordinario, sabato Scaramuzzo…"
                className="rounded-xl border border-[#5c3a21]/50 bg-black/30 px-3 py-2.5 text-sm text-[#f3d8b6] resize-y"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                resetForm();
              }}
              className="rounded-xl border border-[#5c3a21]/50 px-4 py-2 text-sm font-bold text-[#c9b299] hover:bg-white/5"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-[#f3d8b6] px-4 py-2 text-sm font-black text-[#24140e] hover:bg-[#e8c9a0] disabled:opacity-60"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              Salva
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[#c9b299]">
          <Loader2 className="animate-spin" size={18} />
          Caricamento eccezioni…
        </div>
      ) : cards.length === 0 ? (
        <p className="text-sm text-[#c9b299] rounded-2xl border border-dashed border-white/15 bg-black/15 px-4 py-8 text-center">
          Nessuna eccezione in questo mese. Usa &quot;Aggiungi eccezione&quot; per aperture, chiusure o
          disponibilità puntuali del team.
        </p>
      ) : (
        <ul className="space-y-3">
          {cards.map((card) => {
            const badgeKey =
              card.kind === "salon"
                ? card.salonKind
                : card.staffKind === "available"
                  ? "staff_available"
                  : "staff_unavailable";
            const badge = OPERATIONAL_BADGE[badgeKey];
            const timeStr =
              card.kind === "salon"
                ? formatTimeRange(card.open_start_time, card.open_end_time)
                : formatTimeRange(card.start_time, card.end_time);

            return (
              <li
                key={card.cardKey}
                className="rounded-2xl border border-[#5c3a21]/40 bg-black/20 px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-[#f3d8b6]">
                      {formatOperationalDateIt(card.operative_date)}
                    </span>
                    <span
                      className={[
                        "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold border",
                        badge.className,
                      ].join(" ")}
                    >
                      {badge.label}
                    </span>
                  </div>
                  {card.kind === "staff" ? (
                    <p className="text-xs text-[#c9b299]">{card.staff_name}</p>
                  ) : null}
                  {timeStr ? (
                    <p className="text-xs text-[#c9b299]/90">Fascia: {timeStr}</p>
                  ) : null}
                  {card.notes ? (
                    <p className="text-xs text-[#c9b299]/80 italic">{card.notes}</p>
                  ) : null}
                </div>
                {canManage ? (
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => openEditCard(card)}
                      className="inline-flex items-center gap-1 rounded-xl border border-[#5c3a21]/50 bg-black/25 px-3 py-1.5 text-xs font-bold text-[#f3d8b6] hover:bg-white/10"
                    >
                      <Pencil size={14} />
                      Modifica
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(card)}
                      className="inline-flex items-center gap-1 rounded-xl border border-red-500/30 bg-red-950/20 px-3 py-1.5 text-xs font-bold text-red-200/90 hover:bg-red-950/40"
                    >
                      <Trash2 size={14} />
                      Elimina
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
