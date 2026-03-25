"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Loader2, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";

export type SalonWhatsAppSettingsRow = {
  salon_id: number;
  is_enabled: boolean;
  phone_number_id: string;
  display_phone: string;
  display_name: string;
  appointment_reminder_enabled?: boolean;
  appointment_reminder_template_name?: string | null;
  appointment_reminder_template_lang?: string | null;
  created_at: string;
  updated_at: string;
};

type Props = {
  salonId: number | null;
  salonLabel: string | null;
  canManage: boolean;
};

export default function CanaliWhatsAppPanel({
  salonId,
  salonLabel,
  canManage,
}: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [isEnabled, setIsEnabled] = useState(false);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [displayPhone, setDisplayPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderTemplateName, setReminderTemplateName] = useState("");
  const [reminderTemplateLang, setReminderTemplateLang] = useState("");

  const load = useCallback(async () => {
    setError(null);
    setOkMsg(null);
    if (salonId == null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: qErr } = await supabase
      .from("salon_whatsapp_settings")
      .select("*")
      .eq("salon_id", salonId)
      .maybeSingle();

    if (qErr) {
      setError(qErr.message);
      setLoading(false);
      return;
    }

    const row = data as SalonWhatsAppSettingsRow | null;
    if (row) {
      setIsEnabled(!!row.is_enabled);
      setPhoneNumberId(row.phone_number_id ?? "");
      setDisplayPhone(row.display_phone ?? "");
      setDisplayName(row.display_name ?? "");
      setReminderEnabled(row.appointment_reminder_enabled !== false);
      setReminderTemplateName(row.appointment_reminder_template_name ?? "");
      setReminderTemplateLang(row.appointment_reminder_template_lang ?? "");
    } else {
      setIsEnabled(false);
      setPhoneNumberId("");
      setDisplayPhone("");
      setDisplayName("");
      setReminderEnabled(true);
      setReminderTemplateName("");
      setReminderTemplateLang("");
    }
    setLoading(false);
  }, [supabase, salonId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOkMsg(null);
    if (salonId == null) return;
    if (!canManage) return;

    setSaving(true);
    const payload = {
      salon_id: salonId,
      is_enabled: isEnabled,
      phone_number_id: phoneNumberId.trim(),
      display_phone: displayPhone.trim(),
      display_name: displayName.trim(),
      appointment_reminder_enabled: reminderEnabled,
      appointment_reminder_template_name: reminderTemplateName.trim()
        ? reminderTemplateName.trim()
        : null,
      appointment_reminder_template_lang: reminderTemplateLang.trim()
        ? reminderTemplateLang.trim()
        : null,
      updated_at: new Date().toISOString(),
    };

    const { error: upErr } = await supabase
      .from("salon_whatsapp_settings")
      .upsert(payload, { onConflict: "salon_id" });

    setSaving(false);
    if (upErr) {
      setError(upErr.message);
      return;
    }
    setOkMsg("Impostazioni salvate.");
    void load();
  }

  if (salonId == null) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-100/90">
        Seleziona un salone dall&apos;header per configurare WhatsApp.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 text-sm text-[#c9b299] leading-relaxed">
        <span className="inline-flex items-center gap-2 font-bold text-emerald-300/95">
          <MessageCircle size={18} className="shrink-0" />
          Canali · WhatsApp
        </span>
        <p className="mt-2">
          Configurazione per salone{" "}
          <strong className="text-[#f3d8b6]">{salonLabel ?? `#${salonId}`}</strong>. Tre concetti
          distinti: <strong className="text-[#f3d8b6]">Meta Phone Number ID</strong> (ID tecnico
          API), <strong className="text-[#f3d8b6]">Numero WhatsApp</strong> (numero reale del
          salone) e <strong className="text-[#f3d8b6]">Display Name</strong> (nome profilo che
          vedono le clienti, soggetto ad approvazione Meta). I token restano solo lato server (nessun
          invio da questa schermata).
        </p>

        <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-xs text-[#c9b299]/90 leading-relaxed">
          <span className="font-bold text-amber-200/95">Chiarezza configurazione</span>
          <div className="mt-1">
            Questo pannello configura il <span className="font-semibold text-[#f3d8b6]">canale WhatsApp del salone</span>.
            <br />
            Il <span className="font-semibold text-[#f3d8b6]">consenso marketing WhatsApp</span> è salvato sulla
            <span className="font-semibold text-[#f3d8b6]"> scheda del singolo cliente</span> e non è gestito qui.
          </div>
        </div>
      </div>

      {!canManage ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-100/90">
          Sola lettura: la modifica è riservata al ruolo <strong>coordinator</strong>.
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200"
        >
          {error}
        </div>
      ) : null}

      {okMsg ? (
        <div className="rounded-xl border border-emerald-500/35 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">
          {okMsg}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[#c9b299]">
          <Loader2 className="animate-spin" size={18} />
          Caricamento…
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#5c3a21]/50 bg-black/20 px-4 py-3">
            <div>
              <div className="text-sm font-bold text-[#f3d8b6]">WhatsApp attivo</div>
              <div className="text-xs text-[#c9b299]/90 mt-0.5">
                Abilita il canale per questo salone (invii futuri useranno questa config).
              </div>
            </div>
            <button
              type="button"
              disabled={!canManage || saving}
              onClick={() => setIsEnabled((v) => !v)}
              className={[
                "relative h-9 w-16 shrink-0 rounded-full transition",
                isEnabled ? "bg-emerald-600" : "bg-white/15",
                !canManage ? "opacity-50 cursor-not-allowed" : "",
              ].join(" ")}
              aria-pressed={isEnabled}
            >
              <span
                className={[
                  "absolute top-1 h-7 w-7 rounded-full bg-white shadow transition-all",
                  isEnabled ? "left-8" : "left-1",
                ].join(" ")}
              />
            </button>
          </div>

          <div className="space-y-2">
            <label htmlFor="wa_phone_number_id" className="text-xs font-bold uppercase tracking-wider text-[#f3d8b6]/80">
              Meta Phone Number ID
            </label>
            <p className="text-[11px] text-[#c9b299]/85 leading-snug">
              Identificativo tecnico del numero WhatsApp in Meta (Graph API), non è un numero da
              chiamare.{" "}
              <span className="text-amber-200/90">Non inserire qui il cellulare come +39…</span>
            </p>
            <input
              id="wa_phone_number_id"
              className="input font-mono text-sm"
              autoComplete="off"
              placeholder="ID da Meta Business Suite → WhatsApp → API"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              disabled={!canManage || saving}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="wa_display_phone" className="text-xs font-bold uppercase tracking-wider text-[#f3d8b6]/80">
              Numero WhatsApp
            </label>
            <p className="text-[11px] text-[#c9b299]/85 leading-snug">
              Il numero di telefono reale collegato all&apos;account WhatsApp Business (formato
              leggibile, es. +39 …).
            </p>
            <input
              id="wa_display_phone"
              className="input"
              autoComplete="off"
              placeholder="es. +39 333 1234567"
              value={displayPhone}
              onChange={(e) => setDisplayPhone(e.target.value)}
              disabled={!canManage || saving}
              type="tel"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="wa_display_name" className="text-xs font-bold uppercase tracking-wider text-[#f3d8b6]/80">
              Nome visibile cliente (Display Name)
            </label>
            <p className="text-[11px] text-[#c9b299]/85 leading-snug">
              Nome mostrato su WhatsApp alle clienti. Deve essere approvato da Meta (es: Scaramuzzo
              Roma).
            </p>
            <input
              id="wa_display_name"
              className="input"
              type="text"
              autoComplete="off"
              dir="auto"
              placeholder="es. Scaramuzzo Roma"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={!canManage || saving}
            />
          </div>

          <div className="rounded-2xl border border-sky-500/25 bg-sky-500/[0.06] px-4 py-3 space-y-4">
            <div className="flex items-start gap-2">
              <Bell size={18} className="shrink-0 text-sky-200/90 mt-0.5" />
              <div className="min-w-0">
                <div className="text-sm font-bold text-sky-100/95">Reminder appuntamenti</div>
                <p className="text-[11px] text-[#c9b299]/90 leading-snug mt-1">
                  Invio automatico ~24h prima (cron). Usa sempre un{" "}
                  <strong className="text-[#e8dcc8]">template approvato su Meta</strong> con gli
                  stessi parametri testo previsti (ordine: nome, data, ora, nome salone). Qui scegli se
                  inviare i reminder per questo salone e quale template usare;{" "}
                  <strong className="text-[#e8dcc8]">non</strong> si scrive testo libero arbitrario.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
              <div>
                <div className="text-xs font-bold text-[#f3d8b6]">Reminder automatico attivo</div>
                <div className="text-[10px] text-[#c9b299]/85 mt-0.5">
                  Disattiva solo i messaggi promesso appuntamento; il canale resta regolato da &quot;WhatsApp
                  attivo&quot; sopra.
                </div>
              </div>
              <button
                type="button"
                disabled={!canManage || saving}
                onClick={() => setReminderEnabled((v) => !v)}
                className={[
                  "relative h-9 w-16 shrink-0 rounded-full transition",
                  reminderEnabled ? "bg-sky-600" : "bg-white/15",
                  !canManage ? "opacity-50 cursor-not-allowed" : "",
                ].join(" ")}
                aria-pressed={reminderEnabled}
              >
                <span
                  className={[
                    "absolute top-1 h-7 w-7 rounded-full bg-white shadow transition-all",
                    reminderEnabled ? "left-8" : "left-1",
                  ].join(" ")}
                />
              </button>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="wa_reminder_template_name"
                className="text-xs font-bold uppercase tracking-wider text-[#f3d8b6]/80"
              >
                Nome template Meta (reminder)
              </label>
              <p className="text-[11px] text-[#c9b299]/85 leading-snug">
                Lasciare vuoto per usare il default ambiente{" "}
                <span className="font-mono text-[10px]">WHATSAPP_APPOINTMENT_REMINDER_TEMPLATE_NAME</span>.
              </p>
              <input
                id="wa_reminder_template_name"
                className="input font-mono text-sm"
                autoComplete="off"
                placeholder="es. appointment_reminder_it"
                value={reminderTemplateName}
                onChange={(e) => setReminderTemplateName(e.target.value)}
                disabled={!canManage || saving}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="wa_reminder_template_lang"
                className="text-xs font-bold uppercase tracking-wider text-[#f3d8b6]/80"
              >
                Lingua template
              </label>
              <p className="text-[11px] text-[#c9b299]/85 leading-snug">
                Codice lingua (es. <span className="font-mono">it</span>). Vuoto = default ambiente.
              </p>
              <input
                id="wa_reminder_template_lang"
                className="input font-mono text-sm max-w-[12rem]"
                autoComplete="off"
                placeholder="it"
                value={reminderTemplateLang}
                onChange={(e) => setReminderTemplateLang(e.target.value)}
                disabled={!canManage || saving}
              />
            </div>

            <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-[11px] text-[#c9b299] leading-relaxed">
              <span className="font-bold text-[#e8dcc8]">Anteprima parametri (esempio)</span>
              <p className="mt-1.5">
                Il messaggio reale è definito dal template su Meta. Al gestionale arrivano solo queste
                variabili, in quest&apos;ordine:
              </p>
              <ul className="mt-2 space-y-1 list-disc pl-4">
                <li>
                  <span className="text-[#f3d8b6]">Nome:</span> Giulia
                </li>
                <li>
                  <span className="text-[#f3d8b6]">Data:</span> 15 marzo 2026
                </li>
                <li>
                  <span className="text-[#f3d8b6]">Ora:</span> 10:30
                </li>
                <li>
                  <span className="text-[#f3d8b6]">Salone:</span>{" "}
                  {displayName.trim() || salonLabel || "Nome salone"}
                </li>
              </ul>
            </div>
          </div>

          {canManage ? (
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0FA958] px-6 py-3 text-sm font-black text-white shadow-lg shadow-emerald-900/25 hover:bg-[#0da052] disabled:opacity-60"
            >
              {saving ? <Loader2 className="animate-spin" size={18} /> : null}
              {saving ? "Salvataggio…" : "Salva impostazioni"}
            </button>
          ) : null}
        </form>
      )}
    </div>
  );
}
