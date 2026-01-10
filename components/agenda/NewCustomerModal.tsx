"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { motion } from "framer-motion";

interface Props {
  isOpen: boolean;
  close: () => void;
  onCreated: (newCustomer: any) => void;
}

export default function NewCustomerModal({ isOpen, close, onCreated }: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  async function saveCustomer() {
    if (saving) return;

    setError("");

    const phoneNorm = phone.replace(/\s+/g, "").trim();

    if (!firstName.trim()) return setError("Il nome è obbligatorio.");
    if (!lastName.trim()) return setError("Il cognome è obbligatorio.");
    if (!phoneNorm) return setError("Il telefono è obbligatorio.");

    setSaving(true);

    const { data: dupData, error: dupErr } = await supabase
      .from("customers")
      .select("id")
      .eq("phone", phoneNorm)
      .limit(1);

    if (dupErr) {
      setError("Errore controllo duplicati.");
      setSaving(false);
      return;
    }

    if (dupData && dupData.length > 0) {
      setError("Esiste già un cliente con questo numero.");
      setSaving(false);
      return;
    }

    const { data, error: dbError } = await supabase
      .from("customers")
      .insert({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phoneNorm,
        email: email.trim() || null,
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

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-[#1c0f0a] p-8 rounded-2xl shadow-xl w-full max-w-md border border-[#9b6b43]/30"
      >
        <h2 className="text-2xl font-semibold text-white mb-6">Nuovo Cliente</h2>

        <input
          type="text"
          placeholder="Nome"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          disabled={saving}
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-3"
        />

        <input
          type="text"
          placeholder="Cognome"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          disabled={saving}
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-3"
        />

        <input
          type="tel"
          placeholder="Telefono"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={saving}
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-3"
        />

        <input
          type="email"
          placeholder="Email (opzionale)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={saving}
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-4"
        />

        {error && (
          <div className="text-red-400 text-sm mb-4 text-center">{error}</div>
        )}

        <button
          onClick={saveCustomer}
          disabled={saving}
          className={`w-full bg-[#d8a471] text-[#1c0f0a] p-3 rounded-xl font-semibold text-lg mb-4 ${
            saving ? "opacity-70 cursor-not-allowed" : ""
          }`}
        >
          {saving ? "Salvataggio..." : "Salva Cliente"}
        </button>

        <button
          onClick={close}
          disabled={saving}
          className={`w-full text-white/70 text-center ${
            saving ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          Annulla
        </button>
      </motion.div>
    </div>
  );
}
