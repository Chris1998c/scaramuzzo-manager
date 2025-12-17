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

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/auth/me");
      const json = await res.json();
      setRole(json?.user?.user_metadata?.role ?? "salone");
      setLoadingUser(false);
    };
    load();
  }, []);

  async function creaProdotto() {
    if (!name || !category) return;

    const res = await fetch("/api/magazzino/nuovo-prodotto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        category: category.trim(),
        barcode: barcode || null,
        cost: Number(cost) || 0,
        type,
        description: description || null,
        initialQty: Number(initialQty) || 0,
      }),
    });

    const json = await res.json();

    if (!res.ok) {
      alert(json.error || "Errore creazione prodotto");
      return;
    }

    setName("");
    setCategory("");
    setBarcode("");
    setCost("");
    setType("rivendita");
    setInitialQty("0");
    setDescription("");

    alert("Prodotto creato");
  }

  if (loadingUser) {
    return (
      <div className="min-h-screen px-6 py-10 bg-[#1A0F0A] text-white">
        Caricamento…
      </div>
    );
  }

  if (role !== "magazzino" && role !== "coordinator") {
    return (
      <div className="min-h-screen px-6 py-10 bg-[#1A0F0A] text-red-500">
        Non hai i permessi.
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-10 bg-[#1A0F0A] text-white">
      <h1 className="text-3xl font-bold mb-8">Nuovo Prodotto</h1>

      <div className="bg-[#FFF9F4] p-8 rounded-2xl text-[#341A09] space-y-6 max-w-xl">
        <input
          className="p-4 w-full rounded-xl border"
          placeholder="Nome prodotto"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <input
          className="p-4 w-full rounded-xl border"
          placeholder="Categoria"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />

        <input
          className="p-4 w-full rounded-xl border"
          placeholder="Barcode"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
        />

        <input
          type="number"
          className="p-4 w-full rounded-xl border"
          placeholder="Costo"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
        />

        <select
          className="p-4 w-full rounded-xl border bg-white"
          value={type}
          onChange={(e) => setType(e.target.value as any)}
        >
          <option value="rivendita">Rivendita</option>
          <option value="uso-interno">Uso interno</option>
          <option value="store">Store</option>
        </select>

        <input
          type="number"
          className="p-4 w-full rounded-xl border"
          placeholder="Quantità iniziale"
          value={initialQty}
          onChange={(e) => setInitialQty(e.target.value)}
        />

        <textarea
          className="p-4 w-full rounded-xl border min-h-[120px]"
          placeholder="Descrizione"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <button
          onClick={creaProdotto}
          className="w-full bg-[#0FA958] text-white p-4 rounded-2xl text-xl font-bold"
        >
          Crea Prodotto
        </button>
      </div>
    </div>
  );
}
