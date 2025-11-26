"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { motion } from "framer-motion";

interface Props {
  isOpen: boolean;
  close: () => void;
  onCreated: (newCustomer: any) => void; // ritorna il cliente creato
}

export default function NewCustomerModal({ isOpen, close, onCreated }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  if (!isOpen) return null;

  async function saveCustomer() {
    setError("");

    if (!name.trim()) {
      setError("Il nome è obbligatorio.");
      return;
    }

    if (!phone.trim()) {
      setError("Il telefono è obbligatorio.");
      return;
    }

    // Controlla duplicati
    const dup = await supabase
      .from("customers")
      .select("*")
      .eq("phone", phone.trim());

    if (dup.data && dup.data.length > 0) {
      setError("Esiste già un cliente con questo numero.");
      return;
    }

    const { data, error: dbError } = await supabase
      .from("customers")
      .insert({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
      })
      .select("*")
      .single();

    if (dbError) {
      setError("Errore durante il salvataggio.");
      return;
    }

    onCreated(data); // aggiorna lista in AgendaModal
    close();
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-[#1c0f0a] p-8 rounded-2xl shadow-xl w-full max-w-md border border-[#9b6b43]/30"
      >
        <h2 className="text-2xl font-semibold text-white mb-6">
          Nuovo Cliente
        </h2>

        {/* NOME */}
        <input
          type="text"
          placeholder="Nome completo"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-3"
        />

        {/* TELEFONO */}
        <input
          type="tel"
          placeholder="Telefono"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-3"
        />

        {/* EMAIL opzionale */}
        <input
          type="email"
          placeholder="Email (opzionale)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-4"
        />

        {/* ERRORI */}
        {error && (
          <div className="text-red-400 text-sm mb-4 text-center">
            {error}
          </div>
        )}

        {/* SALVA */}
        <button
          onClick={saveCustomer}
          className="w-full bg-[#d8a471] text-[#1c0f0a] p-3 rounded-xl font-semibold text-lg mb-4"
        >
          Salva Cliente
        </button>

        {/* ANNULLA */}
        <button
          onClick={close}
          className="w-full text-white/70 text-center"
        >
          Annulla
        </button>
      </motion.div>
    </div>
  );
}
