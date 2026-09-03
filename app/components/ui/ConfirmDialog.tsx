"use client";

import { Modal } from "./Modal";
import { Button } from "./Button";

interface ConfirmDialogProps {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal onClose={onCancel} labelledBy="confirm-dialog-title">
      <div className="text-center">
        <h3 id="confirm-dialog-title" className="mb-1.5 text-lg font-extrabold">
          {title}
        </h3>
        {description ? <p className="mb-5 text-[0.85rem] leading-normal text-text-muted">{description}</p> : null}

        <div className={`flex justify-center gap-3 ${description ? "" : "mt-5"}`}>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant="primary" danger={danger} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
