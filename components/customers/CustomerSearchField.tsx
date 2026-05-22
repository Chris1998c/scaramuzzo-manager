"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useDeferredValue,
} from "react";
import { createPortal } from "react-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Loader2, Search } from "lucide-react";
import { fetchServerCustomerSearch } from "@/lib/customers/customerPickerUi";
import type { CustomerPickerRow } from "@/lib/customers/customerPickerUi";
import {
  CUSTOMER_SERVER_DEBOUNCE_MS,
  CUSTOMER_VISIBLE_MAX,
  customerQueryCacheKey,
  filterPreloadPool,
  getCachedQueryResults,
  mergeCustomerSearchResults,
  preloadCustomerSearchPool,
  setCachedQueryResults,
} from "@/lib/customers/customerSearchCache";

const MIN_QUERY_LEN = 2;
const ROW_HEIGHT_PX = 36;
const DROPDOWN_MAX_HEIGHT = ROW_HEIGHT_PX * CUSTOMER_VISIBLE_MAX;

type Props = {
  supabase: SupabaseClient;
  enabled: boolean;
  selectedCustomerId: string;
  onSelectCustomerId: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
  dropdownZIndexClass?: string;
  variant?: "default" | "compact";
  preloadSalonId?: number | string | null;
  initialDisplayLabel?: string;
};

