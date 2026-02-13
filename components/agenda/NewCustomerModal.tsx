"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { motion } from "framer-motion";
import { X, UserPlus, Phone, Mail, User } from "lucide-react";

interface Props {
  isOpen: boolean;
  close: () => void;
  onCreated: (newCustomer: any) => void;
}

/**
 * Normalizza telefono in modo coerente:
 * - rimuove spazi, trattini, parentesi, punti
 * - mantiene solo + e cifre
 * - se inizia con 00 -> + (es. 0039 -> +39)
 */
function normalizePhone(raw: string) {
  let s = String(raw || "").trim();
  s = s.replace(/[()\s.-]/g, "");
  s = s.replace(/[^0-9+]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  // evita + multipli tipo ++
  s = s.replace(/\++/g, "+");
  return s;
}

function normalizeEmail(raw: string) {
  const s = String(raw || "").trim().toLowerCase();
  return s || "";
}

export default function NewCustomerModal({ isOpen, close, onCreated }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // reset + focus
  useEffect(() => {
    if (!isOpen) return;
    setFirstName("");
    setLastName("");
    setPhone("");
    setEmail("");
    setError("");
    setSaving(false);

    // focus dopo paint
    const t = setTimeout(() => firstInputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [isOpen]);

  // ESC per chiudere
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "enter") {
        void saveCustomer();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, firstName, lastName, phone, email, saving]);

  async function saveCustomer() {
    if (saving) return;

    setError("");

    const fn = firstName.trim();
    const ln = lastName.trim();
    const ph = normalizePhone(phone);
    const em = normalizeEmail(email);

    if (!fn) return setError("Il nome è obbligatorio.");
    if (!ln) return setError("Il cognome è obbligatorio.");
    if (!ph) return setError("Il telefono è obbligatorio.");

    // validazione base telefono: almeno 7 cifre (oltre al +)
    const digits = ph.replace(/\D/g, "");
    if (digits.length < 7) return setError("Telefono non valido.");

    // validazione base email (se presente)
    if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      return setError("Email non valida.");
    }

    setSaving(true);

    try {
      // dup check telefono normalizzato
      const { data: dup, error: dupErr } = await supabase
        .from("customers")
        .select("id")
        .eq("phone", ph)
        .maybeSingle();

      if (dupErr) throw dupErr;
      if (dup?.id) {
        setError("Esiste già un cliente con questo numero.");
        setSaving(false);
        return;
      }

      const { data, error: dbError } = await supabase
        .from("customers")
        .insert({
          first_name: fn,
          last_name: ln,
          phone: ph,
          email: em || null,
        })
        .select("*")
        .single();

      if (dbError || !data) throw dbError ?? new Error("Insert failed");

      onCreated(data);
      close();
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Errore durante il salvataggio.");
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[180] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
      onMouseDown={(e) => {
        // click fuori = chiudi
        if (e.target === e.currentTarget) close();
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-lg rounded-3xl border border-[#5c3a21]/60 bg-[#140b07]/85
                   shadow-[0_30px_90px_rgba(0,0,0,0.55)] overflow-hidden text-white"
      >
        {/* header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-[#5c3a21]/50">
          <div className="min-w-0">
            <div className="text-xs text-[#f3d8b6]/70 tracking-wide">Anagrafica</div>
            <h2 className="text-2xl font-extrabold text-[#f3d8b6] tracking-tight mt-1">
              Nuovo Cliente
            </h2>
            <p className="text-sm text-[#c9b299] mt-2">
              Inserisci i dati essenziali. Il telefono viene controllato per evitare duplicati.
            </p>
            <p className="text-[11px] text-white/35 mt-2">
              Tip: <span className="text-white/50">Ctrl/⌘ + Invio</span> per salvare •{" "}
              <span className="text-white/50">Esc</span> per chiudere
            </p>
          </div>

          <button
            onClick={close}
            disabled={saving}
            className="rounded-2xl p-2 bg-black/25 border border-white/10 text-white/70
                       hover:bg-black/35 transition disabled:opacity-50"
            aria-label="Chiudi"
            title="Chiudi"
          >
            <X size={18} />
          </button>
        </div>

        {/* body */}
        <div className="px-6 py-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field
              label="Nome"
              icon={<User size={16} className="text-[#f3d8b6]/80" />}
              value={firstName}
              onChange={setFirstName}
              placeholder="Es: Maria"
              disabled={saving}
              inputMode="text"
              inputRef={firstInputRef}
              onEnter={saveCustomer}
            />
            <Field
              label="Cognome"
              icon={<User size={16} className="text-[#f3d8b6]/80" />}
              value={lastName}
              onChange={setLastName}
              placeholder="Es: Rossi"
              disabled={saving}
              inputMode="text"
              onEnter={saveCustomer}
            />
          </div>

          <Field
            label="Telefono"
            icon={<Phone size={16} className="text-[#f3d8b6]/80" />}
            value={phone}
            onChange={setPhone}
            placeholder="Es: +39 3331234567"
            disabled={saving}
            inputMode="tel"
            onEnter={saveCustomer}
          />

          <Field
            label="Email (opzionale)"
            icon={<Mail size={16} className="text-[#f3d8b6]/80" />}
            value={email}
            onChange={setEmail}
            placeholder="Es: cliente@email.com"
            disabled={saving}
            inputMode="email"
            onEnter={saveCustomer}
          />

          {error && (
            <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={() => void saveCustomer()}
              disabled={saving}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-6 py-3
                         bg-[#f3d8b6] text-[#1A0F0A] font-extrabold
                         shadow-[0_10px_35px_rgba(243,216,182,0.20)]
                         hover:brightness-110 transition disabled:opacity-60"
            >
              {saving ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-black/25 border-t-black animate-spin" />
                  Salvataggio…
                </span>
              ) : (
                <>
                  <UserPlus size={18} />
                  Salva cliente
                </>
              )}
            </button>

            <button
              onClick={close}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-2xl px-6 py-3
                         bg-black/20 border border-[#5c3a21]/60 text-[#f3d8b6]
                         hover:bg-black/30 transition disabled:opacity-50"
            >
              Annulla
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Field({
  label,
  icon,
  value,
  onChange,
  placeholder,
  disabled,
  inputMode,
  inputRef,
  onEnter,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onEnter?: () => void;
}) {
  return (
    <div>
      <div className="text-xs text-[#f3d8b6]/70">{label}</div>
      <div className="mt-1 flex items-center gap-2 rounded-2xl bg-black/20 border border-[#5c3a21]/60 px-4 py-3">
        <div className="shrink-0">{icon}</div>
        <input
          ref={inputRef as any}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onEnter?.();
          }}
          placeholder={placeholder}
          disabled={disabled}
          inputMode={inputMode}
          className="w-full bg-transparent outline-none text-sm text-white placeholder:text-white/35"
        />
      </div>
    </div>
  );
}
