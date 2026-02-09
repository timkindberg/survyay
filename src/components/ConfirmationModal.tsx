import { useEffect, useCallback } from "react";
import "./ConfirmationModal.css";

export interface ConfirmationModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "danger";
}

/**
 * A reusable confirmation modal that replaces native confirm() dialogs.
 * Supports keyboard navigation (Escape to cancel) and click-outside to dismiss.
 */
export function ConfirmationModal({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
}: ConfirmationModalProps) {
  // Handle escape key to close
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    },
    [onCancel]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      // Prevent body scrolling while modal is open
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "";
      };
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="confirmation-modal-overlay" onClick={onCancel}>
      <div
        className="confirmation-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "confirmation-title" : undefined}
        aria-describedby="confirmation-message"
      >
        {title && (
          <h3 id="confirmation-title" className="confirmation-modal-title">
            {title}
          </h3>
        )}
        <p id="confirmation-message" className="confirmation-modal-message">
          {message}
        </p>
        <div className="confirmation-modal-actions">
          <button
            onClick={onCancel}
            className="confirmation-modal-cancel"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`confirmation-modal-confirm ${variant === "danger" ? "danger" : ""}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook for managing confirmation modal state.
 * Returns state and handlers for a single confirmation modal with dynamic content.
 */
export interface ConfirmationState {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmText: string;
  cancelText: string;
  variant: "default" | "danger";
  onConfirmAction: (() => void) | null;
}

export interface UseConfirmationReturn {
  state: ConfirmationState;
  confirm: (options: {
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "default" | "danger";
    onConfirm: () => void;
  }) => void;
  handleConfirm: () => void;
  handleCancel: () => void;
}

import { useState } from "react";

export function useConfirmation(): UseConfirmationReturn {
  const [state, setState] = useState<ConfirmationState>({
    isOpen: false,
    message: "",
    confirmText: "Confirm",
    cancelText: "Cancel",
    variant: "default",
    onConfirmAction: null,
  });

  const confirm = useCallback(
    (options: {
      title?: string;
      message: string;
      confirmText?: string;
      cancelText?: string;
      variant?: "default" | "danger";
      onConfirm: () => void;
    }) => {
      setState({
        isOpen: true,
        title: options.title,
        message: options.message,
        confirmText: options.confirmText ?? "Confirm",
        cancelText: options.cancelText ?? "Cancel",
        variant: options.variant ?? "default",
        onConfirmAction: options.onConfirm,
      });
    },
    []
  );

  const handleConfirm = useCallback(() => {
    const action = state.onConfirmAction;
    setState((prev) => ({ ...prev, isOpen: false, onConfirmAction: null }));
    if (action) {
      action();
    }
  }, [state.onConfirmAction]);

  const handleCancel = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false, onConfirmAction: null }));
  }, []);

  return { state, confirm, handleConfirm, handleCancel };
}
