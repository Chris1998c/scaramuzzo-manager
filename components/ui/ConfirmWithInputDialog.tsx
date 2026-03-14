"use client";

import { useEffect, useState } from "react";

interface ConfirmWithInputDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  requiredText: string;
  inputLabel?: string;
  variant?: "default" | "danger";
}

export function ConfirmWithInputDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Conferma",
  requiredText,
  inputLabel,
  variant = "default",
}: ConfirmWithInputDialogProps) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setValue("");
      return;
    }
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [isOpen, onClose]);

  const isMatch = value.trim() === requiredText;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-input-dialog-title"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-scz-dark shadow-[0_4px_24px_-4px_rgba(0,0,0,0.4)] overflow-hidden text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-white/10 bg-black/20">
          <h2 id="confirm-input-dialog-title" className="text-lg font-bold text-[#f3d8b6]">
            {title}
          </h2>
          <p className="mt-1.5 text-sm text-white/70">{description}</p>
          <div className="mt-4">
            <label className="block text-[10px] font-black uppercase tracking-wider text-white/50 mb-1.5">
              {inputLabel ?? `Scrivi "${requiredText}" per confermare`}
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={requiredText}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white placeholder:text-white/35 outline-none focus:border-[#f3d8b6]/40 focus:ring-1 focus:ring-[#f3d8b6]/30"
              autoComplete="off"
            />
          </div>
        </div>
        <div className="px-6 py-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-white/10 bg-black/30 text-white/90 font-medium hover:bg-black/40 transition"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={!isMatch}
            onClick={() => {
              onClose();
              setValue("");
              onConfirm();
            }}
            className={
              variant === "danger"
                ? "px-4 py-2.5 rounded-xl bg-red-500/90 text-white font-bold hover:bg-red-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
                : "px-4 py-2.5 rounded-xl bg-[#f3d8b6] text-[#1A0F0A] font-bold hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
