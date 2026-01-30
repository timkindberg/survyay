/**
 * Elevation calculation utilities for the mountain climb game.
 *
 * Players gain elevation by answering questions correctly.
 * Scoring has two components:
 * 1. Base score from answer speed (linear 0-10s)
 * 2. Minority bonus for choosing less popular answers
 */

// Elevation constants
export const SUMMIT = 1000; // Max elevation (game ends)

/**
 * Calculate base elevation score based on answer speed.
 * Linear formula: 100 - (responseTimeSeconds * 10)
 *
 * 0.0s:   100m
 * 1.0s:   90m
 * 5.0s:   50m
 * 10s+:   0m
 *
 * @param answerTimeMs - Time to answer in milliseconds
 * @returns Base elevation score in meters (0-100)
 */
export function calculateBaseScore(answerTimeMs: number): number {
  const seconds = Math.max(0, answerTimeMs / 1000); // Handle negative times
  const baseScore = Math.max(0, 100 - seconds * 10);
  return Math.round(baseScore);
}

/**
 * Calculate minority bonus based on answer distribution.
 * Players who chose less popular answers get a bonus.
 *
 * aloneRatio = 1 - (playersOnMyLadder / totalAnswered)
 * minorityBonus = aloneRatio * 50
 *
 * Examples:
 * - 1 player chose this, 10 total: aloneRatio = 0.9, bonus = 45m
 * - 5 players chose this, 10 total: aloneRatio = 0.5, bonus = 25m
 * - 10 players chose this, 10 total: aloneRatio = 0.0, bonus = 0m
 *
 * @param playersOnMyLadder - Number of players who chose the same answer
 * @param totalAnswered - Total number of players who answered
 * @returns Minority bonus in meters (0-50)
 */
export function calculateMinorityBonus(
  playersOnMyLadder: number,
  totalAnswered: number
): number {
  if (totalAnswered === 0) return 0;
  const aloneRatio = 1 - playersOnMyLadder / totalAnswered;
  const minorityBonus = aloneRatio * 50;
  return Math.round(minorityBonus);
}

/**
 * Calculate total elevation gain combining base score and minority bonus.
 *
 * @param answerTimeMs - Time to answer in milliseconds
 * @param playersOnMyLadder - Number of players who chose the same answer
 * @param totalAnswered - Total number of players who answered
 * @returns Object with baseScore, minorityBonus, and total elevation gain
 */
export function calculateElevationGain(
  answerTimeMs: number,
  playersOnMyLadder: number,
  totalAnswered: number
): {
  baseScore: number;
  minorityBonus: number;
  total: number;
} {
  const baseScore = calculateBaseScore(answerTimeMs);
  const minorityBonus = calculateMinorityBonus(playersOnMyLadder, totalAnswered);
  return {
    baseScore,
    minorityBonus,
    total: baseScore + minorityBonus,
  };
}

/**
 * Calculate new elevation after gaining, capped at summit.
 */
export function applyElevationGain(currentElevation: number, gain: number): number {
  return Math.min(SUMMIT, currentElevation + gain);
}

/**
 * Check if player has reached the summit.
 */
export function hasReachedSummit(elevation: number): boolean {
  return elevation >= SUMMIT;
}

/**
 * Calculate dynamic maximum elevation gain for rubber-banding.
 * Prevents early summiting by distributing remaining distance across remaining questions.
 *
 * Algorithm:
 * - targetMax = (distanceToSummit) / questionsRemaining
 * - Bounded by MIN_ELEVATION_CAP (50m) and MAX_ELEVATION_CAP (150m)
 *
 * Examples:
 * - Leader at 700m, 3 questions left: (1000-700)/3 = 100m cap
 * - Leader at 900m, 1 question left: (1000-900)/1 = 100m cap
 * - Leader at 50m, 10 questions left: (1000-50)/10 = 95m cap
 * - Leader at 950m, 1 question left: (1000-950)/1 = 50m cap (floor applied)
 *
 * @param leaderElevation - Current elevation of the top player
 * @param questionsRemaining - Number of questions left after current reveal
 * @returns Dynamic max elevation cap in meters (50-150m)
 */
export function calculateDynamicMax(
  leaderElevation: number,
  questionsRemaining: number
): number {
  const MIN_CAP = 50;
  const MAX_CAP = 150;

  // Edge case: no questions remaining (shouldn't happen, but handle gracefully)
  if (questionsRemaining <= 0) {
    return MAX_CAP; // Let them finish if this is the last question
  }

  const distanceToSummit = SUMMIT - leaderElevation;

  // If already at or above summit, no cap needed
  if (distanceToSummit <= 0) {
    return MAX_CAP;
  }

  // Calculate target max to spread remaining distance
  const targetMax = distanceToSummit / questionsRemaining;

  // Apply bounds
  return Math.max(MIN_CAP, Math.min(MAX_CAP, Math.round(targetMax)));
}
