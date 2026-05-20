"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabaseClient";
import {
  Plus,
  Sparkles,
  CalendarDays,
  Droplets,
  FlaskConical,
  Leaf,
  Wand2,
  Eraser,
  Archive,
} from "lucide-react";

type ServiceType =
  | "oxidation_color"
  | "gloss"
  | "lightening"
  | "keratin"
  | "botanicals";

type CardRow = {
  id: string;
  customer_id: string;
  service_type: ServiceType;
  data: any; // jsonb { kind, payload, created_local? }
  salon_id: number | null;
  staff_id: number | null;
  appointment_id: number | null;
  created_at: string;
};

type BossLegacyCardData = {
  source?: string;
  original_text?: string;
  legacy_guess?: string;
  confidence?: string;
  legacy_date?: string | null;
  legacy_tipo_nota?: string | null;
  warnings?: string[];
  import_version?: number;
};

type LegacyCardRow = {
  id: string;
  customer_id: string;
  service_type: "legacy_note";
  data: BossLegacyCardData;
  created_at: string;
};

const SERVICE_TYPES: Array<{
  value: ServiceType;
  label: string;
  icon: any;
  hint: string;
}> = [
  {
    value: "oxidation_color",
    label: "Colore + Ossidazione",
    icon: Droplets,
    hint: "Formula, volumi, tempi, R/L/P, correzioni",
  },
  {
    value: "gloss",
    label: "Gloss / Tonalizzazione",
    icon: Wand2,
    hint: "Mix, developer/attivatore, tempi, brillantezza",
  },
  {
    value: "lightening",
    label: "Schiaritura / Decolorazione",
    icon: FlaskConical,
    hint: "Prodotto/tecnica, volumi, tempi, protezioni, tonalizzazione",
  },
  {
    value: "keratin",
    label: "Keratina / Trattamenti",
    icon: Sparkles,
    hint: "Protocollo, passaggi, temperature, maintenance",
  },
  {
    value: "botanicals",
    label: "Erbe botaniche / Henné",
    icon: Leaf,
    hint: "Diretta pre, miscela, posa, calore, risultato, mantenimento",
  },
];

