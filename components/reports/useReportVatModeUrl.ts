"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { VatDisplayMode } from "@/lib/reports/reportLineKpiMath";
import { parseReportVatMode, reportVatModeQueryValue } from "@/lib/reports/reportVatMode";

/** Sincronizza toggle IVA con `vat_mode` in URL (export e deep link). */
export function useReportVatModeUrl(): [VatDisplayMode, (mode: VatDisplayMode) => void] {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [vatMode, setVatMode] = useState<VatDisplayMode>(() =>
    parseReportVatMode(searchParams.get("vat_mode")),
  );

  useEffect(() => {
    setVatMode(parseReportVatMode(searchParams.get("vat_mode")));
  }, [searchParams]);

  const setVatModeAndUrl = useCallback(
    (mode: VatDisplayMode) => {
      setVatMode(mode);
      const params = new URLSearchParams(searchParams.toString());
      params.set("vat_mode", reportVatModeQueryValue(mode));
      router.replace(`/dashboard/report?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  return [vatMode, setVatModeAndUrl];
}
