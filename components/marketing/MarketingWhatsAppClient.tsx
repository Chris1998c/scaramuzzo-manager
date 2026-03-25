"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, Send, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { MAGAZZINO_CENTRALE_ID } from "@/lib/constants";

const PAGE_SIZE = 1000;
const MS_DAY = 86_400_000;
const MS_48H = 48 * 60 * 60 * 1000;
const HISTORY_WINDOW_DAYS = 7;

export type ClientFilterPreset =
  | "all"
  | "no_return_60"
  | "high_spend_inactive"
  | "frequent"
  | "declining"
  | "retail"
  | "one_shot";

export type MarketingCustomerRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  appointmentCount: number;
  lastAppointmentMs: number | null;
  totalSpent: number;
  apptsLast30: number;
  apptsLast60: number;
  apptsLast90: number;
};

type Agg = {
  appointmentCount: number;
  lastAppointmentMs: number | null;
  totalSpent: number;
  apptsLast30: number;
  apptsLast60: number;
  apptsLast90: number;
};

async function fetchAllPaged<T extends Record<string, unknown>>(
  supabase: ReturnType<typeof createClient>,
  table: "appointments" | "sales",
  salonId: number,
  select: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq("salon_id", salonId)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as unknown as T[];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }
  return rows;
}

function buildAggregates(
  appointmentRows: Array<{ customer_id?: string; start_time?: string | null }>,
  saleRows: Array<{ customer_id?: string | null; total_amount?: unknown }>,
): Map<string, Agg> {
  const map = new Map<string, Agg>();

  const now = Date.now();
  const win30 = now - 30 * MS_DAY;
  const win60 = now - 60 * MS_DAY;
  const win90 = now - 90 * MS_DAY;

  const bump = (customerId: string): Agg => {
    let a = map.get(customerId);
    if (!a) {
      a = {
        appointmentCount: 0,
        lastAppointmentMs: null,
        totalSpent: 0,
        apptsLast30: 0,
        apptsLast60: 0,
        apptsLast90: 0,
      };
      map.set(customerId, a);
    }
    return a;
  };

  for (const r of appointmentRows) {
    const id = r.customer_id;
    if (!id) continue;
    const a = bump(id);
    a.appointmentCount += 1;
    if (r.start_time) {
      const ms = new Date(String(r.start_time)).getTime();
      if (Number.isFinite(ms)) {
        if (a.lastAppointmentMs == null || ms > a.lastAppointmentMs) {
          a.lastAppointmentMs = ms;
        }
        if (ms >= win30) a.apptsLast30 += 1;
        if (ms >= win60) a.apptsLast60 += 1;
        if (ms >= win90) a.apptsLast90 += 1;
      }
    }
  }

  for (const r of saleRows) {
    const id = r.customer_id;
    if (!id) continue;
    const a = bump(id);
    const amt = Number(r.total_amount ?? 0);
    if (Number.isFinite(amt)) a.totalSpent += amt;
  }

  return map;
}

function applyPreset(rows: MarketingCustomerRow[], preset: ClientFilterPreset): MarketingCustomerRow[] {
  const now = Date.now();
  const cutoff60 = now - 60 * MS_DAY;

  switch (preset) {
    case "all":
      return rows;
    case "no_return_60":
      return rows.filter(
        (r) => r.lastAppointmentMs == null || r.lastAppointmentMs < cutoff60,
      );
    case "high_spend_inactive":
      return rows.filter(
        (r) =>
          r.totalSpent >= 200 &&
          (r.lastAppointmentMs == null || r.lastAppointmentMs < cutoff60),
      );
    case "frequent":
      return rows.filter((r) => r.apptsLast90 >= 3);
    case "declining":
      return rows.filter((r) => r.apptsLast90 >= 3 && r.apptsLast30 <= 1);
    case "retail":
      return rows.filter((r) => r.apptsLast60 >= 2 && r.totalSpent > 0);
    case "one_shot":
      return rows.filter((r) => r.appointmentCount === 1);
    default:
      return rows;
  }
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatShortDate(ms: number | null): string {
  if (ms == null) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeZone: "Europe/Rome",
  }).format(new Date(ms));
}

