import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Radio } from "lucide-react";
import { createServerSupabase } from "@/lib/supabaseServer";
import { getUserAccess } from "@/lib/getUserAccess";
import {
  canAccessFiscalJobsWeb,
  canPickSalonFilterOnFiscalJobs,
  resolveSalonIdFilter,
} from "@/lib/fiscalJobsWebAccess";
import { canActOnFiscalJobsWeb } from "@/lib/fiscalJobsWebAccessShared";
import {
  fetchFiscalPrintJobsDashboard,
  type FiscalJobKind,
  type FiscalJobStatus,
} from "@/lib/fiscal/fetchFiscalPrintJobsDashboard";
import { fetchFiscalHealthMetrics } from "@/lib/fiscal/fetchFiscalHealthMetrics";
import { buildFiscalHealthWarnings } from "@/lib/fiscal/buildFiscalHealthWarnings";
import { probePrintBridgeHealth } from "@/lib/fiscal/probePrintBridgeHealth";
import FiscalJobsFilters from "@/components/fiscal/FiscalJobsFilters";
import FiscalJobsTable from "@/components/fiscal/FiscalJobsTable";
import FiscalHealthPanel from "@/components/fiscal/FiscalHealthPanel";

const VALID_STATUSES = new Set([
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

const VALID_KINDS = new Set(["sale_receipt", "void_receipt", "z_report"]);

function toInt(x: string | undefined): number | null {
  const n = x ? Number(x) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

type PageSearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: Promise<PageSearchParams>;
};

export default async function FiscalePage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};

  const supabase = await createServerSupabase();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) redirect("/login");

  const access = await getUserAccess();
  if (!canAccessFiscalJobsWeb(access.role)) redirect("/dashboard");

  const rawSalon = sp.salon_id;
  const querySalonNum =
    typeof rawSalon === "string"
      ? Number(rawSalon)
      : Array.isArray(rawSalon)
        ? Number(rawSalon[0])
        : NaN;
  const querySalonId = Number.isFinite(querySalonNum) ? querySalonNum : null;

  const statusRaw = (sp.status as string | undefined) ?? "";
  const kindRaw = (sp.kind as string | undefined) ?? "";

  const statusFilter = VALID_STATUSES.has(statusRaw)
    ? (statusRaw as FiscalJobStatus)
    : null;
  const kindFilter = VALID_KINDS.has(kindRaw)
    ? (kindRaw as FiscalJobKind)
    : null;

  const salonId = resolveSalonIdFilter(access, querySalonId);

  const [{ rows, error }, healthResult, bridge] = await Promise.all([
    fetchFiscalPrintJobsDashboard({
      salonId,
      status: statusFilter,
      kind: kindFilter,
      limit: 100,
    }),
    fetchFiscalHealthMetrics(salonId),
    probePrintBridgeHealth(),
  ]);

  const warnings = buildFiscalHealthWarnings(healthResult.metrics, bridge);

  const showSalonFilter = canPickSalonFilterOnFiscalJobs(access.role);
  const salonOptions = access.allowedSalons;
  const canAct = canActOnFiscalJobsWeb(access.role);

  const pendingCount = rows.filter((r) => r.status === "pending").length;
  const failedCount = rows.filter((r) => r.status === "failed").length;
  const completedCount = rows.filter((r) => r.status === "completed").length;

  return (
    <div className="max-w-[1600px] mx-auto px-3 py-4 md:px-5 space-y-4 pb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold text-[#f3d8b6] tracking-tight">
            Job fiscali
          </h1>
          <p className="text-sm text-white/50 mt-0.5">
            Coda stampa e documenti
            {canAct ? " · puoi riprovare o annullare i job" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Link
            href="/dashboard/fiscale/bridge"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-[#f3d8b6] hover:bg-white/[0.06]"
          >
            <Radio size={14} />
            Bridge stampa
          </Link>
          <StatChip label="Righe" value={rows.length} />
          <StatChip label="In coda" value={pendingCount} variant="warn" />
          <StatChip label="Falliti" value={failedCount} variant="err" />
          <StatChip label="Completati" value={completedCount} variant="ok" />
        </div>
      </div>

 <FiscalHealthPanel
 metrics={healthResult.metrics}
 bridge={bridge}
 warnings={warnings}
 metricsError={healthResult.error}
 />

 <Suspense fallback={null}>
 <FiscalJobsFilters
 salonId={salonId != null && salonId > 0 ? salonId : null}
 status={statusRaw}
 kind={kindRaw}
 salonOptions={salonOptions}
 showSalonFilter={showSalonFilter}
 />
 </Suspense>

 <FiscalJobsTable rows={rows} loadError={error} canAct={canAct} />
 </div>
 );
}

function StatChip({
  label,
  value,
  variant = "neutral",
}: {
  label: string;
  value: number;
  variant?: "neutral" | "ok" | "warn" | "err";
}) {
  const styles = {
    neutral: "border-white/10 bg-black/25 text-[#f3d8b6]",
    ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200/95",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-200/95",
    err: "border-red-500/30 bg-red-500/10 text-red-200/95",
  };

  return (
    <div className={`rounded-lg border px-2.5 py-1.5 text-center min-w-[72px] ${styles[variant]}`}>
      <div className="text-[11px] text-white/50">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}
