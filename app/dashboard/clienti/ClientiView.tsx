"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();

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

  /* =========================
     FILTER
  ========================= */
  const filtered = customers.filter((c) => {
    const q = query.toLowerCase();
    return (
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q) ||
      c.phone.includes(q)
    );
  });

  /* =========================
     EXPORT CSV
  ========================= */
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

  /* =========================
     SAVE CUSTOMER
  ========================= */
  async function saveCustomer() {
    setError("");

    if (!form.first_name || !form.last_name || !form.phone) {
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
        address: form.address || null,
      })
      .select()
      .single();

    if (error) {
      setError(
        error.message.toLowerCase().includes("duplicate")
          ? "Esiste già un cliente con questo numero di telefono."
          : error.message
      );
      setSaving(false);
      return;
    }

    setCustomers((prev) => [data, ...prev]);
    setOpen(false);
    setForm({ first_name: "", last_name: "", phone: "", address: "" });
    setSaving(false);
  }

  /* =========================
     RENDER
  ========================= */
  return (
    <div className="space-y-8">
      {/* SEARCH + ACTIONS */}
      <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
        <div className="relative max-w-md w-full">
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca per nome o telefono…"
            className="w-full rounded-2xl bg-[#24140e]/70 border border-[#5c3a21]/60
              pl-11 pr-4 py-3 text-sm text-white placeholder:text-white/40
              backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-[#f3d8b6]/40"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-2 rounded-2xl px-5 py-3
              border border-[#5c3a21]/60 text-[#f3d8b6]
              hover:bg-white/5 transition"
          >
            <Download size={18} />
            CSV
          </button>

          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-3 rounded-2xl px-5 py-3
              bg-[var(--accent)] text-black font-semibold
              shadow-[0_10px_35px_rgba(216,177,138,0.35)]
              hover:scale-[1.02] transition"
          >
            <Plus size={18} />
            Nuovo cliente
          </button>
        </div>
      </div>

      {/* LIST */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map((c) => (
          <div
            key={c.id}
            onClick={() => router.push(`/dashboard/clienti/${c.id}`)}
            className="group cursor-pointer rounded-3xl p-6
              bg-[#24140e]/70 border border-[#5c3a21]/60 backdrop-blur-md
              shadow-[0_0_40px_rgba(0,0,0,0.18)]
              hover:border-[var(--accent)]
              hover:shadow-[0_0_55px_rgba(216,177,138,0.22)]
              hover:-translate-y-0.5 transition"
          >
            <div className="flex items-start gap-4">
              <div className="rounded-2xl p-3 bg-black/20 border border-[#5c3a21]/60">
                <Users className="text-[#f3d8b6]" size={26} />
              </div>

              <div className="min-w-0">
                <div className="text-lg font-extrabold text-[#f3d8b6] tracking-tight">
                  {c.first_name} {c.last_name}
                </div>
                <div className="text-sm text-[#c9b299] mt-1">
                  📞 {c.phone}
                </div>
                {c.address && (
                  <div className="text-xs text-[#c9b299]/80 mt-1 truncate">
                    📍 {c.address}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 text-xs text-[#f3d8b6]/50">
              Apri scheda cliente →
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full text-center text-white/60 py-20">
            Nessun cliente trovato.
          </div>
        )}
      </div>

      {/* MODAL */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-[#24140e] border border-[#5c3a21]/60 p-6">
            <div className="flex items-center justify-between mb-5">
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
                className="input"
                value={form.first_name}
                onChange={(e) =>
                  setForm({ ...form, first_name: e.target.value })
                }
              />
              <input
                placeholder="Cognome *"
                className="input"
                value={form.last_name}
                onChange={(e) =>
                  setForm({ ...form, last_name: e.target.value })
                }
              />
              <input
                placeholder="Telefono *"
                className="input"
                value={form.phone}
                onChange={(e) =>
                  setForm({ ...form, phone: e.target.value })
                }
              />
              <input
                placeholder="Indirizzo"
                className="input"
                value={form.address}
                onChange={(e) =>
                  setForm({ ...form, address: e.target.value })
                }
              />

              {error && (
                <div className="text-sm text-red-400 pt-2">{error}</div>
              )}

              <button
                onClick={saveCustomer}
                disabled={saving}
                className="w-full mt-5 rounded-xl bg-[var(--accent)] text-black py-3 font-semibold
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
