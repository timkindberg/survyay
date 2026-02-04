/**
 * Elevation calculation utilities for the mountain climb game.
 *
 * Players gain elevation by answering questions correctly.
 * Scoring has two components:
 * 1. Base score from answer speed (linear 0-10s)
 * 2. Minority bonus for choosing less popular answers
 *
 * Scoring is scaled based on total questions to ensure summit (~1000m)
 * is reached after approximately 55% of questions with perfect answers.
 * Combined with rubber-banding, this ensures realistic players summit.
 */

// Elevation constants
export const SUMMIT = 1000; // Max elevation (game ends)

// Default values for unscaled scoring (used when totalQuestions not provided)
const DEFAULT_MAX_BASE_SCORE = 125;
const DEFAULT_MAX_MINORITY_BONUS = 50;

// Target percentage of questions to reach summit with perfect answers
// 55% chosen to ensure realistic players (75% correct, 3s response) summit
// with rubber-banding assistance even in pessimistic scenarios
const TARGET_SUMMIT_PERCENTAGE = 0.55;

/**
 * Calculate the maximum elevation gain per question based on total questions.
 * This ensures players reach summit after ~55% of questions with perfect answers.
 *
 * Formula: maxPerQuestion = SUMMIT / (totalQuestions * 0.55)
 *
 * Examples:
 * - 10 questions: 1000 / 6.6 = 152m per question
 * - 20 questions: 1000 / 13.2 = 76m per question
 * - 45 questions: 1000 / 29.7 = 34m per question
 *
 * @param totalQuestions - Total number of questions in the game
 * @returns Maximum elevation gain per perfect answer
 */
export function calculateMaxPerQuestion(totalQuestions: number): number {
  if (totalQuestions <= 0) return DEFAULT_MAX_BASE_SCORE + DEFAULT_MAX_MINORITY_BONUS;
  const targetQuestions = totalQuestions * TARGET_SUMMIT_PERCENTAGE;
  return SUMMIT / targetQuestions;
}

/**
 * Calculate base elevation score based on answer speed.
 * Score is scaled based on total questions when provided.
 *
 * Linear formula: maxBase - (responseTimeSeconds * (maxBase / 10))
 * At 0s: maxBase, at 10s: 0
 *
 * When scaled (totalQuestions provided):
 * - maxBase = maxPerQuestion * (125/175) ≈ 71% of max goes to base score
 *
 * When unscaled (default):
 * - 0.0s:   125m
 * - 1.0s:   112.5m
 * - 5.0s:   62.5m
 * - 10s+:   0m
 *
 * @param answerTimeMs - Time to answer in milliseconds
 * @param totalQuestions - Optional total questions for scaling (undefined = use default 125m max)
 * @returns Base elevation score in meters
 */
export function calculateBaseScore(answerTimeMs: number, totalQuestions?: number): number {
  const seconds = Math.max(0, answerTimeMs / 1000); // Handle negative times

  // Calculate max base score (either scaled or default)
  let maxBase: number;
  if (totalQuestions !== undefined && totalQuestions > 0) {
    const maxPerQuestion = calculateMaxPerQuestion(totalQuestions);
    // Base score gets ~71% of max (125/175 ratio from original design)
    maxBase = maxPerQuestion * (DEFAULT_MAX_BASE_SCORE / (DEFAULT_MAX_BASE_SCORE + DEFAULT_MAX_MINORITY_BONUS));
  } else {
    maxBase = DEFAULT_MAX_BASE_SCORE;
  }

  const baseScore = Math.max(0, maxBase - seconds * (maxBase / 10));
  return Math.round(baseScore);
}

/**
 * Calculate minority bonus based on answer distribution.
 * Players who chose less popular answers get a bonus.
 * Bonus is scaled based on total questions when provided.
 *
 * aloneRatio = 1 - (playersOnMyLadder / totalAnswered)
 * minorityBonus = aloneRatio * maxBonus
 *
 * When scaled (totalQuestions provided):
 * - maxBonus = maxPerQuestion * (50/175) ≈ 29% of max goes to minority bonus
 *
 * When unscaled (default maxBonus = 50):
 * - 1 player chose this, 10 total: aloneRatio = 0.9, bonus = 45m
 * - 5 players chose this, 10 total: aloneRatio = 0.5, bonus = 25m
 * - 10 players chose this, 10 total: aloneRatio = 0.0, bonus = 0m
 *
 * @param playersOnMyLadder - Number of players who chose the same answer
 * @param totalAnswered - Total number of players who answered
 * @param totalQuestions - Optional total questions for scaling (undefined = use default 50m max)
 * @returns Minority bonus in meters
 */
