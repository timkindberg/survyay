/**
 * Shared types for the rope climbing visualization system.
 *
 * These types are used by both the Convex backend (queries) and
 * the React frontend (Mountain component).
 */

import type { Id } from "../convex/_generated/dataModel";

/**
 * Question phase for controlling the flow of each question
 * - question_shown: Question text visible, answers hidden
 * - answers_shown: Answer options visible, timer starts on first answer
 * - revealed: Correct answer revealed (host triggered)
 * - results: Results screen showing detailed stats
 */
export type QuestionPhase = "question_shown" | "answers_shown" | "revealed" | "results";

/**
 * A player currently on a rope (has answered the question)
 */
export interface PlayerOnRope {
  playerId: Id<"players">;
  playerName: string;
  /** The elevation where they grabbed the rope (their position when answering) */
  elevationAtAnswer: number;
  /** Timestamp when they answered (earlier = higher on rope visually) */
  answeredAt: number;
  /** Elevation gain from this answer (populated after reveal, includes minority bonus) */
  elevationGain?: number;
}

/**
 * Data for a single rope (one per answer option)
 */
export interface RopeData {
  /** The answer option text (label for this rope) */
  optionText: string;
  /** Index of this option (0-3 typically) */
  optionIndex: number;
  /** Players who chose this answer, sorted by answeredAt */
  players: PlayerOnRope[];
  /** Whether this is the correct answer (revealed after timer) */
  isCorrect: boolean | null;
}

/**
 * Complete state for the rope climbing visualization
 */
export interface RopeClimbingState {
  /** The current question being displayed */
  question: {
    id: Id<"questions">;
    text: string;
    timeLimit: number;
  };
  /** Current phase of the question flow */
  questionPhase: QuestionPhase;
  /** One rope per answer option */
  ropes: RopeData[];
  /** Players who haven't answered yet (at their current elevation) */
  notAnswered: {
    playerId: Id<"players">;
    playerName: string;
    elevation: number;
    /** The option index from their most recent answer (for column positioning) */
    lastOptionIndex: number | null;
  }[];
  /** Timing info for the countdown */
  timing: {
    /** When the first person answered (null if no answers yet) */
    firstAnsweredAt: number | null;
    /** Question time limit in seconds */
    timeLimit: number;
    /** Whether the timer has expired */
    isExpired: boolean;
    /** Whether results are revealed (phase is "revealed" or "results") */
    isRevealed: boolean;
  };
  /** Total number of players in the session */
  totalPlayers: number;
  /** Number of players with recent heartbeat (active tab) */
  activePlayerCount: number;
  /** Number of players who have answered */
  answeredCount: number;
}
