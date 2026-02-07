"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { motion } from "framer-motion";
import { X, UserPlus, Phone, Mail, User } from "lucide-react";

interface Props {
  isOpen: boolean;
  close: () => void;
  onCreated: (newCustomer: any) => void;
}

function normPhone(v: string) {
  return String(v || "").replace(/\s+/g, "").trim();
}

export default function NewCustomerModal({ isOpen, close, onCreated }: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // ✅ reset ogni volta che si apre
  useEffect(() => {
    if (!isOpen) return;
    setFirstName("");
    setLastName("");
    setPhone("");
    setEmail("");
    setError("");
    setSaving(false);
  }, [isOpen]);

  async function saveCustomer() {
    if (saving) return;

    setError("");

    const fn = firstName.trim();
    const ln = lastName.trim();
    const ph = normPhone(phone);
    const em = email.trim();

    if (!fn) return setError("Il nome è obbligatorio.");
    if (!ln) return setError("Il cognome è obbligatorio.");
    if (!ph) return setError("Il telefono è obbligatorio.");

    setSaving(true);

    // ✅ dup check telefono (pulito)
    const { data: dup, error: dupErr } = await supabase
      .from("customers")
      .select("id")
      .eq("phone", ph)
      .maybeSingle();

    if (dupErr) {
      setError("Errore controllo duplicati: " + dupErr.message);
      setSaving(false);
      return;
    }

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

    if (dbError || !data) {
      setError(dbError?.message || "Errore durante il salvataggio.");
      setSaving(false);
      return;
    }

    onCreated(data);
    setSaving(false);
    close();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
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
            />
            <Field
              label="Cognome"
              icon={<User size={16} className="text-[#f3d8b6]/80" />}
              value={lastName}
              onChange={setLastName}
              placeholder="Es: Rossi"
              disabled={saving}
            />
          </div>

          <Field
            label="Telefono"
            icon={<Phone size={16} className="text-[#f3d8b6]/80" />}
            value={phone}
            onChange={setPhone}
            placeholder="Es: 3331234567"
            disabled={saving}
            inputMode="tel"
          />

          <Field
            label="Email (opzionale)"
            icon={<Mail size={16} className="text-[#f3d8b6]/80" />}
            value={email}
            onChange={setEmail}
            placeholder="Es: cliente@email.com"
            disabled={saving}
            inputMode="email"
          />

          {error && (
            <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={saveCustomer}
              disabled={saving}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-6 py-3
                         bg-[#f3d8b6] text-[#1A0F0A] font-extrabold
                         shadow-[0_10px_35px_rgba(243,216,182,0.20)]
                         hover:brightness-110 transition disabled:opacity-60"
            >
              <UserPlus size={18} />
              {saving ? "Salvataggio…" : "Salva cliente"}
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
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <div>
      <div className="text-xs text-[#f3d8b6]/70">{label}</div>
      <div className="mt-1 flex items-center gap-2 rounded-2xl bg-black/20 border border-[#5c3a21]/60 px-4 py-3">
        <div className="shrink-0">{icon}</div>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          inputMode={inputMode}
          className="w-full bg-transparent outline-none text-sm text-white placeholder:text-white/35"
        />
      </div>
    </div>
  );
}
