"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { MAGAZZINO_CENTRALE_ID } from "@/lib/constants";

export default function NuovoProdottoPage() {
  const { role, isReady, activeSalonId, allowedSalons } = useActiveSalon();

  const stockTargetLabel = useMemo(() => {
    if (activeSalonId == null) return null;
    const name = allowedSalons.find((s) => s.id === activeSalonId)?.name ?? null;
    const isHub = activeSalonId === MAGAZZINO_CENTRALE_ID;
    return name
      ? `${name.split(" - ")[0]}${isHub ? " (hub)" : ""} · ID ${activeSalonId}`
      : `Salone ${activeSalonId}`;
  }, [activeSalonId, allowedSalons]);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [barcode, setBarcode] = useState("");
  const [cost, setCost] = useState("");
  const [type, setType] = useState<"rivendita" | "uso-interno" | "store">(
    "rivendita"
  );
  const [initialQty, setInitialQty] = useState("0");
  const [description, setDescription] = useState("");

  async function creaProdotto() {
    if (!name || !category) return;
    if (activeSalonId == null) {
      toast.error("Seleziona il salone di destinazione dall’header (Vista), poi riprova.");
      return;
    }

    const qty = Number(initialQty) || 0;
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
        initialQty: qty,
        initialStockSalonId: activeSalonId,
      }),
    });

    const json = await res.json();

    if (!res.ok) {
      toast.error(json.error || "Errore creazione prodotto");
      return;
    }

    setName("");
    setCategory("");
    setBarcode("");
    setCost("");
    setType("rivendita");
    setInitialQty("0");
    setDescription("");

    toast.success(
      qty > 0 && stockTargetLabel
        ? `Prodotto creato. Giacenza iniziale: ${stockTargetLabel}.`
        : "Prodotto creato.",
    );
  }

  if (!isReady) {
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
      <h1 className="text-3xl font-bold mb-4">Nuovo prodotto</h1>
      {stockTargetLabel ? (
        <p className="text-sm text-white/70 max-w-xl mb-6 leading-relaxed">
          La <strong className="text-[#f3d8b6]">quantità iniziale</strong> (se maggiore di 0) viene
          caricata tramite movimento di stock nel salone selezionato in header{" "}
          <span className="text-white/90 font-semibold">({stockTargetLabel})</span>. Cambia la{" "}
          <strong className="text-white/90">Vista</strong> in alto se ti serve un’altra sede o il
          magazzino centrale.
        </p>
      ) : (
        <p className="text-sm text-amber-200/90 max-w-xl mb-6">
          Seleziona un salone dall’header per definire dove registrare la giacenza iniziale.
        </p>
      )}

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

        <div>
          <label className="block text-sm font-semibold text-[#341A09] mb-2">
            Quantità iniziale ({stockTargetLabel ?? "scegli salone dall’header"})
          </label>
          <input
            type="number"
            min={0}
            className="p-4 w-full rounded-xl border"
            placeholder="0 = nessuna giacenza al momento"
            value={initialQty}
            onChange={(e) => setInitialQty(e.target.value)}
          />
          <p className="mt-1.5 text-xs text-[#5c3a21]/90">
            Viene accreditata sul salone della Vista corrente (vedi testo sopra).
          </p>
        </div>

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
