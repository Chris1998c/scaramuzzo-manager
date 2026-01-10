"use client";

import { Menu, LogOut } from "lucide-react";
import { useUI, MAGAZZINO_CENTRALE_ID } from "@/lib/ui-store";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

type Role = "coordinator" | "magazzino" | "reception" | "cliente" | string;

const SALONI: { id: number; name: string }[] = [
  { id: 1, name: "Corigliano" },
  { id: 2, name: "Cosenza" },
  { id: 3, name: "Castrovillari" },
  { id: 4, name: "Roma" },
];

function getTitleFromPath(pathname: string): string {
  if (pathname === "/dashboard") return "Dashboard";
  if (pathname.startsWith("/dashboard/agenda")) return "Agenda";
  if (pathname === "/dashboard/magazzino") return "Magazzino";
  if (pathname.startsWith("/dashboard/magazzino/inventario")) return "Inventario";
  if (pathname.startsWith("/dashboard/magazzino/carico")) return "Carico";
  if (pathname.startsWith("/dashboard/magazzino/scarico")) return "Scarico";
  if (pathname.startsWith("/dashboard/magazzino/rapida")) return "Scarico rapido";
  if (pathname.startsWith("/dashboard/magazzino/trasferimenti")) return "Trasferimenti";
  if (pathname.startsWith("/dashboard/magazzino/movimenti")) return "Movimenti";
  if (pathname.startsWith("/dashboard/magazzino/nuovo-prodotto")) return "Nuovo prodotto";
  return "Scaramuzzo Manager";
}

export default function Header() {
  const { toggleSidebar, activeSalonId, setActiveSalonId } = useUI();
  const router = useRouter();
  const pathname = usePathname();
  const title = getTitleFromPath(pathname);

  const supabase = useMemo(() => createClient(), []);
  const [role, setRole] = useState<Role>("reception");
  const [userSalonId, setUserSalonId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;

        const meta = data.user?.user_metadata ?? {};
        const r = (meta.role as Role) ?? "reception";
        const sIdRaw = meta.salon_id;
        const sId = Number.isFinite(Number(sIdRaw)) ? Number(sIdRaw) : null;

        if (cancelled) return;

        setRole(r);
        setUserSalonId(sId);

        const isCoord = r === "coordinator" || r === "magazzino";

        // ENFORCEMENT DEFINITIVO:
        // - reception/cliente -> activeSalonId DEVE essere il suo salone
        // - coordinator/magazzino -> activeSalonId sempre valido (default 0 = Magazzino Centrale)
        if (!isCoord) {
          if (sId != null && activeSalonId !== sId) {
            setActiveSalonId(sId);
            router.refresh();
          }
        } else {
          if (!Number.isFinite(activeSalonId)) {
            setActiveSalonId(MAGAZZINO_CENTRALE_ID);
            router.refresh();
          }
        }
      } catch (e) {
        // se non riesco a leggere l’utente, non rompo l’UI
        console.error(e);
      }
    }

    loadUser();
    return () => {
      cancelled = true;
    };
  }, [supabase, activeSalonId, router, setActiveSalonId]);

  const isCoordinator = role === "coordinator" || role === "magazzino";

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  function onChangeSalon(value: string) {
    const v = Number(value);
    setActiveSalonId(Number.isFinite(v) ? v : MAGAZZINO_CENTRALE_ID);
    router.refresh();
  }

  const selectValue = String(
    Number.isFinite(activeSalonId) ? activeSalonId : MAGAZZINO_CENTRALE_ID
  );

  return (
    <header className="w-full h-20 bg-scz-dark border-b border-scz-medium/40 px-4 md:px-8 flex items-center justify-between shadow-premium">
      {/* LEFT */}
      <div className="flex items-center gap-3 md:gap-4 min-w-0">
        <h2 className="text-xl md:text-2xl font-semibold text-white tracking-tight truncate">
          {title}
        </h2>

        {/* SALON SELECT (solo coordinator/magazzino) */}
        {isCoordinator && (
          <div className="hidden md:flex items-center gap-2">
            <span className="text-sm text-white/70">Vista:</span>
            <select
              value={selectValue}
              onChange={(e) => onChangeSalon(e.target.value)}
              className="bg-scz-medium/40 text-white rounded-xl px-4 py-2 outline-none hover:bg-scz-medium/60 transition"
            >
              <option value={MAGAZZINO_CENTRALE_ID}>Magazzino Centrale</option>
              {SALONI.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* badge receptionist */}
        {!isCoordinator && userSalonId != null && (
          <span className="hidden md:inline-flex text-xs text-white/60 bg-scz-medium/30 px-3 py-1 rounded-full">
            Salone: {SALONI.find((s) => s.id === userSalonId)?.name ?? `#${userSalonId}`}
          </span>
        )}
      </div>

      {/* RIGHT */}
      <div className="flex items-center gap-2 md:gap-3">
        <button
          onClick={handleLogout}
          className="p-3 rounded-xl bg-scz-medium/40 hover:bg-scz-medium/60 transition"
          aria-label="Logout"
          title="Logout"
        >
          <LogOut size={22} className="text-white" />
        </button>

        <button
          onClick={toggleSidebar}
          className="p-3 rounded-xl bg-scz-medium/40 hover:bg-scz-medium/60 transition"
          aria-label="Menu"
          title="Menu"
        >
          <Menu size={22} className="text-white" />
        </button>
      </div>
    </header>
  );
}
