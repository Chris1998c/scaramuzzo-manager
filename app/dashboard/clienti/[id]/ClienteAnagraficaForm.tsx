"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { Save } from "lucide-react";

export type ClienteAnagraficaInitial = {
  id: string;
  customer_code: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
};

type Props = { initial: ClienteAnagraficaInitial };

export default function ClienteAnagraficaForm({ initial }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  async function save() {
    setError("");
    setOk(false);
    const fn = form.first_name.trim();
    const ln = form.last_name.trim();
    const ph = form.phone.trim();
    if (!fn || !ln || !ph) {
      setError("Nome, cognome e telefono sono obbligatori.");
      return;
    }

    setSaving(true);
    try {
      const { data, error: upErr } = await supabase
        .from("customers")
        .update({
          first_name: fn,
          last_name: ln,
          phone: ph,
          email: form.email?.trim() ? form.email.trim() : null,
          address: form.address?.trim() ? form.address.trim() : null,
          notes: form.notes?.trim() ? form.notes.trim() : null,
        })
        .eq("id", initial.id)
        .select("id, customer_code, first_name, last_name, phone, email, address, notes")
        .single();

      if (upErr) {
        const msg = upErr.message.toLowerCase();
        if (msg.includes("duplicate") || msg.includes("unique")) {
          setError("Esiste già un altro cliente con questo numero di telefono.");
        } else {
          setError(upErr.message);
        }
        return;
      }

      if (data) {
        setForm({
          id: String(data.id),
          customer_code: String((data as { customer_code: string }).customer_code),
          first_name: String((data as { first_name: string }).first_name),
          last_name: String((data as { last_name: string }).last_name),
          phone: String((data as { phone: string }).phone),
          email: (data as { email: string | null }).email ?? null,
          address: (data as { address: string | null }).address ?? null,
          notes: (data as { notes: string | null }).notes ?? null,
        });
      }
      setOk(true);
      router.refresh();
      setTimeout(() => setOk(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-3xl bg-[#24140e]/70 border border-[#5c3a21]/60 p-6 backdrop-blur-md shadow-[0_0_60px_rgba(0,0,0,0.22)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-[#f3d8b6] tracking-tight">
            Anagrafica
          </h1>
          <p className="text-sm text-[#c9b299] mt-1">
            Codice gestionale fisso; contatti e note modificabili dallo staff.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 bg-[#f3d8b6] text-[#1A0F0A] font-bold text-sm hover:brightness-110 disabled:opacity-50"
        >
          <Save size={18} />
          {saving ? "Salvataggio…" : "Salva anagrafica"}
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[#c9b299]">Codice cliente (non modificabile)</label>
          <input
            readOnly
            value={form.customer_code}
            className="mt-1 w-full rounded-xl bg-black/25 border border-[#5c3a21]/50 px-4 py-3 text-sm font-mono text-[#f3d8b6]/90 cursor-not-allowed"
          />
        </div>
        <div className="hidden md:block" aria-hidden />
        <div>
          <label className="text-xs text-[#c9b299]">Nome *</label>
          <input
            value={form.first_name}
            onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
            className="mt-1 w-full rounded-xl bg-[#1c0f0a] border border-[#5c3a21]/60 px-4 py-3 text-sm text-white"
          />
        </div>
        <div>
          <label className="text-xs text-[#c9b299]">Cognome *</label>
          <input
            value={form.last_name}
            onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
            className="mt-1 w-full rounded-xl bg-[#1c0f0a] border border-[#5c3a21]/60 px-4 py-3 text-sm text-white"
          />
        </div>
        <div>
          <label className="text-xs text-[#c9b299]">Telefono *</label>
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="mt-1 w-full rounded-xl bg-[#1c0f0a] border border-[#5c3a21]/60 px-4 py-3 text-sm text-white"
            inputMode="tel"
          />
        </div>
        <div>
          <label className="text-xs text-[#c9b299]">Email</label>
          <input
            value={form.email ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value || null }))}
            className="mt-1 w-full rounded-xl bg-[#1c0f0a] border border-[#5c3a21]/60 px-4 py-3 text-sm text-white"
            inputMode="email"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-[#c9b299]">Indirizzo</label>
          <input
            value={form.address ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value || null }))}
            className="mt-1 w-full rounded-xl bg-[#1c0f0a] border border-[#5c3a21]/60 px-4 py-3 text-sm text-white"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-[#c9b299]">Note</label>
          <textarea
            value={form.notes ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value || null }))}
            rows={3}
            className="mt-1 w-full rounded-xl bg-[#1c0f0a] border border-[#5c3a21]/60 px-4 py-3 text-sm text-white resize-y min-h-[80px]"
          />
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {ok && (
        <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Anagrafica aggiornata.
        </div>
      )}
    </div>
  );
}
