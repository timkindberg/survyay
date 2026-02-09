import { useState, useEffect, useRef } from "react";
import type { QuestionPhase } from "../../lib/ropeTypes";
import "./AnswerPills.css";

interface AnswerOption {
  text: string;
}

interface AnswerPillsProps {
  options: AnswerOption[];
  phase: QuestionPhase;
  correctAnswerIndex?: number;
}

/**
 * Floating answer pills displayed in the sky area
 *
 * Shows answer options as pill badges during the answering phase.
 * During reveal, pills fade out to focus attention on the mountain action,
 * then the correct answer fades back in triumphantly.
 *
 * Flow:
 * 1. ANSWERING (answers_shown): All pills visible
 * 2. REVEAL START (revealed): All pills fade out quickly
 * 3. SCISSORS ANIMATION (~3.5s): Focus entirely on mountain
 * 4. RESULT: Only correct pill fades back in with celebration styling
 */
export function AnswerPills({
  options,
  phase,
  correctAnswerIndex,
}: AnswerPillsProps) {
  // Track when to show the correct pill after reveal animation
  const [showCorrectPill, setShowCorrectPill] = useState(false);
  const prevPhaseRef = useRef<QuestionPhase>("question_shown");

  // Handle reveal animation sequence
  useEffect(() => {
    // Detect transition to revealed phase
    if (phase === "revealed" && prevPhaseRef.current === "answers_shown") {
      setShowCorrectPill(false);

      // After scissors animation (~3.5s), show the correct pill
      const timer = setTimeout(() => {
        setShowCorrectPill(true);
      }, 3500);

      return () => clearTimeout(timer);
    }

    // Reset when moving to results or new question
    if (phase === "results") {
      setShowCorrectPill(true);
    }

    if (phase === "question_shown" || phase === "answers_shown") {
      setShowCorrectPill(false);
    }

    prevPhaseRef.current = phase;
  }, [phase]);

  // Don't show pills during question_shown phase
  if (phase === "question_shown") {
    return null;
  }

  // Generate option labels (A, B, C, D, ...)
  const getLabel = (index: number) => String.fromCharCode(65 + index);

  // Determine visibility states
  const shouldShowAllPills = phase === "answers_shown";
  const shouldHideAllPills = phase === "revealed" && !showCorrectPill;
  const shouldShowOnlyCorrect = (phase === "revealed" && showCorrectPill) || phase === "results";

  return (
    <div
      className={`answer-pills-container ${
        shouldHideAllPills ? "answer-pills-hidden" : ""
      }`}
    >
      {options.map((option, index) => {
        const isCorrect = index === correctAnswerIndex;
        const shouldShow = shouldShowAllPills || (shouldShowOnlyCorrect && isCorrect);

        return (
          <div
            key={index}
            className={`answer-pill ${
              isCorrect && shouldShowOnlyCorrect ? "answer-pill-correct" : ""
            } ${
              !shouldShow ? "answer-pill-hidden" : ""
            } ${
              isCorrect && shouldShowOnlyCorrect ? "answer-pill-triumphant" : ""
            }`}
          >
            {isCorrect && shouldShowOnlyCorrect && (
              <span className="answer-pill-checkmark">&#10003;</span>
            )}
            <span className="answer-pill-label">{getLabel(index)}.</span>
            <span className="answer-pill-text">{option.text}</span>
          </div>
        );
      })}
    </div>
  );
}
