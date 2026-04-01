"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";

export default function SalonSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeSalonId, setActiveSalonId, canChooseSalon, allowedSalons, isReady } =
    useActiveSalon();

  if (!isReady) return null;

  // ✅ coordinator + magazzino (deciso nel provider)
  if (!canChooseSalon) return null;

  return (
    <select
      value={activeSalonId ?? ""}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (!Number.isFinite(v)) return;
        setActiveSalonId(v);
        if (pathname === "/dashboard") {
          const params = new URLSearchParams(searchParams.toString());
          params.set("salon_id", String(v));
          router.replace(`/dashboard?${params.toString()}`, { scroll: false });
        }
      }}
      className="bg-[#28170e] text-white px-4 py-2 rounded-xl"
    >
      {allowedSalons.length === 0 ? (
        <option value="">Nessun salone</option>
      ) : null}

      {allowedSalons.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
