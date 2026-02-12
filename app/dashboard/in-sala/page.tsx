"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";

export default function InSalaPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { activeSalonId, isReady } = useActiveSalon();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string>("");

  async function load() {
    if (!activeSalonId) return;

    setLoading(true);
    setErr("");

    const { data, error } = await supabase
      .from("appointments")
      .select(
        "id, start_time, end_time, status, notes, customers(id, first_name, last_name), staff(id, name)"
      )
      .eq("salon_id", Number(activeSalonId))
      .eq("status", "in_sala")
      .order("start_time", { ascending: true });

    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }
    setRows(data || []);
  }

  useEffect(() => {
    if (!isReady) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, activeSalonId]);

  if (!isReady) return null;

  return (
    <div className="p-6 text-white">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-[#f3d8b6]">IN SALA</h1>
          <p className="text-white/50 text-sm">Appuntamenti attualmente in sala</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => router.push("/dashboard/agenda")}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
          >
            ← Agenda
          </button>
          <button
            onClick={load}
            className="rounded-xl bg-[#f3d8b6] px-4 py-2 text-sm font-bold text-black hover:opacity-90"
          >
            Aggiorna
          </button>
        </div>
      </div>

      {err && (
        <div className="mb-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">
          {err}
        </div>
      )}

      {loading ? (
        <div className="text-white/60 text-sm">Caricamento...</div>
      ) : rows.length === 0 ? (
        <div className="text-white/60 text-sm">Nessun appuntamento in sala.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((a) => {
            const customer = a?.customers
              ? `${a.customers.first_name ?? ""} ${a.customers.last_name ?? ""}`.trim()
              : "Cliente";
            const staff = a?.staff?.name ? String(a.staff.name) : "—";
            const start = String(a.start_time || "").slice(11, 16);
            const end = String(a.end_time || "").slice(11, 16);

            return (
              <div
                key={a.id}
                className="rounded-2xl border border-white/10 bg-black/20 p-4 flex items-center justify-between"
              >
                <div className="min-w-0">
                  <div className="text-[#f3d8b6] font-extrabold truncate">{customer}</div>
                  <div className="text-white/60 text-xs mt-0.5">
                    {start}–{end} · Operatore: {staff}
                  </div>
                  {a?.notes && (
                    <div className="text-white/40 text-xs mt-1 line-clamp-1 italic">
                      {a.notes}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => router.push(`/dashboard/cassa/${a.id}`)}
                    className="rounded-xl bg-[#f3d8b6] px-3 py-2 text-xs font-bold text-black hover:opacity-90"
                  >
                    Vai in cassa
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