export function calculateMinorityBonus(
  playersOnMyLadder: number,
  totalAnswered: number,
  totalQuestions?: number
): number {
  if (totalAnswered === 0) return 0;

  // Calculate max bonus (either scaled or default)
  let maxBonus: number;
  if (totalQuestions !== undefined && totalQuestions > 0) {
    const maxPerQuestion = calculateMaxPerQuestion(totalQuestions);
    // Minority bonus gets ~29% of max (50/175 ratio from original design)
    maxBonus = maxPerQuestion * (DEFAULT_MAX_MINORITY_BONUS / (DEFAULT_MAX_BASE_SCORE + DEFAULT_MAX_MINORITY_BONUS));
  } else {
    maxBonus = DEFAULT_MAX_MINORITY_BONUS;
  }

  const aloneRatio = 1 - playersOnMyLadder / totalAnswered;
  const minorityBonus = aloneRatio * maxBonus;
  return Math.round(minorityBonus);
}

/**
 * Calculate total elevation gain combining base score and minority bonus.
 * Scoring is scaled based on total questions to ensure summit is reached
 * after approximately 55% of questions with perfect answers.
 *
 * @param answerTimeMs - Time to answer in milliseconds
 * @param playersOnMyLadder - Number of players who chose the same answer
 * @param totalAnswered - Total number of players who answered
 * @param totalQuestions - Optional total questions for scaling (undefined = use legacy scoring)
 * @returns Object with baseScore, minorityBonus, and total elevation gain
 */
export function calculateElevationGain(
  answerTimeMs: number,
  playersOnMyLadder: number,
  totalAnswered: number,
  totalQuestions?: number
): {
  baseScore: number;
  minorityBonus: number;
  total: number;
} {
  const baseScore = calculateBaseScore(answerTimeMs, totalQuestions);
  const minorityBonus = calculateMinorityBonus(playersOnMyLadder, totalAnswered, totalQuestions);
  return {
    baseScore,
    minorityBonus,
    total: baseScore + minorityBonus,
  };
}

/**
 * Calculate new elevation after gaining.
 * NOTE: Elevation is NOT capped at summit - players can exceed 1000m for bonus elevation.
 * Summit placement is determined by when players first cross the 1000m threshold.
 */
export function applyElevationGain(currentElevation: number, gain: number): number {
  return currentElevation + gain;
}

/**
 * Check if player has reached the summit.
 */
export function hasReachedSummit(elevation: number): boolean {
  return elevation >= SUMMIT;
}

/**
 * Calculate dynamic maximum elevation gain for rubber-banding.
 * Only BOOSTS elevation cap when needed to help trailing players catch up.
 * Never reduces below the default floor of 175m.
 *
 * Algorithm:
 * - boostCap = (distanceToSummit) / questionsRemaining
 * - Return max(175, boostCap) - 175m is the floor
 *
 * The leader elevation should be the HIGHEST non-summited player.
 * Summited players (elevation >= 1000m) are excluded from this calculation.
 *
 * Examples:
 * - Leader at 700m, 3 questions left: (1000-700)/3 = 100m -> returns 175m (floor)
 * - Leader at 500m, 2 questions left: (1000-500)/2 = 250m -> returns 250m (boost)
 * - Leader at 50m, 10 questions left: (1000-50)/10 = 95m -> returns 175m (floor)
 *
 * @param leaderElevation - Current elevation of the top NON-SUMMITED player
 * @param questionsRemaining - Number of questions left after current reveal
 * @returns Dynamic max elevation cap in meters (minimum 175m, can boost higher)
 */
export function calculateDynamicMax(
  leaderElevation: number,
  questionsRemaining: number
): number {
  const MIN_CAP = 60;
  const MAX_CAP = 175;

  // Edge case: no questions remaining (shouldn't happen, but handle gracefully)
  if (questionsRemaining <= 0) {
    return MAX_CAP; // Let them finish if this is the last question
  }

  const distanceToSummit = SUMMIT - leaderElevation;

  // If already at or above summit, no cap needed (all non-summited players filtered out)
  if (distanceToSummit <= 0) {
    return MAX_CAP;
  }

  // Calculate boost cap to help trailing players catch up
  // Use same percentage as scoring - catch up in 55% of remaining questions
  const boostCap = distanceToSummit / (questionsRemaining * TARGET_SUMMIT_PERCENTAGE);

  // Only boost, never reduce - 175m is the floor
  return Math.max(MAX_CAP, Math.round(boostCap));
}
