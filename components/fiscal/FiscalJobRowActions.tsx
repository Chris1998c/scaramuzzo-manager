"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  getFiscalJobUiActions,
  type FiscalJobActionRow,
} from "@/lib/fiscal/fiscalJobActionRules";

type Props = {
  job: FiscalJobActionRow;
  canAct: boolean;
};

async function postAction(
  url: string,
  body: Record<string, unknown>,
): Promise<{ error?: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    return { error: payload.error ?? `Errore HTTP ${res.status}` };
  }
  return {};
}

function confirmMessage(
  action: "requeue" | "cancel",
  job: FiscalJobActionRow,
  extraZ: boolean,
): string {
  const base =
    action === "requeue"
      ? `Rimettere in coda il job #${job.id} (${job.kind}, ${job.status})?`
      : `Annullare il job #${job.id} (${job.kind}, ${job.status})?`;

  if (extraZ && job.kind === "z_report") {
    return `${base}\n\nATTENZIONE: job Z-REPORT — conferma solo se sei certo dell'impatto sulla sessione cassa.`;
  }
  return base;
}

export default function FiscalJobRowActions({ job, canAct }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"requeue" | "cancel" | null>(null);

  const actions = getFiscalJobUiActions(job, canAct);

  function run(
    kind: "requeue" | "cancel",
    needsZ: boolean,
  ) {
    const extraZ = needsZ && job.kind === "z_report";
    const msg = confirmMessage(kind, job, extraZ);
    if (!window.confirm(msg)) return;

    if (extraZ) {
      const typed = window.prompt(
        'Digita "Z-REPORT" per confermare l\'operazione su questo job:',
      );
      if (typed !== "Z-REPORT") return;
    }

    setBusy(kind);
    startTransition(async () => {
      const url =
        kind === "requeue" ? "/api/fiscal/requeue" : "/api/fiscal/cancel-job";
      const body: Record<string, unknown> = { job_id: job.id };
      if (extraZ) body.confirm_z_report = true;

      const result = await postAction(url, body);
      setBusy(null);

      if (result.error) {
        window.alert(result.error);
        return;
      }

      router.refresh();
    });
  }

  if (!canAct) {
    return <span className="text-[10px] text-white/30">Sola lettura</span>;
  }

  const hasAny =
    actions.requeue ||
    actions.cancel ||
    actions.requeueDisabledReason ||
    actions.cancelDisabledReason;

  if (!hasAny) {
    return <span className="text-[10px] text-white/25">—</span>;
  }

  const disabled = pending || busy != null;

  return (
    <div className="flex flex-col gap-1.5 min-w-[100px]">
      {actions.requeue ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => run("requeue", actions.requeueNeedsZConfirm)}
          className="rounded-lg border border-[#f3d8b6]/25 bg-[#f3d8b6]/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#f3d8b6] hover:bg-[#f3d8b6]/20 disabled:opacity-40"
        >
          {busy === "requeue" ? "…" : "Requeue"}
        </button>
      ) : actions.requeueDisabledReason ? (
        <span
          className="text-[9px] text-amber-200/70 leading-snug"
          title={actions.requeueDisabledReason}
        >
          Requeue N/D
        </span>
      ) : null}

      {actions.cancel ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => run("cancel", actions.cancelNeedsZConfirm)}
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-red-200/95 hover:bg-red-500/20 disabled:opacity-40"
        >
          {busy === "cancel" ? "…" : "Annulla"}
        </button>
      ) : actions.cancelDisabledReason ? (
        <span
          className="text-[9px] text-white/35 leading-snug"
          title={actions.cancelDisabledReason}
        >
          —
        </span>
      ) : null}
    </div>
  );
}

