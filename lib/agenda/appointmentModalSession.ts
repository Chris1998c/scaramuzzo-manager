import { useEffect, useRef } from "react";

export type ModalFieldTouchFlags = {
  startTime: boolean;
  customer: boolean;
  staff: boolean;
};

export function createEmptyTouchFlags(): ModalFieldTouchFlags {
  return { startTime: false, customer: false, staff: false };
}

/** Evita overwrite di campi dopo modifica utente (init one-shot + correzione async ore). */
export function useModalFieldTouches() {
  const touchedRef = useRef<ModalFieldTouchFlags>(createEmptyTouchFlags());

  return {
    touchedRef,
    resetTouches: () => {
      touchedRef.current = createEmptyTouchFlags();
    },
    markStartTimeTouched: () => {
      touchedRef.current.startTime = true;
    },
    markCustomerTouched: () => {
      touchedRef.current.customer = true;
    },
    markStaffTouched: () => {
      touchedRef.current.staff = true;
    },
  };
}

/**
 * Esegue reset form una sola volta per sessionKey (apertura modal / nuovo slot / nuovo appointment).
 */
export function useOneShotModalSession(
  isOpen: boolean,
  sessionKey: string | null | undefined,
  onReset: () => void,
) {
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      lastKeyRef.current = null;
      return;
    }
    const key = sessionKey ?? "";
    if (!key || lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    onReset();
  }, [isOpen, sessionKey, onReset]);
}
