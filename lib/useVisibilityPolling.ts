"use client";

import { useEffect, useRef } from "react";

/** Polling leggero multi-reception (no Supabase realtime). */
export const AGENDA_VISIBILITY_POLL_MS = 45_000;

export function isBrowserTabVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

type UseVisibilityPollingOptions = {
  enabled: boolean;
  intervalMs?: number;
  /** Se false, il tick viene saltato (modali, drag, ecc.). */
  canPoll: () => boolean;
  onPoll: () => void;
};

/**
 * Intervallo + refresh al ritorno tab visibile.
 * Errori gestiti dentro onPoll (no toast automatici).
 */
export function useVisibilityPolling({
  enabled,
  intervalMs = AGENDA_VISIBILITY_POLL_MS,
  canPoll,
  onPoll,
}: UseVisibilityPollingOptions): void {
  const canPollRef = useRef(canPoll);
  const onPollRef = useRef(onPoll);
  canPollRef.current = canPoll;
  onPollRef.current = onPoll;

  useEffect(() => {
    if (!enabled) return;

    const run = () => {
      if (!isBrowserTabVisible()) return;
      if (!canPollRef.current()) return;
      onPollRef.current();
    };

    const id = window.setInterval(run, intervalMs);

    const onVisibility = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, intervalMs]);
}