const FILTER_OPTIONS: Array<{ key: ClientFilterPreset; label: string }> = [
  { key: "all", label: "Tutti" },
  { key: "no_return_60", label: "Non tornano da 60gg" },
  { key: "high_spend_inactive", label: "Alto spendente inattivo" },
  { key: "frequent", label: "Clienti frequenti" },
  { key: "declining", label: "In calo" },
  { key: "retail", label: "Retail potenziale" },
  { key: "one_shot", label: "One-shot" },
];

const SEGMENT_HINTS: Array<{
  key: ClientFilterPreset;
  title: string;
  action: string;
  goal: string;
  message: string;
}> = [
  {
    key: "no_return_60",
    title: "Non tornano da 60gg",
    action: "Messaggio di rientro",
    goal: "Riattivare clienti inattivi",
    message:
      "Ciao! È un po’ che non ci vediamo, se vuoi possiamo organizzare il tuo prossimo appuntamento quando preferisci.",
  },
  {
    key: "high_spend_inactive",
    title: "Alto spendente inattivo",
    action: "Contatto personalizzato",
    goal: "Recuperare clienti premium",
    message:
      "Ciao! Ci farebbe piacere rivederti in salone, se vuoi possiamo riservarti un appuntamento dedicato.",
  },
  {
    key: "retail",
    title: "Retail potenziale",
    action: "Promo prodotti",
    goal: "Aumentare rivendita",
    message:
      "Abbiamo selezionato alcuni prodotti perfetti per il tuo percorso, se vuoi ti consigliamo i migliori per te.",
  },
  {
    key: "declining",
    title: "In calo",
    action: "Check-up capelli",
    goal: "Riattivare frequenza",
    message:
      "Potrebbe essere il momento giusto per un piccolo ritocco o trattamento, quando vuoi siamo disponibili.",
  },
  {
    key: "frequent",
    title: "Clienti frequenti",
    action: "Fidelizzazione",
    goal: "Aumentare valore cliente",
    message:
      "Grazie per la tua fiducia! Possiamo già programmare il prossimo appuntamento oppure consigliarti qualcosa di nuovo.",
  },
];

export type MarketingSortMode =
  | "default"
  | "last_visit_asc"
  | "spend_desc"
  | "appointments_desc";

function segmentCountsFromCustomers(
  rows: MarketingCustomerRow[],
): Record<ClientFilterPreset, number> {
  const out = {} as Record<ClientFilterPreset, number>;
  for (const { key } of FILTER_OPTIONS) {
    out[key] = applyPreset(rows, key).length;
  }
  return out;
}

function sortCustomers(
  rows: MarketingCustomerRow[],
  mode: MarketingSortMode,
): MarketingCustomerRow[] {
  const arr = [...rows];
  const byName = (a: MarketingCustomerRow, b: MarketingCustomerRow) =>
    `${a.last_name}`.localeCompare(`${b.last_name}`, "it") ||
    `${a.first_name}`.localeCompare(`${b.first_name}`, "it");

  switch (mode) {
    case "last_visit_asc":
      return arr.sort((a, b) => {
        const av = a.lastAppointmentMs ?? Number.POSITIVE_INFINITY;
        const bv = b.lastAppointmentMs ?? Number.POSITIVE_INFINITY;
        if (av !== bv) return av - bv;
        return byName(a, b);
      });
    case "spend_desc":
      return arr.sort((a, b) => {
        if (b.totalSpent !== a.totalSpent) return b.totalSpent - a.totalSpent;
        return byName(a, b);
      });
    case "appointments_desc":
      return arr.sort((a, b) => {
        if (b.appointmentCount !== a.appointmentCount)
          return b.appointmentCount - a.appointmentCount;
        return byName(a, b);
      });
    default:
      return arr;
  }
}

type MarketingHistoryApiRow = {
  id: number;
  salon_id: number;
  customer_id: string;
  message_text: string;
  status: string;
  sent_at: string | null;
  created_at: string;
  error_message: string | null;
  customers?: { first_name?: string; last_name?: string } | null | unknown[];
  salons?: { name?: string } | null | unknown[];
};

function singleRel<T extends Record<string, unknown>>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] as T | undefined) ?? null : v;
}

function getHistoryEventTime(row: MarketingHistoryApiRow): Date | null {
  const raw = row.sent_at ?? row.created_at;
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? new Date(ms) : null;
}

