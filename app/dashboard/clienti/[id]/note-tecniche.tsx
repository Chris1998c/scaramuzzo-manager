"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { Plus } from "lucide-react";

type CardType =
  | "color"
  | "gloss"
  | "lightening"
  | "keratin"
  | "botanicals";

type Card = {
  id: string;
  type: CardType;
  content: string;
  created_at: string;
};

const LABELS: Record<CardType, string> = {
  color: "Colore / Ossidazione",
  gloss: "Gloss / Tonalizzazione",
  lightening: "Schiaritura",
  keratin: "Keratina / Trattamenti",
  botanicals: "Erbe botaniche / Henné",
};

export default function NoteTecniche({ customerId }: { customerId: string }) {
  const supabase = useMemo(() => createClient(), []);

  const [cards, setCards] = useState<Card[]>([]);
  const [type, setType] = useState<CardType | "">("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("customer_technical_cards")
      .select("id, type, content, created_at")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setCards(data ?? []));
  }, [customerId, supabase]);

  async function saveCard() {
    if (!type || !content.trim()) return;

    setSaving(true);

    const { data, error } = await supabase
      .from("customer_technical_cards")
      .insert({
        customer_id: customerId,
        type,
        content,
      })
      .select()
      .single();

    if (!error && data) {
      setCards((prev) => [data, ...prev]);
      setType("");
      setContent("");
    }

    setSaving(false);
  }

  return (
    <div className="space-y-10">
      {/* NUOVA SCHEDA */}
      <div className="rounded-3xl bg-[#24140e]/80 border border-[#5c3a21]/60 p-6 space-y-6">
        <h2 className="text-xl font-extrabold text-[#f3d8b6]">
          Nuova scheda tecnica
        </h2>

        {/* SELECT */}
        <select
          value={type}
          onChange={(e) => setType(e.target.value as CardType)}
          className="w-full rounded-xl bg-[#1c0f0a] border border-[#5c3a21]/60
            px-4 py-3 text-sm text-white
            focus:outline-none focus:ring-2 focus:ring-[#f3d8b6]/40"
        >
          <option value="">Seleziona trattamento…</option>
          {Object.entries(LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        {/* TEXTAREA */}
        {type && (
          <textarea
            rows={5}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={`Inserisci dettagli ${LABELS[type]}…`}
            className="w-full rounded-2xl bg-[#1c0f0a] border border-[#5c3a21]/60
              p-4 text-sm text-white placeholder:text-white/40
              focus:outline-none focus:ring-2 focus:ring-[#f3d8b6]/40"
          />
        )}

        <button
          onClick={saveCard}
          disabled={!type || !content || saving}
          className="inline-flex items-center gap-2 rounded-xl px-6 py-3
            bg-[#f3d8b6] text-black font-semibold
            hover:brightness-110 disabled:opacity-50"
        >
          <Plus size={18} />
          {saving ? "Salvataggio…" : "Salva scheda tecnica"}
        </button>
      </div>

      {/* STORICO */}
      <div className="space-y-6">
        <h3 className="text-lg font-extrabold text-[#f3d8b6]">
          Storico schede tecniche
        </h3>

        {cards.map((c) => (
          <div
            key={c.id}
            className="rounded-3xl bg-black/20 border border-[#5c3a21]/60 p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-[#f3d8b6]">
                {LABELS[c.type]}
              </div>
              <div className="text-xs text-[#f3d8b6]/60">
                {new Date(c.created_at).toLocaleDateString()}
              </div>
            </div>

            <div className="text-sm text-white/90 whitespace-pre-wrap">
              {c.content}
            </div>
          </div>
        ))}

        {cards.length === 0 && (
          <div className="text-sm text-white/50">
            Nessuna scheda tecnica registrata.
          </div>
        )}
      </div>
    </div>
  );
}
