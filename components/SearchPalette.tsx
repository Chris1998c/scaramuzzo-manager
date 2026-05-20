"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";
import { motion } from "framer-motion";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { AGENDA_LIST_SELECT } from "@/lib/agenda/agendaContract";
import { fetchActiveStaffForSalon } from "@/lib/staffForSalon";

interface Props {
  onSelectAppointment?: (a: any) => void;
  onSelectCustomer?: (c: any) => void;
}

function customerLabel(c: {
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
} | null): string {
  if (!c) return "";
  const full = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
  return full || String(c.name ?? "").trim();
}

function appointmentSearchText(a: Record<string, unknown>): string {
  const customer =
    (a.customer as Record<string, unknown> | undefined) ??
    (a.customers as Record<string, unknown> | undefined);
  const lines = (a.appointment_services as Array<Record<string, unknown>> | undefined) ?? [];
  const svcNames = lines
    .map((l) => (l.services as { name?: string } | undefined)?.name)
    .filter(Boolean)
    .join(" ");
  return `${customerLabel(customer as Parameters<typeof customerLabel>[0])} ${svcNames}`.toLowerCase();
}

function customersFromAppointments(rows: Record<string, unknown>[]): any[] {
  const map = new Map<string, any>();
  for (const a of rows) {
    const id = a.customer_id ?? (a.customer as { id?: unknown } | undefined)?.id;
    if (id == null || id === "") continue;
    const key = String(id);
    if (map.has(key)) continue;
    const c =
      (a.customer as Record<string, unknown> | undefined) ??
      (a.customers as Record<string, unknown> | undefined);
    if (!c) continue;
    map.set(key, {
      ...c,
      id,
      name: customerLabel(c as Parameters<typeof customerLabel>[0]),
    });
  }
  return Array.from(map.values());
}

export default function SearchPalette({
  onSelectAppointment,
  onSelectCustomer,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const supabase = useMemo(() => createClient(), []);
  const { activeSalonId, isReady } = useActiveSalon();

  const [results, setResults] = useState<any[]>([]);
  const [index, setIndex] = useState(0);

  const [customers, setCustomers] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }

      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const loadAll = useCallback(
    async (salonId: number) => {
      setLoadError(null);

      const { data: apptRows, error: apptErr } = await supabase
        .from("appointments")
        .select(AGENDA_LIST_SELECT)
        .eq("salon_id", salonId)
        .order("start_time", { ascending: false })
        .limit(500);

      if (apptErr) {
        setLoadError(apptErr.message);
        setCustomers([]);
        setAppointments([]);
        setServices([]);
        setStaff([]);
        return;
      }

      const appts = (apptRows ?? []) as Record<string, unknown>[];
      setAppointments(appts);
      setCustomers(customersFromAppointments(appts));

      const { data: svcRows, error: svcErr } = await supabase
        .from("services")
        .select("id, name")
        .eq("active", true)
        .eq("visible_in_agenda", true)
        .order("name");

      if (svcErr) {
        setLoadError(svcErr.message);
        setServices([]);
      } else {
        setServices(svcRows ?? []);
      }

      try {
        const st = await fetchActiveStaffForSalon(supabase, salonId, "id, name");
        setStaff(st);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Errore caricamento staff");
        setStaff([]);
      }
    },
    [supabase]
  );

  useEffect(() => {
    if (!isReady || activeSalonId == null) {
      setCustomers([]);
      setAppointments([]);
      setServices([]);
      setStaff([]);
      setResults([]);
      setLoadError(null);
      return;
    }
    void loadAll(activeSalonId);
  }, [isReady, activeSalonId, loadAll]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    if (!isReady || activeSalonId == null) {
      setResults([]);
      return;
    }

    const q = query.toLowerCase();

    const foundCustomers = customers
      .filter((c) => customerLabel(c).toLowerCase().includes(q))
      .map((c) => ({ type: "customer", ...c }));

    const foundAppointments = appointments
      .filter((a) => appointmentSearchText(a).includes(q))
      .map((a) => ({ type: "appointment", ...a }));

    const foundServices = services
      .filter((s) => String(s.name ?? "").toLowerCase().includes(q))
      .map((s) => ({ type: "service", ...s }));

    const foundStaff = staff
      .filter((s) => String(s.name ?? "").toLowerCase().includes(q))
      .map((s) => ({ type: "staff", ...s }));

    setResults([
      ...foundCustomers,
      ...foundAppointments,
      ...foundServices,
      ...foundStaff,
    ]);

    setIndex(0);
  }, [query, customers, appointments, services, staff, isReady, activeSalonId]);

  function handleSelect(item: any) {
    if (item.type === "appointment" && onSelectAppointment) {
      onSelectAppointment(item);
    }
    if (item.type === "customer" && onSelectCustomer) {
      onSelectCustomer(item);
    }
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => (i + 1 < results.length ? i + 1 : i));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => (i - 1 >= 0 ? i - 1 : i));
    }
    if (e.key === "Enter" && results[index]) {
      handleSelect(results[index]);
    }
  }

  if (!open) return null;

  const salonUnavailable = isReady && activeSalonId == null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-start justify-center pt-[10vh]">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl bg-[#1c0f0a] 
        border border-[#9b6b43]/40 rounded-2xl shadow-xl overflow-hidden"
      >
        <div className="p-4 border-b border-[#3a251a]">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Cerca clienti, appuntamenti, servizi..."
            disabled={salonUnavailable}
            className="w-full bg-[#3a251a] p-4 text-white text-lg rounded-xl outline-none disabled:opacity-50"
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {salonUnavailable && (
            <div className="text-center text-white/50 py-6">
              Salone non disponibile per la ricerca
            </div>
          )}

          {!salonUnavailable && loadError && (
            <div className="text-center text-red-300/80 py-6 px-4 text-sm">{loadError}</div>
          )}

          {!salonUnavailable && !loadError && results.length === 0 && (
            <div className="text-center text-white/50 py-6">
              Nessun risultato
            </div>
          )}

          {!salonUnavailable &&
            results.map((item, i) => {
              const apptCustomer =
                item.type === "appointment"
                  ? customerLabel(item.customer ?? item.customers)
                  : "";
              const apptService =
                item.type === "appointment"
                  ? (
                      (item.appointment_services as Array<{ services?: { name?: string } }>)?.[0]
                        ?.services?.name ?? "Servizio"
                    )
                  : "";

              return (
                <div
                  key={`${item.type}-${item.id}`}
                  onClick={() => handleSelect(item)}
                  className={`p-4 cursor-pointer border-b border-[#3a251a] ${
                    i === index ? "bg-[#d8a471] text-black" : "text-white"
                  }`}
                >
                  <div className="font-semibold">
                    {item.type === "customer" && `👤 Cliente: ${customerLabel(item)}`}
                    {item.type === "appointment" &&
                      `📅 Appuntamento: ${apptCustomer} — ${apptService}`}
                    {item.type === "service" && `✂️ Servizio: ${item.name}`}
                    {item.type === "staff" && `🧑‍💼 Collaboratore: ${item.name}`}
                  </div>

                  {item.type === "appointment" && item.start_time && (
                    <div className="text-sm opacity-70">
                      {String(item.start_time).replace("T", " ").slice(0, 16)}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </motion.div>
    </div>
  );
}
