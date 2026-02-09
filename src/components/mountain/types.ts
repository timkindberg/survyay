import type { RopeClimbingState, QuestionPhase } from "../../../lib/ropeTypes";

export interface MountainPlayer {
  id: string;
  name: string;
  elevation: number;
}

export type MountainMode = "spectator" | "player" | "admin-preview";

/** Question data for sky display in spectator mode */
export interface SkyQuestion {
  text: string;
  questionNumber: number;
  totalQuestions: number;
  phase: "question_shown" | "answers_shown" | "revealed" | "results";
  options?: Array<{ text: string }>;
  /** Index of the correct answer option (0-3) */
  correctAnswerIndex?: number;
  /** Timer info */
  timer?: {
    firstAnsweredAt: number | null;
    timeLimit: number;
    isRevealed: boolean;
    correctAnswer?: string;
    correctCount?: number;
    totalAnswered?: number;
  };
}

// Number of checkpoints (every 100m from 0 to 1000)
export const CHECKPOINT_INTERVAL = 100;

// Checkpoint names for flavor
export const CHECKPOINT_NAMES: Record<number, string> = {
  0: "Base Camp",
  100: "Camp I",
  200: "Camp II",
  300: "Camp III",
  400: "Camp IV",
  500: "Halfway Point",
  600: "Camp V",
  700: "Camp VI",
  800: "Camp VII",
  900: "Death Zone",
  1000: "Summit!",
};

// Player size configurations for different modes
export const PLAYER_SIZE_CONFIG: Record<MountainMode, { size: number; spacing: number; showName: boolean; nameSize: number }> = {
  spectator: { size: 32, spacing: 34, showName: true, nameSize: 10 },
  player: { size: 40, spacing: 44, showName: true, nameSize: 10 },
  "admin-preview": { size: 12, spacing: 14, showName: false, nameSize: 6 },
};

// Maximum players per row before clustering
export const MAX_PLAYERS_PER_ROW: Record<MountainMode, number> = {
  spectator: 20,
  player: 8,
  "admin-preview": 16,
};

export type SizeConfig = { size: number; spacing: number; showName: boolean; nameSize: number };
