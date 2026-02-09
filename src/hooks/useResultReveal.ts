import { useState, useEffect, useRef } from "react";
import type { PlayerRopeState } from "../../lib/ropeTypes";
import { hashString, shuffleWithSeed } from "../../lib/shuffle";

/**
 * Hook that manages the delayed result reveal timing for the player view.
 * Syncs the player's result display with the scissors animation sequence
 * in the spectator/host Mountain view.
 *
 * Returns whether the player's individual result should be shown.
 * Before reveal: shows tension/scissors animation.
 * After reveal: shows correct/wrong result banner.
 */
export function useResultReveal({
  playerRopeState,
  currentQuestionId,
}: {
  playerRopeState: PlayerRopeState | null | undefined;
  currentQuestionId: string | null;
}): boolean {
  const [playerResultRevealed, setPlayerResultRevealed] = useState(false);
  const revealTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevRevealedQuestionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!playerRopeState || !currentQuestionId) {
      return;
    }

    const isRevealed = playerRopeState.timing.isRevealed;

    // Reset when question changes
    if (currentQuestionId !== prevRevealedQuestionRef.current) {
      prevRevealedQuestionRef.current = currentQuestionId;
      setPlayerResultRevealed(false);
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    }

    // Only start timing when revealed phase begins
    if (!isRevealed || playerResultRevealed) {
      return;
    }

    // Check if player answered
    const playerRopeIndex = playerRopeState.myAnswer.optionIndex;

    // If player didn't answer, reveal immediately
    if (playerRopeIndex === null) {
      setPlayerResultRevealed(true);
      return;
    }

    const isCorrect = playerRopeState.myAnswer.isCorrect === true;

    // Get wrong rope indices and shuffle them with the same seed as Mountain.tsx
    const wrongRopeIndices = playerRopeState.ropes
      .filter(rope => rope.isCorrect === false)
      .map(rope => rope.optionIndex);

    const seed = hashString(currentQuestionId);
    const shuffledWrongRopes = shuffleWithSeed(wrongRopeIndices, seed);

    // Timing constants (must match Mountain.tsx reveal sequence)
    // Phase 1: Scissors appear at 0ms
    // Phase 2: Tension at 500ms
    // Phase 3: Snipping starts at 1500ms
    // Between snips: 800ms each
    // After last snip to complete: 500ms
    const SNIP_START_DELAY = 1500;
    const SNIP_INTERVAL = 800;

    let delayMs: number;

    if (isCorrect) {
      // Correct answer: reveal after ALL wrong ropes are snipped
      const numWrongRopes = shuffledWrongRopes.length;
      if (numWrongRopes === 0) {
        delayMs = SNIP_START_DELAY;
      } else {
        delayMs = SNIP_START_DELAY + (numWrongRopes - 1) * SNIP_INTERVAL + 500;
      }
    } else {
      // Wrong answer: reveal when THIS player's rope is snipped
      const snipPosition = shuffledWrongRopes.indexOf(playerRopeIndex);
      if (snipPosition === -1) {
        delayMs = SNIP_START_DELAY;
      } else {
        delayMs = SNIP_START_DELAY + snipPosition * SNIP_INTERVAL;
      }
    }

    revealTimerRef.current = setTimeout(() => {
      setPlayerResultRevealed(true);
    }, delayMs);

    return () => {
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
  }, [playerRopeState, currentQuestionId, playerResultRevealed]);

  return playerResultRevealed;
}
