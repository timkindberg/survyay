import { useEffect, useRef } from "react";
import { useSoundManager } from "./useSoundManager";
import type { SoundType } from "../lib/soundManager";

interface UseGameSoundsParams {
  /** Player count in lobby (null when not in lobby) */
  playerCount: number | null;
  /** Current question phase from playerRopeState */
  currentQuestionPhase: string | null;
  /** Whether we're in the pre-game phase */
  isPreGame: boolean;
  /** Session status */
  sessionStatus: string | null;
  /** Whether the player's result has been revealed (synced with scissors animation) */
  playerResultRevealed: boolean;
  /** Current question ID (for tracking reveal sounds per question) */
  currentQuestionId: string | null;
  /** Whether the player answered the current question */
  didAnswer: boolean;
  /** Whether the player's answer was correct (null if not revealed yet) */
  isCorrect: boolean | null;
}

/**
 * Hook that triggers sound effects based on game state transitions.
 * Handles: lobby join sounds, question reveal sounds, pre-game sounds,
 * and answer result sounds (synced with scissors animation).
 */
export function useGameSounds({
  playerCount,
  currentQuestionPhase,
  isPreGame,
  sessionStatus,
  playerResultRevealed,
  currentQuestionId,
  didAnswer,
  isCorrect,
}: UseGameSoundsParams) {
  const { play } = useSoundManager();

  const prevPlayerCountRef = useRef(0);
  const prevQuestionPhaseRef = useRef<string | null>(null);
  const prevSessionPhaseRef = useRef<string | null>(null);
  const hasPlayedRevealSoundsRef = useRef<string | null>(null);

  // Play pop/giggle sounds when new players join the lobby
  useEffect(() => {
    if (playerCount === null) return;

    const prevCount = prevPlayerCountRef.current;

    if (playerCount > prevCount && prevCount > 0) {
      const sounds: SoundType[] = ["pop", "pop", "pop", "giggle"];
      const sound = sounds[Math.floor(Math.random() * sounds.length)]!;
      play(sound);
    }

    prevPlayerCountRef.current = playerCount;
  }, [playerCount, play]);

  // Play sound when a new question is shown
  useEffect(() => {
    const prevPhase = prevQuestionPhaseRef.current;

    if (currentQuestionPhase === "question_shown" && prevPhase !== "question_shown" && prevPhase !== null) {
      play("questionReveal");
    }

    prevQuestionPhaseRef.current = currentQuestionPhase;
  }, [currentQuestionPhase, play]);

  // Play "Get Ready!" sound when entering pre_game phase
  useEffect(() => {
    const currentPhase = isPreGame ? "pre_game" : sessionStatus;
    const prevPhase = prevSessionPhaseRef.current;

    if (isPreGame && prevPhase !== "pre_game") {
      play("getReady");
    }

    prevSessionPhaseRef.current = currentPhase;
  }, [isPreGame, sessionStatus, play]);

  // Play reveal sounds when player's result is revealed (synced with scissors animation)
  useEffect(() => {
    if (!currentQuestionId) return;

    if (playerResultRevealed && hasPlayedRevealSoundsRef.current !== currentQuestionId) {
      hasPlayedRevealSoundsRef.current = currentQuestionId;

      if (didAnswer) {
        if (isCorrect) {
          play("blobHappy");
        } else {
          play("snip");
          setTimeout(() => {
            play("blobSad");
          }, 300);
        }
      }
    }

    // Reset when question changes (playerResultRevealed will also reset)
    if (!playerResultRevealed) {
      hasPlayedRevealSoundsRef.current = null;
    }
  }, [currentQuestionId, play, playerResultRevealed, didAnswer, isCorrect]);
}
