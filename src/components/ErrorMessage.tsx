import { useEffect, useState } from "react";

interface ErrorMessageProps {
  /** The error message to display */
  message: string | null;
  /** Called when the error should be cleared (user dismisses or auto-dismiss) */
  onDismiss?: () => void;
  /** Auto-dismiss after this many milliseconds (0 = no auto-dismiss) */
  autoDismissMs?: number;
  /** Visual variant of the error display */
  variant?: "inline" | "toast" | "banner";
  /** Additional CSS class name */
  className?: string;
}

/**
 * Displays error messages in a user-friendly way.
 * Supports different visual variants and auto-dismiss functionality.
 */
export function ErrorMessage({
  message,
  onDismiss,
  autoDismissMs = 0,
  variant = "inline",
  className = "",
}: ErrorMessageProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isExiting, setIsExiting] = useState(false);

  // Reset visibility when message changes
  useEffect(() => {
    if (message) {
      setIsVisible(true);
      setIsExiting(false);
    }
  }, [message]);

  // Auto-dismiss timer
  useEffect(() => {
    if (!message || autoDismissMs <= 0) return;

    const timer = setTimeout(() => {
      handleDismiss();
    }, autoDismissMs);

    return () => clearTimeout(timer);
  }, [message, autoDismissMs]);

  function handleDismiss() {
    setIsExiting(true);
    // Wait for exit animation before fully dismissing
    setTimeout(() => {
      setIsVisible(false);
      onDismiss?.();
    }, 200);
  }

  if (!message || !isVisible) {
    return null;
  }

  const baseClass = `error-message error-message--${variant}`;
  const exitingClass = isExiting ? "error-message--exiting" : "";
  const fullClassName = `${baseClass} ${exitingClass} ${className}`.trim();

  return (
    <div className={fullClassName} role="alert">
      <span className="error-message__icon">!</span>
      <span className="error-message__text">{message}</span>
      {onDismiss && (
        <button
          className="error-message__dismiss"
          onClick={handleDismiss}
          aria-label="Dismiss error"
        >
          x
        </button>
      )}
    </div>
  );
}
