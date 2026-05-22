import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Receipt, Radio } from "lucide-react";
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
    <div className="max-w-[1600px] mx-auto space-y-6 pb-4">
      <section className="rounded-3xl border border-white/10 bg-scz-dark shadow-[0_0_60px_rgba(0,0,0,0.25)] overflow-hidden">
        <div className="flex flex-col gap-5 p-5 md:p-7 bg-black/20 border-b border-white/10 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4 min-w-0">
            <div className="shrink-0 rounded-2xl p-3 bg-black/30 border border-white/10">
              <Receipt className="text-[#f3d8b6]" size={28} strokeWidth={1.7} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-wider text-white/50 mb-1">
                Modulo
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-[#f3d8b6] tracking-tight">
                Job fiscali
              </h1>
              <p className="text-[#c9b299] mt-1 text-sm md:text-base leading-relaxed">
                Monitoraggio job fiscali e documenti collegati
                {canAct ? " · azioni operative per coordinator/magazzino" : ""}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 sm:justify-end items-center">
            <Link
              href="/dashboard/fiscale/bridge"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs font-bold text-[#f3d8b6] hover:bg-white/5"
            >
              <Radio size={14} />
              Bridge stampa
            </Link>
            <StatChip label="Righe" value={rows.length} />
            <StatChip label="Pending" value={pendingCount} variant="warn" />
            <StatChip label="Failed" value={failedCount} variant="err" />
            <StatChip label="Completed" value={completedCount} variant="ok" />
          </div>
        </div>
      </section>

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
    <div
      className={`rounded-2xl border px-4 py-2.5 text-center min-w-[88px] ${styles[variant]}`}
    >
      <div className="text-[10px] font-black uppercase tracking-wider opacity-70">
        {label}
      </div>
      <div className="text-xl font-extrabold tabular-nums">{value}</div>
    </div>
  );
}
