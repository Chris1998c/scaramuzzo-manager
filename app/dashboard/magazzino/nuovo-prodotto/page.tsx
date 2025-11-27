"use client";

import { useEffect, useState } from "react";

type Role = "salone" | "magazzino" | "coordinator";

export default function NuovoProdottoPage() {
  const [role, setRole] = useState<Role>("salone");
  const [loadingUser, setLoadingUser] = useState(true);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [barcode, setBarcode] = useState("");
  const [cost, setCost] = useState("");
  const [type, setType] = useState<"rivendita" | "uso-interno" | "store">(
    "rivendita"
  );
  const [initialQty, setInitialQty] = useState("0");
  const [description, setDescription] = useState("");

  // ============================
  // USER + RUOLO
  // ============================
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          setRole("salone");
          return;
        }
        const json = await res.json();
        const r: Role = json.user?.user_metadata?.role ?? "salone";
        setRole(r);
      } catch (e) {
        console.error("Errore /api/auth/me", e);
        setRole("salone");
      } finally {
        setLoadingUser(false);
      }
    }

    load();
  }, []);

  // ============================
  // CREA PRODOTTO (via API)
  // ============================
  async function creaProdotto() {
    if (!name || !category) {
      alert("Nome e categoria sono obbligatori");
      return;
    }

    try {
      const res = await fetch("/api/magazzino/nuovo-prodotto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          category,
          barcode,
          cost,
          type,
          description,
          initialQty,
        }),
      });

      const json = await res.json();

      if (!res.ok || json.error) {
        console.error("Errore creazione prodotto", json);
        alert(json.error || "Errore durante la creazione");
        return;
      }

      alert("Prodotto creato con successo!");
      resetForm();
    } catch (e) {
      console.error(e);
      alert("Errore di rete durante la creazione");
    }
  }

  function resetForm() {
    setName("");
    setCategory("");
    setBarcode("");
    setCost("");
    setType("rivendita");
    setInitialQty("0");
    setDescription("");
  }

  // ============================
  // RENDER
  // ============================
  // Attendi caricamento utente
  if (loadingUser) {
    return (
      <div className="min-h-screen px-6 py-10 bg-[#1A0F0A] text-white">
        Verifica permessi…
      </div>
    );
  }

  // SE /api/auth/me non ha trovato user → non autenticato
  if (!role) {
    return (
      <div className="min-h-screen px-6 py-10 bg-[#1A0F0A] text-red-500">
        Utente non autenticato.
      </div>
    );
  }

  // SE NON È coordinator O magazzino
  if (role !== "coordinator" && role !== "magazzino") {
    return (
      <div className="min-h-screen px-6 py-10 bg-[#1A0F0A] text-red-500">
        Non hai i permessi per creare nuovi prodotti.
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-10 bg-[#1A0F0A] text-white">
      <h1 className="text-3xl font-bold mb-8">Nuovo Prodotto</h1>

      <div className="bg-[#FFF9F4] p-8 rounded-2xl shadow-xl text-[#341A09] space-y-6">
        {/* Nome */}
        <div>
          <label className="font-semibold">Nome prodotto *</label>
          <input
            className="mt-2 p-4 w-full rounded-xl border"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Es: Shampoo Purificante"
          />
        </div>

        {/* Categoria */}
        <div>
          <label className="font-semibold">Categoria *</label>
          <input
            className="mt-2 p-4 w-full rounded-xl border"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Es: Shampoo / Maschera / Trattamento"
          />
        </div>

        {/* Barcode */}
        <div>
          <label className="font-semibold">Barcode</label>
          <input
            className="mt-2 p-4 w-full rounded-xl border"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="Codice a barre (opzionale)"
          />
        </div>

        {/* Costo */}
        <div>
          <label className="font-semibold">Costo medio (€)</label>
          <input
            type="number"
            className="mt-2 p-4 w-full rounded-xl border"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="Es: 4.50"
          />
        </div>

        {/* Tipo */}
        <div>
          <label className="font-semibold">Tipo prodotto</label>
          <select
            className="mt-2 p-4 w-full rounded-xl border bg-white"
            value={type}
            onChange={(e) => setType(e.target.value as any)}
          >
            <option value="rivendita">Rivendita</option>
            <option value="uso-interno">Uso interno</option>
            <option value="store">Store</option>
          </select>
        </div>

        {/* Quantità iniziale */}
        <div>
          <label className="font-semibold">
            Quantità iniziale (Magazzino centrale)
          </label>
          <input
            type="number"
            className="mt-2 p-4 w-full rounded-xl border"
            value={initialQty}
            onChange={(e) => setInitialQty(e.target.value)}
          />
        </div>

        {/* Descrizione */}
        <div>
          <label className="font-semibold">Descrizione / Note</label>
          <textarea
            className="mt-2 p-4 w-full rounded-xl border min-h-[120px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Informazioni aggiuntive..."
          />
        </div>

        {/* Bottone */}
        <button
          onClick={creaProdotto}
          className="mt-6 w-full bg-[#0FA958] text-white p-4 rounded-2xl text-xl font-bold shadow-lg hover:scale-105 transition"
        >
          Crea Prodotto
        </button>
      </div>
    </div>
  );
}
