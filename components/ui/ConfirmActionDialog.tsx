"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export type ConfirmActionVariant = "default" | "danger" | "warning";

export type ConfirmActionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmActionVariant;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
};

const confirmButtonClass: Record<ConfirmActionVariant, string> = {
  default:
    "bg-[#f3d8b6] text-[#1A0F0A] hover:opacity-90 border border-[#f3d8b6]/80",
  warning:
    "bg-amber-500/20 text-amber-100 border border-amber-500/35 hover:bg-amber-500/30",
  danger:
    "bg-amber-700/35 text-amber-50 border border-amber-600/40 hover:bg-amber-700/45",
};

export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Conferma",
  cancelLabel = "Annulla",
  variant = "default",
  loading = false,
  onConfirm,
}: ConfirmActionDialogProps) {
  function handleConfirm() {
    void Promise.resolve(onConfirm());
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        size="default"
        className={cn(
          "max-w-md border border-white/10 bg-scz-dark text-white shadow-[0_4px_24px_-4px_rgba(0,0,0,0.5)]",
          "ring-white/10 sm:max-w-md",
        )}
      >
        <AlertDialogHeader className="text-left place-items-start sm:place-items-start sm:text-left">
          <AlertDialogTitle className="text-lg font-bold text-[#f3d8b6]">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-white/70 whitespace-pre-line">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="border-t border-white/10 bg-black/20 sm:justify-end gap-2">
          <AlertDialogCancel
            disabled={loading}
            className="rounded-xl border border-white/10 bg-black/30 text-white/90 hover:bg-black/40"
          >
            {cancelLabel}
          </AlertDialogCancel>
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleConfirm()}
            className={cn(
              "inline-flex h-8 items-center justify-center rounded-lg px-4 text-sm font-bold transition disabled:opacity-40 disabled:cursor-not-allowed",
              confirmButtonClass[variant],
            )}
          >
            {loading ? "Attendere…" : confirmLabel}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