/** Calendario Europe/Rome (YYYY-MM-DD per confronto). */
function romeYmd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function isSameRomeDay(a: Date, b: Date): boolean {
  return romeYmd(a) === romeYmd(b);
}

type MarketingContactRecency = "today" | "recent";

function marketingContactRecency(last: Date | undefined): MarketingContactRecency | null {
  if (!last) return null;
  const now = new Date();
  if (isSameRomeDay(last, now)) return "today";
  const age = Date.now() - last.getTime();
  if (age >= 0 && age < MS_48H) return "recent";
  return null;
}

function formatRomeDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("it-IT", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Europe/Rome",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function previewMsg(text: string, max = 48): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export type MessageQualityIssue = {
  kind: "block" | "warn" | "strong";
  text: string;
};

/** Controllo qualità pre-invio (euristiche leggere, no AI). */
export function validateMessage(text: string): {
  ok: boolean;
  issues: MessageQualityIssue[];
} {
  const t = text.trim();
  const issues: MessageQualityIssue[] = [];

  if (t.length < 10) {
    issues.push({
      kind: "block",
      text: "Messaggio troppo corto: servono almeno 10 caratteri (testo reale, non solo spazi).",
    });
    return { ok: false, issues };
  }

  if (t.length > 1000) {
    issues.push({
      kind: "strong",
      text: "Messaggio molto lungo (oltre 1000 caratteri): su WhatsApp risulta pesante; accorcialo prima di inviare.",
    });
  } else if (t.length > 500) {
    issues.push({
      kind: "warn",
      text: "Messaggio lungo (oltre 500 caratteri): valuta di sintetizzare per una lettura più chiara.",
    });
  }

  const lower = t.toLowerCase();
  const spamPhrases = ["offerta imperdibile", "solo oggi", "ultima occasione"] as const;
  for (const p of spamPhrases) {
    if (lower.includes(p)) {
      issues.push({
        kind: "warn",
        text: `Formulazione ad alto rischio spam (“${p}”): usa un tono più sobrio e professionale.`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

export default function MarketingWhatsAppClient() {
  const supabase = createClient();
  const { activeSalonId, isReady, role, allowedSalons } = useActiveSalon();

  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<MarketingCustomerRow[]>([]);
  const [search, setSearch] = useState("");
  const [filterPreset, setFilterPreset] = useState<ClientFilterPreset>("all");
  const [sortMode, setSortMode] = useState<MarketingSortMode>("default");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendSummary, setSendSummary] = useState<string | null>(null);
  const [historyRows, setHistoryRows] = useState<MarketingHistoryApiRow[]>([]);
  /** Ultimi invii marketing nel salone (ultimi 7 giorni) per mappa contatti / badge. */
  const [historyMessages, setHistoryMessages] = useState<MarketingHistoryApiRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [messageBeforeAi, setMessageBeforeAi] = useState<string | null>(null);
  const [aiCopyLoading, setAiCopyLoading] = useState(false);
  const [aiCopyError, setAiCopyError] = useState<string | null>(null);
  const [messageQualityIssues, setMessageQualityIssues] = useState<
    MessageQualityIssue[] | null
  >(null);
  const messageTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const salonId = activeSalonId;

  const loadCustomers = useCallback(async () => {
    setLoadError(null);
    setSendSummary(null);
    if (salonId == null || !Number.isFinite(salonId)) {
      setCustomers([]);
      setLoadState("ready");
      return;
    }

    setLoadState("loading");
    try {
      const [appRows, saleRows] = await Promise.all([
        fetchAllPaged<{ customer_id?: string; start_time?: string | null }>(
          supabase,
          "appointments",
          salonId,
          "id, customer_id, start_time",
        ),
        fetchAllPaged<{ customer_id?: string | null; total_amount?: unknown }>(
          supabase,
          "sales",
          salonId,
          "id, customer_id, total_amount",
        ),
      ]);

      const agg = buildAggregates(appRows, saleRows);
      const ids = [...agg.keys()];
      if (!ids.length) {
        setCustomers([]);
        setLoadState("ready");
        return;
      }

      const { data, error } = await supabase
        .from("customers")
        .select("id, first_name, last_name, phone")
        .in("id", ids)
        .order("last_name", { ascending: true });

      if (error) throw new Error(error.message);

      const enriched: MarketingCustomerRow[] = (data ?? []).map((row) => {
        const r = row as Omit<
          MarketingCustomerRow,
          | "appointmentCount"
          | "lastAppointmentMs"
          | "totalSpent"
          | "apptsLast30"
          | "apptsLast60"
          | "apptsLast90"
        >;
        const a = agg.get(r.id) ?? {
          appointmentCount: 0,
          lastAppointmentMs: null,
          totalSpent: 0,
          apptsLast30: 0,
          apptsLast60: 0,
          apptsLast90: 0,
        };
        return {
          ...r,
          appointmentCount: a.appointmentCount,
          lastAppointmentMs: a.lastAppointmentMs,
          totalSpent: a.totalSpent,
          apptsLast30: a.apptsLast30,
          apptsLast60: a.apptsLast60,
          apptsLast90: a.apptsLast90,
        };
      });

      setCustomers(enriched);
      setLoadState("ready");
    } catch (e) {
      console.error(e);
      setLoadError(e instanceof Error ? e.message : "Errore caricamento clienti");
      setLoadState("error");
      setCustomers([]);
    }
  }, [supabase, salonId]);

  useEffect(() => {
    if (!isReady || role === "cliente") return;
    void loadCustomers();
  }, [isReady, role, loadCustomers]);

  const segmentCounts = useMemo(
    () => segmentCountsFromCustomers(customers),
    [customers],
  );

  const loadHistory = useCallback(async () => {
    if (
      salonId == null ||
      !Number.isFinite(salonId) ||
      salonId === MAGAZZINO_CENTRALE_ID
    ) {
      setHistoryRows([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const res = await fetch(
        `/api/marketing/history?salonId=${encodeURIComponent(String(salonId))}`,
      );
      const json = (await res.json().catch(() => null)) as {
        rows?: MarketingHistoryApiRow[];
      } | null;
      if (!res.ok) {
        console.error("[marketing] history", json);
        setHistoryRows([]);
        setHistoryMessages([]);
        return;
      }
      const rows = Array.isArray(json?.rows) ? json.rows : [];
      setHistoryRows(rows);
      const cutoff = Date.now() - HISTORY_WINDOW_DAYS * MS_DAY;
      setHistoryMessages(
        rows.filter((r) => {
          const t = getHistoryEventTime(r);
          return t != null && t.getTime() >= cutoff;
        }),
      );
    } catch (e) {
      console.error(e);
      setHistoryRows([]);
      setHistoryMessages([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [salonId]);

  useEffect(() => {
    if (!isReady || role === "cliente") return;
    void loadHistory();
  }, [isReady, role, loadHistory]);

  const afterFilter = useMemo(
    () => applyPreset(customers, filterPreset),
    [customers, filterPreset],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return afterFilter;
    return afterFilter.filter((c) => {
      const blob = `${c.first_name} ${c.last_name} ${c.phone}`.toLowerCase();
      return blob.includes(q);
    });
  }, [afterFilter, search]);

  const sortedRows = useMemo(
    () => sortCustomers(filtered, sortMode),
    [filtered, sortMode],
  );

  const lastContactMap = useMemo(() => {
    const map = new Map<string, Date>();
    for (const row of historyMessages) {
      const id = row.customer_id;
      if (!id) continue;
      const dt = getHistoryEventTime(row);
      if (!dt) continue;
      const prev = map.get(id);
      if (!prev || dt.getTime() > prev.getTime()) map.set(id, dt);
    }
    return map;
  }, [historyMessages]);

  const selectedContactWarnings = useMemo(() => {
    let today = 0;
    let recent = 0;
    for (const id of selected) {
      const rec = marketingContactRecency(lastContactMap.get(id));
      if (rec === "today") today += 1;
      else if (rec === "recent") recent += 1;
    }
    return { today, recent };
  }, [selected, lastContactMap]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const visIds = sortedRows.map((c) => c.id);
    const allSelected = visIds.length && visIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        visIds.forEach((id) => next.delete(id));
      } else {
        visIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  async function handleSend() {
    setSendSummary(null);
    if (salonId == null) {
      setSendSummary("Seleziona un salone dall'intestazione.");
      return;
    }
    const ids = [...selected];
    if (!ids.length) {
      setSendSummary("Seleziona almeno un cliente.");
      return;
    }
    const text = message.trim();
    if (!text) {
      setSendSummary("Scrivi un messaggio.");
      return;
    }

    const quality = validateMessage(message);
    if (!quality.ok) {
      setMessageQualityIssues(quality.issues);
      return;
    }
    setMessageQualityIssues(null);

    setSending(true);
    try {
      const res = await fetch("/api/marketing/send-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerIds: ids,
          message: text,
          salonId,
        }),
      });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) {
        const err =
          typeof json?.error === "string" && json.error.trim()
            ? json.error
            : `Errore HTTP ${res.status}`;
        setSendSummary(err);
        return;
      }
      const sent = Number(json?.sent ?? 0);
      const failed = Number(json?.failed ?? 0);
      setSendSummary(`Invio completato: ${sent} inviati, ${failed} errori.`);
      void loadHistory();
    } catch (e) {
      console.error(e);
      setSendSummary("Errore di rete durante l'invio.");
    } finally {
      setSending(false);
    }
  }

  if (!isReady) {
    return (
      <div className="flex items-center gap-2 text-[#c9b299]">
        <Loader2 className="animate-spin" size={18} />
        Caricamento contesto salone…
      </div>
    );
  }

  if (role === "cliente") return null;

  const isCentrale = salonId === MAGAZZINO_CENTRALE_ID;

  const emptyBecauseFilter =
    loadState === "ready" &&
    customers.length > 0 &&
    afterFilter.length === 0 &&
    !search.trim();

  const emptyBecauseSearch =
    loadState === "ready" && afterFilter.length > 0 && filtered.length === 0;

  function applySegmentSuggestion(hint: (typeof SEGMENT_HINTS)[number]) {
    setFilterPreset(hint.key);
    const ids = applyPreset(customers, hint.key).map((c) => c.id);
    setSelected(new Set(ids));
    setMessageBeforeAi(null);
    setAiCopyError(null);
    setMessageQualityIssues(null);
    setMessage(hint.message);
    requestAnimationFrame(() => {
      const el = messageTextareaRef.current;
      if (!el) return;
      el.focus({ preventScroll: false });
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  async function handleImproveMessage() {
    const draft = message.trim();
    if (!draft || isCentrale) return;
    setAiCopyError(null);
    setAiCopyLoading(true);
    try {
      const hint = SEGMENT_HINTS.find((h) => h.key === filterPreset);
      const label =
        FILTER_OPTIONS.find((f) => f.key === filterPreset)?.label ?? filterPreset;
      const segmentTitle = hint?.title ?? label;
      const goal = hint?.goal ?? "";
      const salonName =
        (salonId != null &&
          allowedSalons.find((s) => s.id === salonId)?.name?.trim()) ||
        "";

      const res = await fetch("/api/marketing/ai-copy-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: draft,
          filterPreset,
          segmentTitle,
          goal,
          salonName,
        }),
      });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) {
        const err =
          typeof json?.error === "string" && json.error.trim()
            ? json.error
            : `Errore ${res.status}`;
        setAiCopyError(err);
        return;
      }
      const improved =
        typeof json?.improvedMessage === "string" ? json.improvedMessage.trim() : "";
      if (!improved) {
        setAiCopyError("Testo migliorato vuoto. Riprova.");
        return;
      }
      const capped = improved.slice(0, 4096);
      setMessageBeforeAi(message);
      setMessage(capped);
      setMessageQualityIssues(null);
      requestAnimationFrame(() => messageTextareaRef.current?.focus());
    } catch (e) {
      console.error(e);
      setAiCopyError("Errore di rete.");
    } finally {
      setAiCopyLoading(false);
    }
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-3xl font-extrabold text-[#f3d8b6] tracking-tight">
          WhatsApp — invio manuale
        </h1>
        <p className="text-[#c9b299] mt-2 text-sm leading-relaxed">
          Clienti con almeno un appuntamento o una vendita registrata nel salone attivo.
          Statistiche calcolate da appuntamenti e vendite del salone. Messaggio di testo
          tramite Cloud API (rispettare policy Meta / finestra messaggistica).
        </p>
      </div>

      {!isCentrale ? (
        <>
          <h2 className="text-lg font-bold text-[#f3d8b6] mb-3">Suggerimenti operativi</h2>

          <div className="grid sm:grid-cols-2 gap-3">
            {SEGMENT_HINTS.map((hint) => {
              const count = segmentCounts[hint.key] ?? 0;
              if (count === 0) return null;

              return (
                <div
                  key={hint.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => applySegmentSuggestion(hint)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      applySegmentSuggestion(hint);
                    }
                  }}
                  className="cursor-pointer rounded-2xl border border-white/10 bg-black/30 p-4 hover:border-[#f3d8b6]/40 transition"
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-bold text-[#f3d8b6]">{hint.title}</span>
                    <span className="text-xs text-[#c9b299]">{count} clienti</span>
                  </div>

                  <div className="text-xs text-[#c9b299] space-y-1">
                    <div>
                      <strong>Azione:</strong> {hint.action}
                    </div>
                    <div>
                      <strong>Obiettivo:</strong> {hint.goal}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {isCentrale ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-sm text-[#c9b299]">
          Il magazzino centrale non è un salone operativo: passa a un salone (1–4) per
          elencare i clienti e usare il numero WhatsApp configurato lì.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3 rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-[#f3d8b6]">Clienti</h2>
            <span className="text-xs text-white/45">
              {selected.size} selezionati · {sortedRows.length} visibili · {customers.length}{" "}
              nel salone
            </span>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            {FILTER_OPTIONS.map(({ key, label }) => {
              const active = filterPreset === key;
              const n = segmentCounts[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilterPreset(key)}
                  className={[
                    "rounded-xl border px-3 py-1.5 text-xs font-bold transition tabular-nums",
                    active
                      ? "border-[#f3d8b6]/50 bg-[#f3d8b6]/15 text-[#f3d8b6]"
                      : "border-white/10 bg-black/25 text-[#c9b299] hover:border-white/20",
                  ].join(" ")}
                  title={`${n} clienti in questo segmento (intera salone attiva)`}
                >
                  {label}{" "}
                  <span className="text-[10px] font-black opacity-80">({n})</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="marketing-sort" className="text-[10px] font-bold uppercase text-white/45 shrink-0">
              Ordina
            </label>
            <select
              id="marketing-sort"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as MarketingSortMode)}
              className="rounded-xl border border-white/10 bg-black/30 py-2 px-3 text-xs text-[#e8dcc8] outline-none focus:border-[#f3d8b6]/40 max-w-full"
            >
              <option value="default">Predefinito (rubrica)</option>
              <option value="last_visit_asc">Ultima visita più vecchia</option>
              <option value="spend_desc">Spesa più alta</option>
              <option value="appointments_desc">Più appuntamenti</option>
            </select>
          </div>

          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca nome o telefono…"
              className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-[#e8dcc8] placeholder:text-white/35 outline-none focus:border-[#f3d8b6]/40"
            />
          </div>

          <div className="flex items-center justify-between gap-2 text-xs">
            <button
              type="button"
              onClick={toggleAllVisible}
              className="text-[#f3d8b6]/90 underline-offset-2 hover:underline"
            >
              {filtered.length &&
              filtered.every((c) => selected.has(c.id))
                ? "Deseleziona visibili"
                : "Seleziona visibili"}
            </button>
            {loadState === "loading" ? (
              <span className="inline-flex items-center gap-1 text-white/45">
                <Loader2 size={14} className="animate-spin" /> Caricamento…
              </span>
            ) : null}
          </div>

          {loadError ? (
            <p className="text-sm text-rose-300">{loadError}</p>
          ) : null}

          <div className="max-h-[min(420px,50vh)] overflow-auto rounded-xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-[1] bg-[#1a1510] text-[10px] font-black uppercase tracking-wider text-white/45">
                <tr>
                  <th className="w-10 px-2 py-2" aria-label="Seleziona" />
                  <th className="px-2 py-2">Cliente</th>
                  <th className="px-2 py-2 hidden sm:table-cell">Tel.</th>
                  <th className="px-2 py-2 text-right">App.</th>
                  <th className="px-2 py-2 hidden md:table-cell">Ultimo</th>
                  <th className="px-2 py-2 text-right hidden md:table-cell">Spesa</th>
                </tr>
              </thead>
              <tbody className="text-[#e8dcc8]">
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-[#c9b299]">
                      {loadState === "ready" && customers.length === 0
                        ? "Nessun cliente con storico in questo salone."
                        : emptyBecauseFilter
                          ? "Nessun cliente corrisponde al filtro selezionato."
                          : emptyBecauseSearch
                            ? "Nessun risultato per la ricerca."
                            : "Nessun risultato."}
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((c) => (
                    <tr
                      key={c.id}
                      className="border-t border-white/5 hover:bg-white/[0.03]"
                    >
                      <td className="px-2 py-2 align-middle">
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggle(c.id)}
                          className="rounded border-white/25 bg-black/40"
                        />
                      </td>
                      <td className="px-2 py-2 align-middle font-medium">
                        <span className="inline-flex items-center gap-1.5 flex-wrap">
                          <span>
                            {c.first_name} {c.last_name}
                          </span>
                          {(() => {
                            const rec = marketingContactRecency(lastContactMap.get(c.id));
                            if (rec === "today") {
                              return (
                                <span className="shrink-0 rounded border border-rose-500/35 bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-rose-100/95">
                                  Oggi
                                </span>
                              );
                            }
                            if (rec === "recent") {
                              return (
                                <span className="shrink-0 rounded border border-amber-500/35 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-100/90">
                                  Recente
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </span>
                      </td>
                      <td className="px-2 py-2 align-middle text-[#c9b299] font-mono text-[10px] sm:text-xs hidden sm:table-cell">
                        {c.phone}
                      </td>
                      <td className="px-2 py-2 align-middle text-right tabular-nums text-xs text-[#c9b299]">
                        {c.appointmentCount}
                      </td>
                      <td className="px-2 py-2 align-middle text-xs text-[#c9b299] hidden md:table-cell">
                        {formatShortDate(c.lastAppointmentMs)}
                      </td>
                      <td className="px-2 py-2 align-middle text-right text-xs text-[#c9b299] hidden md:table-cell tabular-nums">
                        {formatMoney(c.totalSpent)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="lg:col-span-2 rounded-2xl border border-white/10 bg-black/20 p-4 flex flex-col gap-3">
          <h2 className="text-sm font-bold text-[#f3d8b6]">Messaggio</h2>
          <textarea
            ref={messageTextareaRef}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setMessageQualityIssues(null);
            }}
            rows={12}
            maxLength={4096}
            placeholder="Testo del messaggio…"
            className="flex-1 min-h-[200px] rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-[#e8dcc8] placeholder:text-white/35 outline-none focus:border-[#f3d8b6]/40 resize-y"
          />
          <div className="flex flex-wrap items-center gap-2 gap-y-1">
            <button
              type="button"
              disabled={
                aiCopyLoading ||
                !message.trim() ||
                salonId == null ||
                isCentrale
              }
              onClick={() => void handleImproveMessage()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-violet-400/35 bg-violet-500/10 px-3 py-2 text-xs font-bold text-violet-200/95 hover:bg-violet-500/20 disabled:opacity-45 disabled:pointer-events-none transition"
            >
              {aiCopyLoading ? (
                <Loader2 size={14} className="animate-spin shrink-0" />
              ) : (
                <Sparkles size={14} className="shrink-0" />
              )}
              Migliora messaggio
            </button>
            {messageBeforeAi != null ? (
              <button
                type="button"
                onClick={() => {
                  setMessage(messageBeforeAi);
                  setMessageBeforeAi(null);
                  setAiCopyError(null);
                  setMessageQualityIssues(null);
                }}
                className="text-xs font-bold text-[#f3d8b6]/90 underline-offset-2 hover:underline"
              >
                Ripristina originale
              </button>
            ) : null}
          </div>
          {aiCopyError ? (
            <p className="text-xs text-rose-300/95" role="alert">
              {aiCopyError}
            </p>
          ) : null}
          <div className="text-[10px] text-white/40">{message.length} / 4096</div>

          {messageQualityIssues?.length ? (
            <div
              role="alert"
              className={[
                "rounded-xl border px-3 py-2 text-xs leading-relaxed space-y-1.5",
                messageQualityIssues.some((i) => i.kind === "block" || i.kind === "strong")
                  ? "border-rose-500/45 bg-rose-950/35 text-rose-100/95"
                  : "border-amber-500/40 bg-amber-950/25 text-amber-100/90",
              ].join(" ")}
            >
              <div className="font-bold text-[11px] uppercase tracking-wider opacity-90">
                Controlla il messaggio prima di inviare
              </div>
              <ul className="list-disc pl-4 space-y-1">
                {messageQualityIssues.map((issue, idx) => (
                  <li key={idx}>{issue.text}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {selectedContactWarnings.today > 0 || selectedContactWarnings.recent > 0 ? (
            <div
              className="rounded-xl border border-amber-500/40 bg-amber-950/25 px-3 py-2 text-xs leading-relaxed text-amber-100/90 space-y-1"
              role="status"
            >
              {selectedContactWarnings.today > 0 ? (
                <div className="space-y-0.5">
                  <div>⚠️ Alcuni clienti sono già stati contattati oggi.</div>
                  <div className="text-[11px] text-amber-100/80">
                    Consigliato non inviare nuovamente.
                  </div>
                </div>
              ) : null}
              {selectedContactWarnings.recent > 0 ? (
                <div className="space-y-0.5">
                  <div>⚠️ Alcuni clienti sono stati contattati recentemente.</div>
                  <div className="text-[11px] text-amber-100/80">
                    Valuta la frequenza per evitare spam.
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            disabled={sending || salonId == null || isCentrale}
            onClick={() => void handleSend()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#f3d8b6]/15 border border-[#f3d8b6]/35 px-4 py-3 text-sm font-bold text-[#f3d8b6] hover:bg-[#f3d8b6]/25 disabled:opacity-45 disabled:pointer-events-none transition"
          >
            {sending ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
            Invia WhatsApp
          </button>

          {sendSummary ? (
            <p className="text-xs text-[#c9b299] leading-relaxed">{sendSummary}</p>
          ) : null}
        </section>
      </div>

      {!isCentrale ? (
        <section className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-[#f3d8b6]">Ultimi invii</h2>
            {historyLoading ? (
              <span className="inline-flex items-center gap-1 text-xs text-white/45">
                <Loader2 size={14} className="animate-spin" /> Aggiornamento…
              </span>
            ) : null}
          </div>
          <p className="text-[11px] text-[#c9b299]/90">
            Registro invii manuali da questa console (ultimi 50). Europe/Rome.
          </p>
          <div className="overflow-auto rounded-xl border border-white/10 max-h-[280px]">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-[1] bg-[#1a1510] text-[10px] font-black uppercase tracking-wider text-white/45">
                <tr>
                  <th className="px-2 py-2">Cliente</th>
                  <th className="px-2 py-2 hidden sm:table-cell">Salone</th>
                  <th className="px-2 py-2">Invio</th>
                  <th className="px-2 py-2">Stato</th>
                  <th className="px-2 py-2 min-w-[8rem]">Anteprima</th>
                </tr>
              </thead>
              <tbody className="text-[#e8dcc8]">
                {historyRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-[#c9b299]">
                      {historyLoading ? "Caricamento…" : "Nessun invio registrato."}
                    </td>
                  </tr>
                ) : (
                  historyRows.map((h) => {
                    const cust = singleRel(
                      h.customers as { first_name?: string; last_name?: string } | null,
                    );
                    const sal = singleRel(h.salons as { name?: string } | null);
                    const nome = cust
                      ? `${cust.first_name ?? ""} ${cust.last_name ?? ""}`.trim()
                      : "—";
                    const ok = h.status === "sent";
                    return (
                      <tr key={h.id} className="border-t border-white/5">
                        <td className="px-2 py-2 align-top font-medium">{nome}</td>
                        <td className="px-2 py-2 align-top text-[#c9b299] hidden sm:table-cell">
                          {sal?.name ?? `#${h.salon_id}`}
                        </td>
                        <td className="px-2 py-2 align-top text-[#c9b299] whitespace-nowrap">
                          {formatRomeDateTime(h.sent_at ?? h.created_at)}
                        </td>
                        <td className="px-2 py-2 align-top">
                          <span
                            className={
                              ok
                                ? "text-emerald-300/95 font-bold"
                                : "text-rose-300/95 font-bold"
                            }
                          >
                            {ok ? "Inviato" : "Errore"}
                          </span>
                        </td>
                        <td
                          className="px-2 py-2 align-top text-[#c9b299] max-w-[14rem] truncate"
                          title={h.message_text}
                        >
                          {previewMsg(h.message_text)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
