"use client";

import { useMemo, useRef, useState } from "react";
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
  marketing_whatsapp_opt_in: boolean;
  marketing_consent_at: string | null;
};

type Props = { initial: ClienteAnagraficaInitial };

function formatConsentAt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Rome",
  }).format(d);
}

export default function ClienteAnagraficaForm({ initial }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [form, setForm] = useState(initial);
  const lastSavedOptInRef = useRef(initial.marketing_whatsapp_opt_in);
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

    const prevOptIn = lastSavedOptInRef.current;
    let nextConsentAt: string | null = form.marketing_consent_at;

    if (form.marketing_whatsapp_opt_in) {
      if (!prevOptIn || !form.marketing_consent_at) {
        nextConsentAt = new Date().toISOString();
      } else {
        nextConsentAt = form.marketing_consent_at;
      }
    } else {
      nextConsentAt = form.marketing_consent_at;
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
          marketing_whatsapp_opt_in: form.marketing_whatsapp_opt_in,
          marketing_consent_at: nextConsentAt,
        })
        .eq("id", initial.id)
        .select(
          "id, customer_code, first_name, last_name, phone, email, address, notes, marketing_whatsapp_opt_in, marketing_consent_at",
        )
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
        const row = data as {
          id: string;
          customer_code: string;
          first_name: string;
          last_name: string;
          phone: string;
          email: string | null;
          address: string | null;
          notes: string | null;
          marketing_whatsapp_opt_in: boolean;
          marketing_consent_at: string | null;
        };
        setForm({
          id: String(row.id),
          customer_code: String(row.customer_code),
          first_name: String(row.first_name),
          last_name: String(row.last_name),
          phone: String(row.phone),
          email: row.email ?? null,
          address: row.address ?? null,
          notes: row.notes ?? null,
          marketing_whatsapp_opt_in: !!row.marketing_whatsapp_opt_in,
          marketing_consent_at: row.marketing_consent_at,
        });
        lastSavedOptInRef.current = !!row.marketing_whatsapp_opt_in;
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

        <div className="md:col-span-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4 space-y-3">
          <div className="text-sm font-bold text-[#f3d8b6]">Consenso marketing WhatsApp</div>
          <p className="text-xs text-[#c9b299]/90 leading-relaxed">
            Solo con questo consenso attivo il cliente può ricevere messaggi promozionali o di
            riattivazione inviati dalla console WhatsApp manuale (messaggi liberi oltre ai reminder
            automatici di appuntamento).
          </p>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.marketing_whatsapp_opt_in}
              onChange={(e) =>
                setForm((f) => ({ ...f, marketing_whatsapp_opt_in: e.target.checked }))
              }
              className="mt-1 rounded border-[#5c3a21]/60 bg-[#1c0f0a]"
            />
            <span className="text-sm text-[#e8dcc8] leading-snug">
              La cliente ha acconsentito a messaggi WhatsApp con finalità marketing dal salone.
            </span>
          </label>
          {form.marketing_consent_at ? (
            <p className="text-[11px] text-[#c9b299]/80">
              Ultimo riferimento temporale registrato:{" "}
              <span className="font-mono text-[#f3d8b6]/90">
                {formatConsentAt(form.marketing_consent_at)}
              </span>
              {!form.marketing_whatsapp_opt_in ? (
                <span className="block mt-1 text-amber-200/85">
                  Il consenso risulta revocato; la data è mantenuta solo come storico interno.
                </span>
              ) : null}
            </p>
          ) : null}
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
