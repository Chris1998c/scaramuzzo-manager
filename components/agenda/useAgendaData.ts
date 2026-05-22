"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchActiveStaffForSalon } from "@/lib/staffForSalon";
import {
  fetchOperationalCalendarRange,
  fetchOperationalCalendarSnapshot,
  type SalonOperationalDay,
  type StaffDateOverride,
} from "@/lib/salonOperationalCalendar";
import {
  fetchStaffScheduleForSalon,
  type StaffScheduleBySalon,
} from "@/lib/staffSchedule";
import {
  AGENDA_LIST_SELECT,
  normalizeAgendaRows,
  type AgendaAppointment,
} from "@/lib/agenda/agendaContract";
import { generateWeekDaysFromDate } from "./utils";

type ViewMode = "day" | "week";

type WeekDay = { date: string; label: string };

type UseAgendaDataArgs = {
  supabase: SupabaseClient;
  activeSalonId: number | null;
  isReady: boolean;
  currentDate: string;
  view: ViewMode;
};

export function useAgendaData({
  supabase,
  activeSalonId,
  isReady,
  currentDate,
  view,
}: UseAgendaDataArgs) {
  const [staff, setStaff] = useState<{ id: number; name: string; is_virtual?: boolean }[]>([]);
  const [appointments, setAppointments] = useState<AgendaAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [staffScheduleByStaffId, setStaffScheduleByStaffId] = useState<StaffScheduleBySalon>(
    () => new Map(),
  );
  const [opSalonDay, setOpSalonDay] = useState<SalonOperationalDay | null>(null);
  const [opStaffOverrides, setOpStaffOverrides] = useState<Map<string, StaffDateOverride>>(
    () => new Map(),
  );
  const [opSalonDaysByDate, setOpSalonDaysByDate] = useState<Map<string, SalonOperationalDay>>(
    () => new Map(),
  );
  const [opStaffOverridesByDate, setOpStaffOverridesByDate] = useState<
    Map<string, Map<string, StaffDateOverride>>
  >(() => new Map());

  const weekDays = useMemo(
    () => generateWeekDaysFromDate(currentDate),
    [currentDate],
  );

  const loadStaff = useCallback(
    async (salonId: number) => {
      try {
        const rows = await fetchActiveStaffForSalon(supabase, salonId, "*");
        setStaff((rows as { id: number; name: string }[]) ?? []);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error("Errore caricamento staff:", msg || error);
        setStaff([]);
      }
    },
    [supabase],
  );

  const loadAppointments = useCallback(
    async (salonId: number, options?: { silent?: boolean }) => {
      if (!currentDate) return;
      const silent = options?.silent === true;
      if (!silent) setLoading(true);

      let startRange: string;
      let endRange: string;

      if (view === "day") {
        startRange = `${currentDate}T00:00:00`;
        endRange = `${currentDate}T23:59:59`;
      } else {
        startRange = `${weekDays[0].date}T00:00:00`;
        endRange = `${weekDays[6].date}T23:59:59`;
      }

      const { data: raw, error } = await supabase
        .from("appointments")
        .select(AGENDA_LIST_SELECT)
        .eq("salon_id", salonId)
        .gte("start_time", startRange)
        .lte("start_time", endRange)
        .order("start_time", { ascending: true })
        .order("start_time", {
          foreignTable: "appointment_services",
          ascending: true,
        });

      if (error) {
        console.error("Errore appuntamenti:", error.message || error.code || error);
        setAppointments([]);
        if (!silent) setLoading(false);
        else console.warn("[agenda] refresh appuntamenti:", error.message);
        return;
      }

      setAppointments(normalizeAgendaRows((raw ?? []) as unknown[]));
      if (!silent) setLoading(false);
    },
    [currentDate, view, supabase, weekDays],
  );

  const loadOperationalCalendar = useCallback(async () => {
    if (activeSalonId == null || !currentDate) {
      setOpSalonDay(null);
      setOpStaffOverrides(new Map());
      setOpSalonDaysByDate(new Map());
      setOpStaffOverridesByDate(new Map());
      return;
    }

    if (view === "day") {
      const snap = await fetchOperationalCalendarSnapshot(
        supabase,
        activeSalonId,
        currentDate,
      );
      setOpSalonDay(snap.salonDay);
      setOpStaffOverrides(snap.staffOverrides);
      setOpSalonDaysByDate(new Map());
      setOpStaffOverridesByDate(new Map());
      return;
    }

    const from = weekDays[0]?.date;
    const to = weekDays[6]?.date;
    if (!from || !to) return;
    const range = await fetchOperationalCalendarRange(supabase, activeSalonId, from, to);
    setOpSalonDay(null);
    setOpStaffOverrides(new Map());
    setOpSalonDaysByDate(range.salonDaysByDate);
    setOpStaffOverridesByDate(range.staffOverridesByDate);
  }, [activeSalonId, currentDate, view, weekDays, supabase]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (activeSalonId == null) return;
      const m = await fetchStaffScheduleForSalon(supabase, activeSalonId);
      if (!cancelled) setStaffScheduleByStaffId(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSalonId, supabase]);

  useEffect(() => {
    void loadOperationalCalendar();
  }, [loadOperationalCalendar]);

  useEffect(() => {
    if (!isReady) return;
    if (activeSalonId == null) return;

    loadStaff(activeSalonId);
    loadAppointments(activeSalonId);
  }, [isReady, activeSalonId, currentDate, view, loadStaff, loadAppointments]);

  return {
    staff,
    appointments,
    loading,
    staffScheduleByStaffId,
    opSalonDay,
    opStaffOverrides,
    opSalonDaysByDate,
    opStaffOverridesByDate,
    weekDays,
    loadStaff,
    loadAppointments,
    loadOperationalCalendar,
  };
}
