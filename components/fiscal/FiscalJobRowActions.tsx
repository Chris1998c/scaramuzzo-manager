"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  getFiscalJobUiActions,
  type FiscalJobActionRow,
} from "@/lib/fiscal/fiscalJobActionRules";
import { ConfirmActionDialog } from "@/components/ui/ConfirmActionDialog";
import { ConfirmWithInputDialog } from "@/components/ui/ConfirmWithInputDialog";

type Props = {
  job: FiscalJobActionRow;
  canAct: boolean;
};

type PendingRun = {
  kind: "requeue" | "cancel";
  needsZ: boolean;
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

function confirmCopy(
  action: "requeue" | "cancel",
  job: FiscalJobActionRow,
  extraZ: boolean,
): { title: string; description: string } {
  const verb = action === "requeue" ? "Rimettere in coda" : "Annullare";
  const base = `${verb} il job #${job.id} (${job.kind}, ${job.status})?`;

  if (extraZ && job.kind === "z_report") {
    return {
      title: action === "requeue" ? "Requeue Z-REPORT" : "Annulla Z-REPORT",
      description: `${base}\n\nAttenzione: impatto possibile sulla sessione cassa. Conferma solo se sei sicuro.`,
    };
  }

  return {
    title: action === "requeue" ? "Requeue job fiscale" : "Annulla job fiscale",
    description: base,
  };
}

export default function FiscalJobRowActions({ job, canAct }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"requeue" | "cancel" | null>(null);
  const [pendingRun, setPendingRun] = useState<PendingRun | null>(null);
  const [zPendingRun, setZPendingRun] = useState<PendingRun | null>(null);
  const [zInputOpen, setZInputOpen] = useState(false);

  const actions = getFiscalJobUiActions(job, canAct);

  async function executeRun(run: PendingRun) {
    setBusy(run.kind);
    startTransition(async () => {
      const url =
        run.kind === "requeue" ? "/api/fiscal/requeue" : "/api/fiscal/cancel-job";
      const body: Record<string, unknown> = { job_id: job.id };
      const extraZ = run.needsZ && job.kind === "z_report";
      if (extraZ) body.confirm_z_report = true;

      const result = await postAction(url, body);
      setBusy(null);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(
        run.kind === "requeue" ? "Job rimesso in coda." : "Job annullato.",
      );
      router.refresh();
    });
  }

  function beginRun(kind: "requeue" | "cancel", needsZ: boolean) {
    setPendingRun({ kind, needsZ });
  }

  function afterFirstConfirm() {
    if (!pendingRun) return;
    const run = pendingRun;
    setPendingRun(null);
    const extraZ = run.needsZ && job.kind === "z_report";
    if (extraZ) {
      setZPendingRun(run);
      setZInputOpen(true);
      return;
    }
    void executeRun(run);
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
  const dialogCopy = pendingRun
    ? confirmCopy(pendingRun.kind, job, pendingRun.needsZ && job.kind === "z_report")
    : null;

  return (
    <>
      <div className="flex flex-col gap-1.5 min-w-[100px]">
        {actions.requeue ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => beginRun("requeue", actions.requeueNeedsZConfirm)}
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
            onClick={() => beginRun("cancel", actions.cancelNeedsZConfirm)}
            className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-200/95 hover:bg-amber-500/20 disabled:opacity-40"
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

      {dialogCopy && pendingRun ? (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => {
            if (!open) setPendingRun(null);
          }}
          title={dialogCopy.title}
          description={dialogCopy.description}
          confirmLabel={pendingRun.kind === "requeue" ? "Requeue" : "Annulla job"}
          variant={pendingRun.kind === "cancel" ? "warning" : "default"}
          loading={busy != null}
          onConfirm={afterFirstConfirm}
        />
      ) : null}

      <ConfirmWithInputDialog
        isOpen={zInputOpen}
        onClose={() => {
          setZInputOpen(false);
          setZPendingRun(null);
        }}
        onConfirm={() => {
          const run = zPendingRun;
          setZInputOpen(false);
          setZPendingRun(null);
          if (run) void executeRun(run);
        }}
        title="Conferma Z-REPORT"
        description="Operazione sensibile sulla chiusura giornaliera. Digita il testo richiesto per procedere."
        confirmLabel="Conferma operazione"
        requiredText="Z-REPORT"
        inputLabel='Scrivi "Z-REPORT" per confermare'
        variant="danger"
      />
    </>
  );
}
