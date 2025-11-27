"use client";

import { useState } from "react";

const SALONI = [
  { id: 0, name: "magazzino" },
  { id: 1, name: "Corigliano" },
  { id: 2, name: "Cosenza" },
  { id: 3, name: "Castrovillari" },
  { id: 4, name: "Roma" },
];

interface SalonSwitcherProps {
  current: number; // FIX 1 → tipo esplicito
}

export default function SalonSwitcher({ current }: SalonSwitcherProps) {
  const [loading, setLoading] = useState(false);

  // FIX 2: tipizzare id come number
  async function changeSalon(id: number) {
    setLoading(true);

    await fetch("/api/switch-salon", {
      method: "POST",
      body: JSON.stringify({ salon_id: id }),
    });

    window.location.reload();
  }

  return (
    <select
      defaultValue={current}
      disabled={loading}
      onChange={(e) => changeSalon(Number(e.target.value))}
      className="bg-[#28170e] text-white px-4 py-2 rounded-xl"
    >
      {SALONI.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
