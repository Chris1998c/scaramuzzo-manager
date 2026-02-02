"use client";

import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";

export default function SalonSwitcher() {
  const { activeSalonId, setActiveSalonId, canChooseSalon, allowedSalons, isReady } = useActiveSalon();

  if (!isReady) return null;
  if (!canChooseSalon) return null; // solo coordinator

  return (
    <select
      value={activeSalonId ?? ""}
      onChange={(e) => setActiveSalonId(Number(e.target.value))}
      className="bg-[#28170e] text-white px-4 py-2 rounded-xl"
    >
      {allowedSalons.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
