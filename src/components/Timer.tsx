import { useState, useEffect, useRef } from "react";

interface TimerProps {
  /** When the first answer was submitted (starts the timer) */
  firstAnsweredAt: number | null;
  /** Time limit in seconds */
  timeLimit: number;
  /** Called when timer reaches 0 */
  onExpire?: () => void;
  /** Size variant */
  size?: "small" | "medium" | "large";
  /** Whether the reveal has been triggered (timer should freeze) */
  isRevealed?: boolean;
  /** The correct answer text to show after reveal animation completes */
  correctAnswer?: string;
  /** Number of players who got it right (optional) */
  correctCount?: number;
  /** Total number of players who answered (optional) */
  totalAnswered?: number;
}

// Time to wait after reveal starts before showing results (match animation duration)
const REVEAL_ANIMATION_DURATION = 3500; // 1.5s scissors + ~2s snipping sequence

export function Timer({
  firstAnsweredAt,
  timeLimit,
  onExpire,
  size = "medium",
  isRevealed = false,
  correctAnswer,
  correctCount,
  totalAnswered,
}: TimerProps) {
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [frozenTime, setFrozenTime] = useState<number | null>(null);
  const [revealComplete, setRevealComplete] = useState(false);
  const revealStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    // If no first answer yet, timer hasn't started
    if (firstAnsweredAt === null) {
      setTimeRemaining(null);
      setFrozenTime(null);
      setRevealComplete(false);
      revealStartTimeRef.current = null;
      return;
    }

    // When reveal triggers, freeze the current time and start tracking reveal animation
    if (isRevealed && frozenTime === null && timeRemaining !== null) {
      setFrozenTime(timeRemaining);
      revealStartTimeRef.current = Date.now();
      return;
    }

    // If already revealed, don't update countdown, but check if reveal animation is complete
    if (isRevealed && frozenTime !== null) {
      return;
    }

    function updateTimer() {
      const now = Date.now();
      const elapsed = now - firstAnsweredAt!;
      const remaining = Math.max(0, timeLimit * 1000 - elapsed);
      setTimeRemaining(remaining);

      if (remaining <= 0 && onExpire) {
        onExpire();
      }
    }

    // Initial update
    updateTimer();

    // Update every 100ms for smooth countdown
    const interval = setInterval(updateTimer, 100);

    return () => clearInterval(interval);
  }, [firstAnsweredAt, timeLimit, onExpire, isRevealed, frozenTime]);

  // Track reveal animation completion
  useEffect(() => {
    if (!isRevealed || !revealStartTimeRef.current) {
      setRevealComplete(false);
      return;
    }

    const checkRevealComplete = () => {
      if (revealStartTimeRef.current) {
        const elapsed = Date.now() - revealStartTimeRef.current;
        if (elapsed >= REVEAL_ANIMATION_DURATION) {
          setRevealComplete(true);
        }
      }
    };

    // Check immediately in case we're already past the duration
    checkRevealComplete();

    // Set up interval to check
    const interval = setInterval(checkRevealComplete, 100);

    return () => clearInterval(interval);
  }, [isRevealed]);

  // Timer hasn't started yet
  if (timeRemaining === null && frozenTime === null) {
    return (
      <div className={`timer timer-${size} timer-waiting`}>
        <span className="timer-value">{timeLimit}</span>
        <span className="timer-label">Waiting...</span>
      </div>
    );
  }

  // Use frozen time if revealed, otherwise use current timeRemaining
  const displayTime = frozenTime !== null ? frozenTime : timeRemaining!;
  const seconds = Math.ceil(displayTime / 1000);
  const fraction = displayTime / (timeLimit * 1000);
  const isUrgent = fraction < 0.25; // Last 25% of time
  const isWarning = fraction < 0.5 && !isUrgent; // 25-50% of time

  // Reveal animation complete - show the correct answer
  if (isRevealed && revealComplete) {
    const statsText = correctCount !== undefined && totalAnswered !== undefined
      ? `${correctCount}/${totalAnswered} correct`
      : null;

    // If we have the correct answer, show it prominently
    if (correctAnswer) {
      return (
        <div className={`timer timer-${size} timer-results`}>
          <div className="timer-progress timer-progress-correct" style={{ width: "100%" }} />
          <span className="timer-value timer-value-answer">{correctAnswer}</span>
          <span className="timer-label">{statsText ?? "Correct Answer"}</span>
        </div>
      );
    }

    // Fallback if no correct answer text provided (e.g., poll mode or data not loaded)
    return (
      <div className={`timer timer-${size} timer-results`}>
        <div className="timer-progress timer-progress-correct" style={{ width: "100%" }} />
        <span className="timer-value">Results</span>
        <span className="timer-label">{statsText ?? "Complete"}</span>
      </div>
    );
  }

  // Still revealing - show animation state
  if (isRevealed) {
    return (
      <div className={`timer timer-${size} timer-revealed`}>
        <div className="timer-progress timer-progress-revealing" style={{ width: "100%" }} />
        <span className="timer-value">Reveal!</span>
        <span className="timer-label">Revealing...</span>
      </div>
    );
  }

  return (
    <div
      className={`timer timer-${size} ${isUrgent ? "timer-urgent" : ""} ${isWarning ? "timer-warning" : ""} ${seconds === 0 ? "timer-expired" : ""}`}
    >
      <div
        className="timer-progress"
        style={{ width: `${fraction * 100}%` }}
      />
      <span className="timer-value">{seconds}</span>
      <span className="timer-label">{seconds === 0 ? "Time's up!" : "sec"}</span>
    </div>
  );
}