export default function CustomerSearchField({
  supabase,
  enabled,
  selectedCustomerId,
  onSelectCustomerId,
  disabled = false,
  placeholder = "Cerca cliente (nome, cognome, telefono, codice)...",
  dropdownZIndexClass = "z-[130]",
  variant = "default",
  preloadSalonId = null,
  initialDisplayLabel = "",
}: Props) {
  const [q, setQ] = useState("");
  const [poolReady, setPoolReady] = useState(false);
  const [serverPatch, setServerPatch] = useState<{
    queryKey: string;
    rows: CustomerPickerRow[];
    error: string | null;
  } | null>(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const anchorRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const sessionRef = useRef(0);
  const [menuRect, setMenuRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const trimmed = q.trim();
  const canSearch = trimmed.length >= MIN_QUERY_LEN;
  const deferredQuery = useDeferredValue(trimmed);
  const queryKey = canSearch ? customerQueryCacheKey(trimmed) : "";

  const salonIdForPreload = useMemo(() => {
    if (preloadSalonId == null || preloadSalonId === "") return null;
    const n = Number(preloadSalonId);
    return Number.isFinite(n) ? n : null;
  }, [preloadSalonId]);

  const instantRows = useMemo(() => {
    if (!canSearch) return [];
    const cached = getCachedQueryResults(salonIdForPreload, trimmed);
    if (cached?.length) return cached;
    if (!poolReady) return [];
    return filterPreloadPool(salonIdForPreload, trimmed, CUSTOMER_VISIBLE_MAX);
  }, [canSearch, trimmed, poolReady, salonIdForPreload]);

  const displayRows = useMemo(() => {
    if (!canSearch) return [];
    const cached = getCachedQueryResults(salonIdForPreload, trimmed);
    if (cached?.length) return cached;
    if (serverPatch?.queryKey === queryKey && deferredQuery === trimmed) {
      return mergeCustomerSearchResults(
        instantRows,
        serverPatch.rows,
        CUSTOMER_VISIBLE_MAX,
      );
    }
    return instantRows;
  }, [canSearch, salonIdForPreload, trimmed, queryKey, deferredQuery, instantRows, serverPatch]);

  const showSpinner =
    canSearch && serverLoading && instantRows.length === 0 && displayRows.length === 0;
  const showDropdown = dropdownOpen && enabled && !disabled;

  useEffect(() => {
    if (!enabled) return;

    const session = ++sessionRef.current;
    setQ(initialDisplayLabel.trim() && selectedCustomerId ? initialDisplayLabel.trim() : "");
    setServerPatch(null);
    setServerLoading(false);
    setDropdownOpen(false);
    setHighlightIndex(-1);
    setPoolReady(false);

    void preloadCustomerSearchPool(supabase, { salonId: salonIdForPreload }).then(() => {
      if (sessionRef.current === session) setPoolReady(true);
    });
  }, [enabled, supabase, salonIdForPreload, initialDisplayLabel, selectedCustomerId]);

  useEffect(() => {
    if (!enabled || deferredQuery.length < MIN_QUERY_LEN) {
      setServerLoading(false);
      return;
    }

    const deferKey = customerQueryCacheKey(deferredQuery);
    const cached = getCachedQueryResults(salonIdForPreload, deferredQuery);
    if (cached) {
      setServerPatch({ queryKey: deferKey, rows: cached, error: null });
      setServerLoading(false);
      return;
    }

    const instantAtDefer = filterPreloadPool(salonIdForPreload, deferredQuery, CUSTOMER_VISIBLE_MAX);
    setServerLoading(instantAtDefer.length === 0);

    const reqId = ++requestIdRef.current;
    const timer = window.setTimeout(async () => {
      try {
        const { rows: serverRows, error } = await fetchServerCustomerSearch(
          supabase,
          deferredQuery,
        );
        if (requestIdRef.current !== reqId) return;

        const merged = mergeCustomerSearchResults(
          filterPreloadPool(salonIdForPreload, deferredQuery, CUSTOMER_VISIBLE_MAX),
          serverRows,
          CUSTOMER_VISIBLE_MAX,
        );
        setCachedQueryResults(salonIdForPreload, deferredQuery, merged);
        setServerPatch({ queryKey: deferKey, rows: serverRows, error });
        setHighlightIndex(merged.length > 0 ? 0 : -1);
      } finally {
        if (requestIdRef.current === reqId) setServerLoading(false);
      }
    }, CUSTOMER_SERVER_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [enabled, deferredQuery, supabase, salonIdForPreload]);

  useEffect(() => {
    if (!canSearch) {
      setHighlightIndex(-1);
      return;
    }
    setHighlightIndex(displayRows.length > 0 ? 0 : -1);
  }, [queryKey, displayRows.length, canSearch, salonIdForPreload]);

  useEffect(() => {
    if (!showDropdown) {
      setMenuRect(null);
      return;
    }
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setMenuRect({ top: r.bottom + 6, left: r.left, width: r.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [showDropdown, displayRows.length]);

  const selectRow = useCallback(
    (c: CustomerPickerRow) => {
      onSelectCustomerId(String(c.id));
      setQ(c.full_name);
      setDropdownOpen(false);
      setHighlightIndex(-1);
    },
    [onSelectCustomerId],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || !canSearch) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (displayRows.length === 0) return;
      setHighlightIndex((i) => (i < displayRows.length - 1 ? i + 1 : 0));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (displayRows.length === 0) return;
      setHighlightIndex((i) => (i > 0 ? i - 1 : displayRows.length - 1));
      return;
    }
    if (e.key === "Enter" && highlightIndex >= 0 && displayRows[highlightIndex]) {
      e.preventDefault();
      selectRow(displayRows[highlightIndex]);
    }
    if (e.key === "Escape") {
      setDropdownOpen(false);
      setHighlightIndex(-1);
    }
  };

  const inputClass =
    variant === "compact"
      ? "w-full rounded-lg bg-black/40 border border-white/10 px-2.5 py-2 pl-8 pr-8 text-xs text-white placeholder:text-white/35 outline-none focus:border-[#f3d8b6]/40 focus:ring-1 focus:ring-[#f3d8b6]/25"
      : "w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-11 outline-none focus:border-[#f3d8b6]/50 transition-all text-white";

  const searchIconClass =
    variant === "compact"
      ? "absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none"
      : "absolute left-4 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none";

  const spinnerClass =
    variant === "compact"
      ? "absolute right-2.5 top-1/2 -translate-y-1/2 text-[#f3d8b6]/70"
      : "absolute right-4 top-1/2 -translate-y-1/2 text-[#f3d8b6]/70";

  const dropdownMenu =
    showDropdown && menuRect ? (
      <div
        className={`fixed ${dropdownZIndexClass} overflow-hidden rounded-xl border border-white/12 bg-[#1a100c] shadow-lg`}
        style={{
          top: menuRect.top,
          left: menuRect.left,
          width: menuRect.width,
          height: DROPDOWN_MAX_HEIGHT,
        }}
        role="listbox"
      >
        <div className="h-full overflow-y-auto">
          {!canSearch ? (
            <p className="px-3 py-2.5 text-xs text-white/45 leading-9">
              Digita almeno {MIN_QUERY_LEN} caratteri
            </p>
          ) : serverPatch?.error && displayRows.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-red-300/90">{serverPatch.error}</p>
          ) : displayRows.length === 0 && showSpinner ? (
            <p className="px-3 text-xs text-white/45 leading-9">Ricerca…</p>
          ) : displayRows.length === 0 ? (
            <p className="px-3 text-xs text-white/50 leading-9">Nessun cliente trovato</p>
          ) : (
            displayRows.map((c, idx) => {
              const active = String(c.id) === String(selectedCustomerId);
              const highlighted = idx === highlightIndex;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={active || highlighted}
                  onMouseEnter={() => setHighlightIndex(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectRow(c)}
                  style={{ height: ROW_HEIGHT_PX }}
                  className={`w-full px-3 text-left flex justify-between gap-2 text-sm transition-colors ${
                    highlighted || active
                      ? "bg-[#f3d8b6]/18 text-[#f3d8b6]"
                      : "text-white/90 hover:bg-white/10"
                  }`}
                >
                  <span className="truncate font-medium leading-9">{c.full_name}</span>
                  {(c.phone || c.customer_code) && (
                    <span className="text-[10px] text-white/35 shrink-0 tabular-nums leading-9">
                      {c.phone || c.customer_code}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    ) : null;

  return (
    <div className="relative" ref={anchorRef}>
      <Search className={searchIconClass} size={variant === "compact" ? 14 : 18} />
      {showSpinner ? (
        <Loader2 className={`${spinnerClass} animate-spin`} size={variant === "compact" ? 14 : 16} />
      ) : null}
      <input
        type="text"
        className={inputClass}
        placeholder={placeholder}
        value={q}
        disabled={disabled}
        onChange={(e) => {
          setQ(e.target.value);
          setDropdownOpen(true);
        }}
        onFocus={() => setDropdownOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setDropdownOpen(false), 160);
        }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        role="combobox"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
      />
      {typeof document !== "undefined" && dropdownMenu
        ? createPortal(dropdownMenu, document.body)
        : null}
    </div>
  );
}
