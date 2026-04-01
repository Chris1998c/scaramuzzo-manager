// POST /api/marketing/ai-copy-assist — riscrittura messaggio marketing (OpenAI, solo server).
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { getUserAccess } from "@/lib/getUserAccess";
import { canAccessMarketingWeb } from "@/lib/marketingWebAccessShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MAX_OUT_CHARS = 700;
const MAX_INPUT_CHARS = 4096;

type Body = {
  message?: unknown;
  filterPreset?: unknown;
  segmentTitle?: unknown;
  goal?: unknown;
  salonName?: unknown;
};

function buildSystemPrompt(): string {
  return [
    "Sei un copywriter per saloni di bellezza di livello alto in Italia.",
    "Riscrivi il messaggio dell'utente in italiano, in stile WhatsApp: breve, naturale, professionale, caldo ma sobrio.",
    "Mantieni il significato e lo scopo del testo di partenza.",
    "Non usare urgenza finta, linguaggio aggressivo o promesse di sconti non richieste dal testo.",
    "Non aggiungere claim medici, legali o sanitari.",
    "Usa al massimo una emoji oppure nessuna; mai emoji eccessive.",
    `Lunghezza massima assoluta: circa ${MAX_OUT_CHARS} caratteri (testo più corto se adeguato).`,
    "Rispondi SOLO con il testo finale del messaggio, senza titoli, senza virgolette, senza spiegazioni.",
  ].join(" ");
}

function buildUserPrompt(params: {
  draft: string;
  filterPreset: string;
  segmentTitle: string;
  goal: string;
  salonName: string;
}): string {
  const parts = [
    "Bozza da migliorare:",
    params.draft,
    "",
    "Contesto (per tono coerente):",
    `- Salone: ${params.salonName || "non specificato"}`,
    `- Segmento clienti: ${params.segmentTitle || params.filterPreset || "generico"}`,
  ];
  const goalTrim = params.goal?.trim() ?? "";
  if (goalTrim) {
    parts.push(`- Obiettivo comunicativo: ${goalTrim}`);
  }
  parts.push("", "Riscrivi il messaggio applicando le regole del system.");
  return parts.join("\n");
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  let access;
  try {
    access = await getUserAccess();
  } catch (e) {
    console.error("[marketing/ai-copy-assist] getUserAccess", e);
    return NextResponse.json({ error: "Sessione non valida" }, { status: 401 });
  }

  if (!canAccessMarketingWeb(access.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 });
  }

  const draftRaw = body.message != null ? String(body.message) : "";
  const draft = draftRaw.trim().slice(0, MAX_INPUT_CHARS);
  if (!draft) {
    return NextResponse.json({ error: "Messaggio vuoto" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Assistente testo non disponibile: l’ambiente non ha la configurazione necessaria. Contatta l’amministratore di sistema.",
      },
      { status: 503 },
    );
  }

  const model =
    process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  const filterPreset = body.filterPreset != null ? String(body.filterPreset) : "";
  const segmentTitle = body.segmentTitle != null ? String(body.segmentTitle) : "";
  const goal = body.goal != null ? String(body.goal) : "";
  const salonName = body.salonName != null ? String(body.salonName) : "";

  const userPrompt = buildUserPrompt({
    draft,
    filterPreset,
    segmentTitle,
    goal,
    salonName,
  });

  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        temperature: 0.65,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;

    if (!res.ok) {
      const msg =
        (json?.error as { message?: string } | undefined)?.message ||
        `OpenAI errore HTTP ${res.status}`;
      console.error("[marketing/ai-copy-assist] openai", msg);
      return NextResponse.json(
        { error: "Riscrittura non disponibile al momento. Riprova." },
        { status: 502 },
      );
    }

    const choices = json?.choices as
      | Array<{ message?: { content?: string } }>
      | undefined;
    const raw =
      (choices?.[0]?.message?.content && String(choices[0].message.content)) || "";
    let improved = raw.trim();
    if (improved.startsWith('"') && improved.endsWith('"')) {
      improved = improved.slice(1, -1).trim();
    }
    if (!improved) {
      return NextResponse.json(
        { error: "Risposta AI vuota. Riprova o modifica la bozza." },
        { status: 502 },
      );
    }
    if (improved.length > MAX_OUT_CHARS) {
      improved = improved.slice(0, MAX_OUT_CHARS).trimEnd();
    }

    return NextResponse.json({ ok: true, improvedMessage: improved });
  } catch (e) {
    console.error("[marketing/ai-copy-assist]", e);
    return NextResponse.json(
      { error: "Errore di rete durante la riscrittura." },
      { status: 502 },
    );
  }
}
