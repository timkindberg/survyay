/**
 * Shared types for the rope climbing visualization system.
 *
 * These types are used by both the Convex backend (queries) and
 * the React frontend (Mountain component).
 *
 * NOTE: Uses `string` for all IDs instead of Convex's `Id<T>` type
 * so that lib/ has no imports from convex/ (architecture rule).
 * Convex IDs are strings at runtime, so this is safe.
 */

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
  playerId: string;
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
    id: string;
    text: string;
    timeLimit: number;
  };
  /** Current phase of the question flow */
  questionPhase: QuestionPhase;
  /** One rope per answer option */
  ropes: RopeData[];
  /** Players who haven't answered yet (at their current elevation) */
  notAnswered: {
    playerId: string;
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

/**
 * Lightweight player-specific rope state for the PlayerView.
 * Contains only the data a single player needs during rope climbing:
 * - Question info (id, text, options, timeLimit)
 * - Player counts per rope (not full player list)
 * - Current player's answer status and result
 * - Phase and timing info
 */
export interface PlayerRopeState {
  /** The current question being displayed */
  question: {
    id: string;
    text: string;
    options: { text: string }[];
    timeLimit: number;
  };
  /** Summarized rope data - counts instead of full player lists */
  ropes: {
    optionIndex: number;
    optionText: string;
    playerCount: number;
    /** Whether this is the correct answer (null until revealed) */
    isCorrect: boolean | null;
  }[];
  /** Current player's answer status */
  myAnswer: {
    hasAnswered: boolean;
    /** Which option index the player selected (null if not answered) */
    optionIndex: number | null;
    /** Whether the player's answer was correct (null until revealed) */
    isCorrect: boolean | null;
    /** Player's position in answer order (1 = first, for bonus calculation) */
    position: number | null;
    /** Elevation gain from this answer (populated after reveal) */
    elevationGain: number | null;
  };
  /** Current phase of the question flow */
  phase: QuestionPhase;
  /** Timing info for the countdown */
  timing: {
    firstAnsweredAt: number | null;
    timeLimit: number;
    isExpired: boolean;
    isRevealed: boolean;
  };
  /** Total number of players who have answered this question */
  answeredCount: number;
  /** Total number of players in the session */
  totalPlayers: number;
}
