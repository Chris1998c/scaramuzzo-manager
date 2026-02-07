"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { Save } from "lucide-react";

type Profile = {
  customer_id: string;
  texture: "straight" | "wavy" | "curly" | "coily" | null;
  thickness: "fine" | "normal" | "thick" | null;
  density: "low" | "medium" | "high" | null;
  porosity: "low" | "medium" | "high" | null;
  elasticity: "low" | "normal" | "high" | null;
  scalp: "dry" | "normal" | "oily" | "sensitive" | null;
  frizz_level: "low" | "medium" | "high" | null;
  baseline_level: number | null;
  allergies: string | null;
  notes: string | null;
};

const chip = "px-3 py-1 rounded-full border border-[#5c3a21]/60 bg-black/10 text-xs text-[#f3d8b6]/75";

export default function ClienteProfile({ customerId }: { customerId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [profile, setProfile] = useState<Profile>({
    customer_id: customerId,
    texture: null,
    thickness: null,
    density: null,
    porosity: null,
    elasticity: null,
    scalp: null,
    frizz_level: null,
    baseline_level: null,
    allergies: null,
    notes: null,
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("customer_profile")
        .select("*")
        .eq("customer_id", customerId)
        .maybeSingle();

      if (!cancelled) {
        if (data) setProfile(data as Profile);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [customerId, supabase]);

  async function save() {
    setMsg("");
    setSaving(true);

    const payload = {
      ...profile,
      baseline_level:
        profile.baseline_level === null || profile.baseline_level === ("" as any)
          ? null
          : Number(profile.baseline_level),
    };

    const { error } = await supabase
      .from("customer_profile")
      .upsert(payload, { onConflict: "customer_id" });

    if (error) setMsg(error.message);
    else setMsg("Salvato ✅");

    setSaving(false);
    setTimeout(() => setMsg(""), 1500);
  }

  return (
    <div className="rounded-3xl bg-[#24140e]/70 border border-[#5c3a21]/60 p-6 backdrop-blur-md shadow-[0_0_50px_rgba(0,0,0,0.18)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-[#f3d8b6]">Profilo capelli</h2>
          <p className="text-sm text-[#c9b299] mt-1">
            Si compila una volta e guida tutte le schede.
          </p>
        </div>

        <span className={chip}>{loading ? "Carico…" : "Profilo"}</span>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select
          label="Forma"
          value={profile.texture ?? ""}
          onChange={(v) => setProfile((p) => ({ ...p, texture: (v || null) as any }))}
          options={[
            ["", "—"],
            ["straight", "Lisci"],
            ["wavy", "Mossi"],
            ["curly", "Ricci"],
            ["coily", "Crespi / Afro"],
          ]}
        />
        <Select
          label="Spessore fusto"
          value={profile.thickness ?? ""}
          onChange={(v) => setProfile((p) => ({ ...p, thickness: (v || null) as any }))}
          options={[
            ["", "—"],
            ["fine", "Sottile"],
            ["normal", "Normale"],
            ["thick", "Grosso"],
          ]}
        />
        <Select
          label="Densità"
          value={profile.density ?? ""}
          onChange={(v) => setProfile((p) => ({ ...p, density: (v || null) as any }))}
          options={[
            ["", "—"],
            ["low", "Bassa"],
            ["medium", "Media"],
            ["high", "Alta"],
          ]}
        />
        <Select
          label="Porosità"
          value={profile.porosity ?? ""}
          onChange={(v) => setProfile((p) => ({ ...p, porosity: (v || null) as any }))}
          options={[
            ["", "—"],
            ["low", "Bassa"],
            ["medium", "Media"],
            ["high", "Alta"],
          ]}
        />

        <Select
          label="Elasticità"
          value={profile.elasticity ?? ""}
          onChange={(v) => setProfile((p) => ({ ...p, elasticity: (v || null) as any }))}
          options={[
            ["", "—"],
            ["low", "Bassa"],
            ["normal", "Normale"],
            ["high", "Alta"],
          ]}
        />
        <Select
          label="Cute"
          value={profile.scalp ?? ""}
          onChange={(v) => setProfile((p) => ({ ...p, scalp: (v || null) as any }))}
          options={[
            ["", "—"],
            ["dry", "Secca"],
            ["normal", "Normale"],
            ["oily", "Grassa"],
            ["sensitive", "Sensibile"],
          ]}
        />

        <Select
          label="Crespo"
          value={profile.frizz_level ?? ""}
          onChange={(v) => setProfile((p) => ({ ...p, frizz_level: (v || null) as any }))}
          options={[
            ["", "—"],
            ["low", "Basso"],
            ["medium", "Medio"],
            ["high", "Alto"],
          ]}
        />

        <div>
          <label className="text-xs text-[#f3d8b6]/70">Base naturale (1–10)</label>
          <input
            type="number"
            min={1}
            max={10}
            value={profile.baseline_level ?? ""}
            onChange={(e) =>
              setProfile((p) => ({ ...p, baseline_level: e.target.value ? Number(e.target.value) : null }))
            }
            className="mt-1 w-full rounded-xl bg-[#1c0f0a] border border-[#5c3a21]/60
              px-4 py-3 text-sm text-white placeholder:text-white/35
              focus:outline-none focus:ring-2 focus:ring-[#f3d8b6]/30"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs text-[#f3d8b6]/70">Allergie / sensibilità</label>
          <input
            value={profile.allergies ?? ""}
            onChange={(e) => setProfile((p) => ({ ...p, allergies: e.target.value || null }))}
            className="mt-1 w-full rounded-xl bg-[#1c0f0a] border border-[#5c3a21]/60
              px-4 py-3 text-sm text-white placeholder:text-white/35
              focus:outline-none focus:ring-2 focus:ring-[#f3d8b6]/30"
            placeholder="es. Nichel, PPD, profumi..."
          />
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs text-[#f3d8b6]/70">Note generali</label>
          <textarea
            rows={3}
            value={profile.notes ?? ""}
            onChange={(e) => setProfile((p) => ({ ...p, notes: e.target.value || null }))}
            className="mt-1 w-full rounded-xl bg-[#1c0f0a] border border-[#5c3a21]/60
              px-4 py-3 text-sm text-white placeholder:text-white/35
              focus:outline-none focus:ring-2 focus:ring-[#f3d8b6]/30"
            placeholder="abitudini, routine, obiettivi..."
          />
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3
          bg-[#f3d8b6] text-black font-semibold hover:brightness-110 disabled:opacity-50 transition"
      >
        <Save size={18} />
        {saving ? "Salvataggio…" : "Salva profilo"}
      </button>

      {msg && <div className="mt-3 text-sm text-[#c9b299]">{msg}</div>}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <div>
      <label className="text-xs text-[#f3d8b6]/70">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl bg-[#1c0f0a] border border-[#5c3a21]/60
          px-4 py-3 text-sm text-white
          focus:outline-none focus:ring-2 focus:ring-[#f3d8b6]/30"
      >
        {options.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
}
