"use client";

import Link from "next/link";
import { AlertOctagon, ExternalLink } from "lucide-react";
import type { BridgeFiscalSnapshot } from "@/lib/bridge/fetchBridgeFiscalSnapshot";
import type { CriticalFiscalJob } from "@/lib/fiscal/fiscalJobCriticalList";
import { canManualRequeueJob } from "@/lib/fiscal/fiscalJobCriticalList";
import FiscalJobRowActions from "@/components/fiscal/FiscalJobRowActions";

type Props = {
  bridgeId: string;
  salonId: number;
  snapshot: BridgeFiscalSnapshot;
  canAct: boolean;
};

function categoryLabel(c: CriticalFiscalJob["category"]): string {
  switch (c) {
    case "reconcile_required":
      return "Riconciliazione";
    case "failed":
      return "Fallito";
    case "processing_stale":
      return "Processing bloccato";
    case "pending_stale":
      return "Pending lungo";
    default:
      return c;
  }
}

export default function FiscalJobActionCenter({
  bridgeId,
  salonId,
  snapshot,
  canAct,
}: Props) {
  const jobs = snapshot.critical_jobs;
  if (!jobs.length) {
    return (
      <p className="text-xs text-[#c9b299] py-2">
        Nessun job critico sul salone {salonId} (failed / reconcile / stale).
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-bold text-amber-200/90">
        <AlertOctagon size={14} />
        Action center — {bridgeId}
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-xs text-left">
          <thead className="text-[10px] uppercase text-white/45 bg-black/40">
            <tr>
              <th className="px-3 py-2">Job</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Stato</th>
              <th className="px-3 py-2">Azioni guidate</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const requeue = canManualRequeueJob(job, canAct);
              return (
                <tr key={job.id} className="border-t border-white/5">
                  <td className="px-3 py-2 font-mono">#{job.id}</td>
                  <td className="px-3 py-2">{categoryLabel(job.category)}</td>
                  <td className="px-3 py-2">
                    {job.kind} / {job.status}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2 items-start">
                      <Link
                        href={`/dashboard/fiscale?salon_id=${salonId}&status=${job.status}`}
                        className="inline-flex items-center gap-1 text-[#f3d8b6] hover:underline"
                      >
                        Vedi dettagli
                        <ExternalLink size={10} />
                      </Link>
                      {job.sale_id != null ? (
                        <Link
                          href={`/dashboard/cassa/${job.sale_id}`}
                          className="text-[#c9b299] hover:underline"
                        >
                          Apri vendita
                        </Link>
                      ) : null}
                      {job.document?.id != null ? (
                        <Link
                          href={`/api/cassa/fiscal-document?sale_id=${job.sale_id ?? ""}`}
                          className="text-[#c9b299] hover:underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Documento fiscale
                        </Link>
                      ) : null}
                      {job.category === "reconcile_required" ? (
                        <span
                          className="text-red-200/90"
                          title="Verificare stampante prima di retry"
                        >
                          Segna da riconciliare
                        </span>
                      ) : null}
                      {requeue.allowed ? (
                        <FiscalJobRowActions job={job} canAct={canAct} />
                      ) : requeue.reason ? (
                        <span
                          className="text-white/35 max-w-[140px]"
                          title={requeue.reason}
                        >
                          Requeue N/D
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