function nowLocalNice(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/** ====== DATA SCHEMA (json payload) ====== */
type BaseFields = {
  rlp?: "radice" | "radice_lunghezze" | "tutto";
  goal?: string;
  outcome?: string;
  general_notes?: string;
};

type OxidationColorData = BaseFields & {
  formula?: string;
  volumes?: string;
  processing_time?: string;
  correction?: string;
};

type GlossData = BaseFields & {
  mix?: string;
  developer?: string;
  processing_time?: string;
};

type LighteningData = BaseFields & {
  product?: string;
  volumes?: string;
  processing_time?: string;
  protection?: string;
  toning?: string;
};

type KeratinData = BaseFields & {
  product?: string;
  steps?: string;
  iron_temp?: string;
  passes?: string;
  aftercare?: string;
};

type BotanicalsData = BaseFields & {
  pre_direct?: string;
  mix?: string;
  heat?: string;
  processing_time?: string;
  rinse?: string;
};

type AnyCardData =
  | { kind: "oxidation_color"; payload: OxidationColorData }
  | { kind: "gloss"; payload: GlossData }
  | { kind: "lightening"; payload: LighteningData }
  | { kind: "keratin"; payload: KeratinData }
  | { kind: "botanicals"; payload: BotanicalsData };

function emptyPayloadFor(type: ServiceType): AnyCardData {
  switch (type) {
    case "oxidation_color":
      return { kind: "oxidation_color", payload: {} };
    case "gloss":
      return { kind: "gloss", payload: {} };
    case "lightening":
      return { kind: "lightening", payload: {} };
    case "keratin":
      return { kind: "keratin", payload: {} };
    case "botanicals":
      return { kind: "botanicals", payload: {} };
  }
}

export default function SchedeTecniche({
  customerId,
  salonId,
  staffId,
  appointmentId,
}: {
  customerId: string;
  salonId?: number | null;
  staffId?: number | null;
  appointmentId?: number | null;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [cards, setCards] = useState<CardRow[]>([]);
  const [legacyCards, setLegacyCards] = useState<LegacyCardRow[]>([]);
  const [legacyLoading, setLegacyLoading] = useState(true);

  const [type, setType] = useState<ServiceType>("oxidation_color");
  const [data, setData] = useState<AnyCardData>(emptyPayloadFor("oxidation_color"));

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setLegacyLoading(true);
      setErr("");

      const [modernRes, legacyRes] = await Promise.all([
        supabase
          .from("customer_service_cards")
          .select(
            "id, customer_id, service_type, data, salon_id, staff_id, appointment_id, created_at",
          )
          .eq("customer_id", customerId)
          .neq("service_type", "legacy_note")
          .order("created_at", { ascending: false }),
        supabase
          .from("customer_service_cards")
          .select("id, customer_id, service_type, data, created_at")
          .eq("customer_id", customerId)
          .eq("service_type", "legacy_note"),
      ]);

      if (cancelled) return;

      if (modernRes.error) {
        setErr(modernRes.error.message);
        setCards([]);
      } else {
        setCards((modernRes.data ?? []) as CardRow[]);
      }

      if (legacyRes.error) {
        if (!modernRes.error) {
          setErr((prev) => prev || legacyRes.error!.message);
        }
        setLegacyCards([]);
      } else {
        setLegacyCards(sortLegacyBossCards((legacyRes.data ?? []) as LegacyCardRow[]));
      }

      setLoading(false);
      setLegacyLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [customerId, supabase]);

  useEffect(() => {
    setData(emptyPayloadFor(type));
  }, [type]);

  function patchPayload(patch: Record<string, any>) {
    setData((prev) => ({
      ...prev,
      payload: { ...(prev as any).payload, ...patch },
    }) as AnyCardData);
  }

  async function saveCard() {
    setErr("");

    const payload = (data as any).payload ?? {};
    const hasSomething = Object.values(payload).some(
      (v) => String(v ?? "").trim() !== ""
    );
    if (!hasSomething) {
      setErr("Scrivi almeno un dettaglio prima di salvare.");
      return;
    }

    setSaving(true);

    const insertRow: any = {
      customer_id: customerId,
      service_type: type,
      data: {
        ...data,
        created_local: new Date().toISOString(),
      },
    };

    if (typeof salonId === "number") insertRow.salon_id = salonId;
    if (typeof staffId === "number") insertRow.staff_id = staffId;
    if (typeof appointmentId === "number") insertRow.appointment_id = appointmentId;

    const { data: saved, error } = await supabase
      .from("customer_service_cards")
      .insert(insertRow)
      .select("id, customer_id, service_type, data, salon_id, staff_id, appointment_id, created_at")
      .single();

    if (error) {
      setErr(error.message);
      setSaving(false);
      return;
    }

    setCards((prev) => [saved as CardRow, ...prev]);
    setData(emptyPayloadFor(type));
    setSaving(false);
  }

  const currentMeta = SERVICE_TYPES.find((s) => s.value === type)!;
  const Icon = currentMeta.icon;

  return (
    <div className="space-y-8">
      {/* NEW CARD */}
      <section className="rounded-3xl bg-[#24140e]/80 border border-[#5c3a21]/60 p-6 backdrop-blur-md shadow-[0_0_55px_rgba(0,0,0,0.20)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-[#f3d8b6]/70 tracking-wide">Nuova scheda</div>
            <h2 className="text-2xl font-extrabold text-[#f3d8b6] tracking-tight mt-1">
              Seleziona il servizio fatto oggi
            </h2>
            <p className="text-[#c9b299] mt-2 text-sm">{currentMeta.hint}</p>
          </div>

          <div className="hidden md:flex items-center gap-2 rounded-2xl px-3 py-2 border border-[#5c3a21]/60 bg-black/20 text-xs text-[#f3d8b6]/70">
            <Icon size={14} />
            Modulo rapido
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
          {/* LEFT */}
          <div className="lg:col-span-1">
            <label className="text-xs text-[#f3d8b6]/70">Tipo servizio</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ServiceType)}
              className="mt-1 w-full rounded-2xl bg-[#1c0f0a] border border-[#5c3a21]/60
                px-4 py-3 text-sm text-white
                focus:outline-none focus:ring-2 focus:ring-[#f3d8b6]/30"
            >
              {SERVICE_TYPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <RlpSelect
                value={(data as any).payload?.rlp ?? ""}
                onChange={(v) => patchPayload({ rlp: v })}
              />
              <MiniInput
                label="Obiettivo"
                placeholder="Es: castano freddo, copertura bianchi…"
                value={(data as any).payload?.goal ?? ""}
                onChange={(v) => patchPayload({ goal: v })}
              />
              <MiniInput
                label="Risultato"
                placeholder="Es: perfetto, leggermente caldo…"
                value={(data as any).payload?.outcome ?? ""}
                onChange={(v) => patchPayload({ outcome: v })}
              />
            </div>
          </div>

          {/* RIGHT */}
          <div className="lg:col-span-2">
            <DynamicForm
              type={type}
              payload={(data as any).payload ?? {}}
              onPatch={patchPayload}
            />
          </div>
        </div>

        {err && <div className="mt-4 text-sm text-red-400">{err}</div>}

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button
            onClick={saveCard}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3
              bg-[#f3d8b6] text-black font-semibold
              shadow-[0_10px_35px_rgba(243,216,182,0.22)]
              hover:brightness-110 disabled:opacity-50 transition"
          >
            <Plus size={18} />
            {saving ? "Salvataggio…" : "Salva scheda tecnica"}
          </button>

          <button
            onClick={() => setData(emptyPayloadFor(type))}
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3
              border border-[#5c3a21]/60 text-[#f3d8b6]
              hover:bg-white/5 transition"
          >
            <Eraser size={18} />
            Reset modulo
          </button>
        </div>
      </section>

      {/* HISTORY */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-[#f3d8b6] tracking-tight">
            Storico schede (globale)
          </h3>
          {loading && <div className="text-xs text-[#f3d8b6]/60">Caricamento…</div>}
        </div>

        {!loading && cards.length === 0 && (
          <div className="rounded-3xl bg-black/20 border border-[#5c3a21]/60 p-6 text-white/60">
            Nessuna scheda tecnica registrata.
          </div>
        )}

        <div className="space-y-4">
          {cards.map((c) => (
            <HistoryCard key={c.id} row={c} />
          ))}
        </div>
      </section>

      {/* BOSS LEGACY (read-only) */}
      <BossLegacyHistorySection loading={legacyLoading} cards={legacyCards} />
    </div>
  );
}

/* ================= UI ================= */

function RlpSelect({
  value,
  onChange,
}: {
  value: "" | "radice" | "radice_lunghezze" | "tutto";
  onChange: (v: "radice" | "radice_lunghezze" | "tutto" | "") => void;
}) {
  return (
    <div>
      <div className="text-xs text-[#f3d8b6]/70">R/L/P</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as any)}
        className="mt-1 w-full rounded-2xl bg-[#1c0f0a] border border-[#5c3a21]/60
          px-4 py-3 text-sm text-white
          focus:outline-none focus:ring-2 focus:ring-[#f3d8b6]/30"
      >
        <option value="">—</option>
        <option value="radice">Radice</option>
        <option value="radice_lunghezze">Radice + Lunghezze</option>
        <option value="tutto">Tutto</option>
      </select>
    </div>
  );
}

function MiniInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="text-xs text-[#f3d8b6]/70">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-2xl bg-[#1c0f0a] border border-[#5c3a21]/60
          px-4 py-3 text-sm text-white placeholder:text-white/40
          focus:outline-none focus:ring-2 focus:ring-[#f3d8b6]/30"
      />
    </div>
  );
}

function BigTextarea({
  label,
  icon: Icon,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  icon: any;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="rounded-3xl bg-black/20 border border-[#5c3a21]/60 p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-[#f3d8b6]">
        <Icon size={16} className="opacity-90" />
        {label}
      </div>
      <textarea
        rows={5}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-3 w-full rounded-2xl bg-[#1c0f0a] border border-[#5c3a21]/60
          p-4 text-sm text-white placeholder:text-white/40
          focus:outline-none focus:ring-2 focus:ring-[#f3d8b6]/30"
      />
    </div>
  );
}

function DynamicForm({
  type,
  payload,
  onPatch,
}: {
  type: ServiceType;
  payload: Record<string, any>;
  onPatch: (patch: Record<string, any>) => void;
}) {
  if (type === "oxidation_color") {
    return (
      <div className="grid grid-cols-1 gap-4">
        <BigTextarea
          label="Formula colore"
          icon={Droplets}
          placeholder="Es: 5.1 + 0.11 (1:1) – oss 20 vol – additivo…"
          value={payload.formula ?? ""}
          onChange={(v) => onPatch({ formula: v })}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MiniInput
            label="Volumi ossigeno"
            placeholder="10 / 20 / 30 vol…"
            value={payload.volumes ?? ""}
            onChange={(v) => onPatch({ volumes: v })}
          />
          <MiniInput
            label="Tempo posa"
            placeholder="Es: 35 min"
            value={payload.processing_time ?? ""}
            onChange={(v) => onPatch({ processing_time: v })}
          />
        </div>
        <BigTextarea
          label="Correzioni / Note tecniche"
          icon={FlaskConical}
          placeholder="Es: neutralizzare arancio, pre-pigmentazione, ecc…"
          value={payload.correction ?? ""}
          onChange={(v) => onPatch({ correction: v })}
        />
        <BigTextarea
          label="Note generali"
          icon={CalendarDays}
          placeholder="Cosa ricordare per la prossima volta…"
          value={payload.general_notes ?? ""}
          onChange={(v) => onPatch({ general_notes: v })}
        />
      </div>
    );
  }

  if (type === "gloss") {
    return (
      <div className="grid grid-cols-1 gap-4">
        <BigTextarea
          label="Mix / Tonalizzazione"
          icon={Wand2}
          placeholder="Es: 7.1 + clear 1:2…"
          value={payload.mix ?? ""}
          onChange={(v) => onPatch({ mix: v })}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MiniInput
            label="Attivatore / Developer"
            placeholder="Es: 6 vol / attivatore…"
            value={payload.developer ?? ""}
            onChange={(v) => onPatch({ developer: v })}
          />
          <MiniInput
            label="Tempo posa"
            placeholder="Es: 15 min"
            value={payload.processing_time ?? ""}
            onChange={(v) => onPatch({ processing_time: v })}
          />
        </div>
        <BigTextarea
          label="Note generali"
          icon={CalendarDays}
          placeholder="Cosa ricordare…"
          value={payload.general_notes ?? ""}
          onChange={(v) => onPatch({ general_notes: v })}
        />
      </div>
    );
  }

  if (type === "lightening") {
    return (
      <div className="grid grid-cols-1 gap-4">
        <BigTextarea
          label="Prodotto / Tecnica"
          icon={FlaskConical}
          placeholder="Es: polvere blu + oss 20 vol – balayage…"
          value={payload.product ?? ""}
          onChange={(v) => onPatch({ product: v })}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MiniInput
            label="Volumi"
            placeholder="10 / 20 / 30 vol…"
            value={payload.volumes ?? ""}
            onChange={(v) => onPatch({ volumes: v })}
          />
          <MiniInput
            label="Tempo posa"
            placeholder="Es: 40 min"
            value={payload.processing_time ?? ""}
            onChange={(v) => onPatch({ processing_time: v })}
          />
        </div>
        <BigTextarea
          label="Protezione (bond / additivi)"
          icon={Sparkles}
          placeholder="Es: bond repair, plex…"
          value={payload.protection ?? ""}
          onChange={(v) => onPatch({ protection: v })}
        />
        <BigTextarea
          label="Tonalizzazione finale"
          icon={Wand2}
          placeholder="Es: 9.1 + 10.2…"
          value={payload.toning ?? ""}
          onChange={(v) => onPatch({ toning: v })}
        />
      </div>
    );
  }

  if (type === "keratin") {
    return (
      <div className="grid grid-cols-1 gap-4">
        <BigTextarea
          label="Prodotto"
          icon={Sparkles}
          placeholder="Nome trattamento / lotto…"
          value={payload.product ?? ""}
          onChange={(v) => onPatch({ product: v })}
        />
        <BigTextarea
          label="Passaggi"
          icon={CalendarDays}
          placeholder="Step-by-step: shampoo, posa, asciugatura, piastra…"
          value={payload.steps ?? ""}
          onChange={(v) => onPatch({ steps: v })}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MiniInput
            label="Temperatura piastra"
            placeholder="Es: 210°C"
            value={payload.iron_temp ?? ""}
            onChange={(v) => onPatch({ iron_temp: v })}
          />
          <MiniInput
            label="Passate"
            placeholder="Es: 8-10"
            value={payload.passes ?? ""}
            onChange={(v) => onPatch({ passes: v })}
          />
        </div>
        <BigTextarea
          label="Aftercare"
          icon={Sparkles}
          placeholder="Prodotti e regole post-trattamento…"
          value={payload.aftercare ?? ""}
          onChange={(v) => onPatch({ aftercare: v })}
        />
      </div>
    );
  }

  // botanicals
  return (
    <div className="grid grid-cols-1 gap-4">
      <BigTextarea
        label="Diretta pre-erbe / pre-saturazione"
        icon={Droplets}
        placeholder="Es: Diretta 2 + 5.1 Plus…"
        value={payload.pre_direct ?? ""}
        onChange={(v) => onPatch({ pre_direct: v })}
      />
      <BigTextarea
        label="Miscela erbe"
        icon={Leaf}
        placeholder="Es: lawsonia + mallo + emolliente mucillagini…"
        value={payload.mix ?? ""}
        onChange={(v) => onPatch({ mix: v })}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MiniInput
          label="Fonte di calore"
          placeholder="Cuffia / phon / termica…"
          value={payload.heat ?? ""}
          onChange={(v) => onPatch({ heat: v })}
        />
        <MiniInput
          label="Tempo posa"
          placeholder="Es: 60 min"
          value={payload.processing_time ?? ""}
          onChange={(v) => onPatch({ processing_time: v })}
        />
      </div>
      <BigTextarea
        label="Risciacquo / finitura"
        icon={Wand2}
        placeholder="Shampoo, maschera, pH, leave-in…"
        value={payload.rinse ?? ""}
        onChange={(v) => onPatch({ rinse: v })}
      />
      <BigTextarea
        label="Note generali"
        icon={CalendarDays}
        placeholder="Cosa ricordare…"
        value={payload.general_notes ?? ""}
        onChange={(v) => onPatch({ general_notes: v })}
      />
    </div>
  );
}

function sortLegacyBossCards(rows: LegacyCardRow[]): LegacyCardRow[] {
  return [...rows].sort((a, b) => {
    const da = String(a.data?.legacy_date ?? "").trim();
    const db = String(b.data?.legacy_date ?? "").trim();
    if (da && db && da !== db) return db.localeCompare(da);
    if (da && !db) return -1;
    if (!da && db) return 1;
    return b.created_at.localeCompare(a.created_at);
  });
}

function BossLegacyHistorySection({
  loading,
  cards,
}: {
  loading: boolean;
  cards: LegacyCardRow[];
}) {
  const bossCards = cards.filter(
    (c) => c.data?.source === "boss" || c.data?.source == null,
  );

  return (
    <section className="space-y-4 pt-2 border-t border-[#5c3a21]/40">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="rounded-2xl p-2.5 bg-[#24140e]/90 border border-[#5c3a21]/60">
            <Archive size={18} className="text-[#f3d8b6]/90" />
          </span>
          <div>
            <h3 className="text-lg font-extrabold text-[#f3d8b6] tracking-tight">
              Storico Boss Legacy
            </h3>
            <p className="text-xs text-[#c9b299] mt-0.5">
              Note tecniche importate da Boss — solo consultazione, non modificabili
            </p>
          </div>
        </div>
        {loading && <div className="text-xs text-[#f3d8b6]/60">Caricamento…</div>}
      </div>

      {!loading && bossCards.length === 0 && (
        <div className="rounded-3xl bg-black/15 border border-[#5c3a21]/50 p-6 text-[#c9b299]/90 text-sm">
          Nessuno storico Boss importato.
        </div>
      )}

      <div className="space-y-4">
        {bossCards.map((c) => (
          <BossLegacyCard key={c.id} row={c} />
        ))}
      </div>
    </section>
  );
}

function BossLegacyCard({ row }: { row: LegacyCardRow }) {
  const d = row.data ?? {};
  const warnings = Array.isArray(d.warnings) ? d.warnings.filter(Boolean) : [];
  const legacyDate = String(d.legacy_date ?? "").trim();
  const originalText = String(d.original_text ?? "").trim();

  return (
    <article
      className="rounded-3xl bg-[#1a100c]/70 border border-[#5c3a21]/55 p-6 shadow-[0_0_28px_rgba(0,0,0,0.12)]"
      aria-readonly="true"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          {legacyDate ? (
            <div className="text-sm font-semibold text-[#f3d8b6]">
              {formatLegacyDate(legacyDate)}
            </div>
          ) : (
            <div className="text-sm text-[#f3d8b6]/50">Data non indicata</div>
          )}
          {d.legacy_tipo_nota ? (
            <div className="text-xs text-[#c9b299]">Tipo: {d.legacy_tipo_nota}</div>
          ) : null}
          <div className="text-xs text-[#f3d8b6]/45">
            Import record · {nowLocalNice(row.created_at)}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <LegacyBadge tone="boss">Boss</LegacyBadge>
          {d.legacy_guess ? (
            <LegacyBadge tone="guess">{prettyLegacyGuess(d.legacy_guess)}</LegacyBadge>
          ) : null}
          {d.confidence ? (
            <LegacyBadge tone={confidenceTone(d.confidence)}>
              {d.confidence}
            </LegacyBadge>
          ) : null}
        </div>
      </div>

      {originalText ? (
        <pre className="mt-5 rounded-2xl bg-black/25 border border-[#5c3a21]/45 p-4 text-sm text-white/90 whitespace-pre-wrap font-sans leading-relaxed overflow-x-auto">
          {originalText}
        </pre>
      ) : (
        <div className="mt-5 text-sm text-[#c9b299]/70">(testo originale vuoto)</div>
      )}

      {warnings.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {warnings.map((w) => (
            <span
              key={w}
              className="text-[11px] px-2.5 py-1 rounded-full border border-amber-700/50 bg-amber-950/30 text-amber-200/90"
            >
              {prettyWarning(w)}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function LegacyBadge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "boss" | "guess" | "high" | "medium" | "low";
}) {
  const styles: Record<typeof tone, string> = {
    boss: "border-[#8b5a2b]/70 bg-[#3d2618]/80 text-[#f3d8b6]",
    guess: "border-[#5c3a21]/70 bg-black/30 text-[#e8d4bc]",
    high: "border-emerald-800/60 bg-emerald-950/40 text-emerald-200/90",
    medium: "border-amber-800/50 bg-amber-950/35 text-amber-200/90",
    low: "border-[#5c3a21]/60 bg-black/25 text-[#c9b299]",
  };

  return (
    <span
      className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

function formatLegacyDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return isoDate;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function prettyLegacyGuess(guess: string): string {
  const map: Record<string, string> = {
    mixed_legacy: "Misto legacy",
    botanicals: "Erbe",
    oxidation_color: "Colore ossidazione",
    direct_color: "Direct color",
    lightening: "Schiaritura",
    keratin: "Keratina",
    legacy_note: "Nota libera",
  };
  return map[guess] ?? guess.replace(/_/g, " ");
}

function confidenceTone(confidence: string): "high" | "medium" | "low" {
  if (confidence === "high") return "high";
  if (confidence === "medium") return "medium";
  return "low";
}

function prettyWarning(code: string): string {
  const map: Record<string, string> = {
    mixed_botanicals_oxygen: "Erbe + ossigeno",
    ambiguous_formula: "Formula ambigua",
    no_date: "Senza data",
    unmatched_customer: "Cliente non matchato",
    oxygen_only: "Solo volumi",
    unparsed_legacy_date: "Data non interpretata",
    ambiguous_customer_match: "Match cliente ambiguo",
  };
  return map[code] ?? code;
}

function HistoryCard({ row }: { row: CardRow }) {
  const meta = SERVICE_TYPES.find((s) => s.value === row.service_type);
  const Icon = meta?.icon ?? CalendarDays;

  const d = row.data ?? {};
  const payload: Record<string, any> = d.payload ?? {};

  const orderedKeys = keysForService(row.service_type);

  return (
    <div className="rounded-3xl bg-black/20 border border-[#5c3a21]/60 p-6 shadow-[0_0_30px_rgba(0,0,0,0.14)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-extrabold text-[#f3d8b6] tracking-tight">
            <span className="rounded-xl p-2 bg-black/20 border border-[#5c3a21]/60">
              <Icon size={16} className="opacity-90" />
            </span>
            {meta?.label ?? row.service_type}
          </div>

          <div className="text-xs text-[#f3d8b6]/60 mt-2">
            {nowLocalNice(row.created_at)}
            {typeof row.salon_id === "number" ? ` · salon ${row.salon_id}` : ""}
            {typeof row.staff_id === "number" ? ` · staff ${row.staff_id}` : ""}
            {typeof row.appointment_id === "number" ? ` · app #${row.appointment_id}` : ""}
          </div>
        </div>

        <div className="text-xs text-[#c9b299]">
          R/L/P: <span className="text-white/80">{prettyRlp(payload.rlp)}</span>
        </div>
      </div>

      {(payload.goal || payload.outcome) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-5">
          {payload.goal && (
            <div className="rounded-2xl bg-black/20 border border-[#5c3a21]/50 p-4">
              <div className="text-xs text-[#f3d8b6]/60">Obiettivo</div>
              <div className="text-sm text-white/90 whitespace-pre-wrap">{payload.goal}</div>
            </div>
          )}
          {payload.outcome && (
            <div className="rounded-2xl bg-black/20 border border-[#5c3a21]/50 p-4">
              <div className="text-xs text-[#f3d8b6]/60">Risultato</div>
              <div className="text-sm text-white/90 whitespace-pre-wrap">{payload.outcome}</div>
            </div>
          )}
        </div>
      )}

      <div className="mt-5 space-y-3">
        {orderedKeys
          .filter((k) => !["rlp", "goal", "outcome"].includes(k))
          .filter((k) => String(payload[k] ?? "").trim() !== "")
          .map((k) => (
            <div key={k} className="rounded-2xl bg-black/15 border border-[#5c3a21]/40 p-4">
              <div className="text-xs text-[#f3d8b6]/60">{prettyKey(k)}</div>
              <div className="text-sm text-white/90 whitespace-pre-wrap">{String(payload[k])}</div>
            </div>
          ))}
      </div>
    </div>
  );
}

/* ================= helpers ================= */

function keysForService(service: ServiceType): string[] {
  const base = ["rlp", "goal", "outcome"];
  switch (service) {
    case "oxidation_color":
      return [...base, "formula", "volumes", "processing_time", "correction", "general_notes"];
    case "gloss":
      return [...base, "mix", "developer", "processing_time", "general_notes"];
    case "lightening":
      return [...base, "product", "volumes", "processing_time", "protection", "toning", "general_notes"];
    case "keratin":
      return [...base, "product", "steps", "iron_temp", "passes", "aftercare", "general_notes"];
    case "botanicals":
      return [...base, "pre_direct", "mix", "heat", "processing_time", "rinse", "general_notes"];
  }
}

function prettyRlp(v: any) {
  if (v === "radice") return "Radice";
  if (v === "radice_lunghezze") return "Radice + Lunghezze";
  if (v === "tutto") return "Tutto";
  return "-";
}

function prettyKey(k: string) {
  const map: Record<string, string> = {
    formula: "Formula",
    volumes: "Volumi",
    processing_time: "Tempo posa",
    correction: "Correzioni",
    mix: "Mix",
    developer: "Developer",
    product: "Prodotto / Tecnica",
    protection: "Protezione (bond/additivi)",
    toning: "Tonalizzazione finale",
    steps: "Passaggi",
    iron_temp: "Temp. piastra",
    passes: "Passate",
    aftercare: "Aftercare",
    pre_direct: "Diretta pre-erbe",
    heat: "Fonte di calore",
    rinse: "Risciacquo / finitura",
    general_notes: "Note generali",
  };
  return map[k] ?? k;
}
