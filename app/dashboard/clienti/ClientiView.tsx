"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { Plus, Search, X, Users, Download } from "lucide-react";

type Customer = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  address: string | null;
  notes: string | null;
};

export default function ClientiView({ initial }: { initial: Customer[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>(initial);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    address: "",
  });

  const filtered = customers.filter((c) => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return (
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q) ||
      c.phone.includes(q)
    );
  });

  function exportCSV() {
    const headers = ["Nome", "Cognome", "Telefono", "Indirizzo"];
    const rows = customers.map((c) => [
      c.first_name,
      c.last_name,
      c.phone,
      c.address ?? "",
    ]);

    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "clienti_scaramuzzo.csv";
    a.click();

    URL.revokeObjectURL(url);
  }

  async function saveCustomer() {
    setError("");

    if (!form.first_name.trim() || !form.last_name.trim() || !form.phone.trim()) {
      setError("Nome, cognome e telefono sono obbligatori.");
      return;
    }

    setSaving(true);

    const { data, error } = await supabase
      .from("customers")
      .insert({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim() ? form.address.trim() : null,
      })
      .select("id, first_name, last_name, phone, address, notes")
      .single();
    setCustomers(prev =>

      [data as Customer, ...prev].sort((a, b) =>
        (a.last_name || "").localeCompare(b.last_name || "", "it")
      )

    );
    setCustomers(prev =>
      [data as Customer, ...prev].sort((a, b) =>
        (a.last_name || "").localeCompare(b.last_name || "", "it")
      )
    );

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("duplicate") || msg.includes("unique")) {
        setError("Esiste già un cliente con questo numero di telefono.");
      } else {
        setError(error.message);
      }
      setSaving(false);
      return;
    }

    setCustomers((prev) => [data as Customer, ...prev]);
    setOpen(false);
    setForm({ first_name: "", last_name: "", phone: "", address: "" });
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      {/* TOP BAR */}
      <div className="flex flex-col xl:flex-row gap-4 xl:items-center xl:justify-between">
        <div className="relative max-w-xl w-full">
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca per nome, cognome o telefono…"
            className="w-full rounded-2xl bg-[#24140e]/70 border border-[#5c3a21]/60
              pl-11 pr-4 py-3 text-sm text-white placeholder:text-white/40
              backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-[#f3d8b6]/30"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={exportCSV}
            className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3
              border border-[#5c3a21]/60 text-[#f3d8b6]
              hover:bg-white/5 transition"
          >
            <Download size={18} />
            Esporta CSV
          </button>

          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3
              bg-[#f3d8b6] text-black font-semibold
              shadow-[0_10px_35px_rgba(243,216,182,0.25)]
              hover:brightness-110 transition"
          >
            <Plus size={18} />
            Nuovo cliente
          </button>
        </div>
      </div>

      {/* GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-5">
        {filtered.map((c) => (
          <Link
            key={c.id}
            href={`/dashboard/clienti/${c.id}`}
            className="group block rounded-3xl p-6
              bg-[#24140e]/70 border border-[#5c3a21]/60 backdrop-blur-md
              shadow-[0_0_40px_rgba(0,0,0,0.18)]
              hover:border-[#f3d8b6]/60 hover:shadow-[0_0_60px_rgba(243,216,182,0.12)]
              hover:-translate-y-0.5 transition"
          >
            <div className="flex items-start gap-4">
              <div className="rounded-2xl p-3 bg-black/20 border border-[#5c3a21]/60">
                <Users className="text-[#f3d8b6]" size={24} />
              </div>

              <div className="min-w-0">
                <div className="text-lg font-extrabold text-[#f3d8b6] tracking-tight">
                  {c.first_name} {c.last_name}
                </div>
                <div className="text-sm text-[#c9b299] mt-1">📞 {c.phone}</div>
                {c.address && (
                  <div className="text-xs text-[#c9b299]/80 mt-1 truncate">
                    📍 {c.address}
                  </div>
                )}

                <div className="mt-4 text-xs text-[#f3d8b6]/60 opacity-0 group-hover:opacity-100 transition">
                  Apri scheda cliente →
                </div>
              </div>
            </div>
          </Link>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full text-center text-white/60 py-16">
            Nessun cliente trovato.
          </div>
        )}
      </div>

      {/* MODAL NEW */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-[#24140e] border border-[#5c3a21]/60 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-extrabold text-[#f3d8b6]">
                Nuovo cliente
              </h3>
              <button onClick={() => setOpen(false)}>
                <X className="text-white/60 hover:text-white" />
              </button>
            </div>

            <div className="space-y-3">
              <input
                placeholder="Nome *"
                className="w-full rounded-xl bg-[#1c0f0a] border border-[#5c3a21]/60 px-4 py-3 text-sm text-white placeholder:text-white/40
                  focus:outline-none focus:ring-2 focus:ring-[#f3d8b6]/30"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              />
              <input
                placeholder="Cognome *"
                className="w-full rounded-xl bg-[#1c0f0a] border border-[#5c3a21]/60 px-4 py-3 text-sm text-white placeholder:text-white/40
                  focus:outline-none focus:ring-2 focus:ring-[#f3d8b6]/30"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              />
              <input
                placeholder="Telefono *"
                className="w-full rounded-xl bg-[#1c0f0a] border border-[#5c3a21]/60 px-4 py-3 text-sm text-white placeholder:text-white/40
                  focus:outline-none focus:ring-2 focus:ring-[#f3d8b6]/30"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              <input
                placeholder="Indirizzo"
                className="w-full rounded-xl bg-[#1c0f0a] border border-[#5c3a21]/60 px-4 py-3 text-sm text-white placeholder:text-white/40
                  focus:outline-none focus:ring-2 focus:ring-[#f3d8b6]/30"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />

              {error && <div className="text-sm text-red-400">{error}</div>}

              <button
                onClick={saveCustomer}
                disabled={saving}
                className="w-full mt-4 rounded-xl bg-[#f3d8b6] text-black py-3 font-semibold
                  hover:brightness-110 disabled:opacity-50"
              >
                {saving ? "Salvataggio…" : "Salva cliente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
