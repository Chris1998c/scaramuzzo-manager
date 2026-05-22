"use client";

import { ConfirmActionDialog, type ConfirmActionVariant } from "@/components/ui/ConfirmActionDialog";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: ConfirmActionVariant;
  loading?: boolean;
}

/** @deprecated Prefer ConfirmActionDialog with open/onOpenChange — wrapper per compatibilità. */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Conferma",
  variant = "default",
  loading = false,
}: ConfirmDialogProps) {
  return (
    <ConfirmActionDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      variant={variant}
      loading={loading}
      onConfirm={async () => {
        await onConfirm();
        onClose();
      }}
    />
  );
}
