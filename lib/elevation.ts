/**
 * Elevation calculation utilities for the mountain climb game.
 *
 * Players gain elevation by answering questions correctly.
 * Faster answers = more elevation gain.
 */

// Elevation constants
export const ELEVATION_MAX = 100; // Max gain for fast answers
export const ELEVATION_MIN = 50; // Floor for slow answers
export const GRACE_PERIOD = 2; // Seconds where everyone gets max
export const RAMP_END = 15; // Seconds where floor kicks in
export const SUMMIT = 1000; // Max elevation (game ends)

/**
 * Calculate elevation gain based on answer speed.
 *
 * 0-2s:   100m (grace period for network latency)
 * 2-15s:  Linear ramp from 100m → 50m
 * 15s+:   50m floor (slow but still progressing)
 *
 * @param answerTimeMs - Time to answer in milliseconds
 * @returns Elevation gain in meters (50-100)
 */
export function calculateElevationGain(answerTimeMs: number): number {
  const seconds = answerTimeMs / 1000;

  // Grace period - fast answers all get max
  if (seconds <= GRACE_PERIOD) return ELEVATION_MAX;

  // Floor - slow answers still get something
  if (seconds >= RAMP_END) return ELEVATION_MIN;

  // Linear ramp between grace period and floor
  const rampDuration = RAMP_END - GRACE_PERIOD;
  const elevationRange = ELEVATION_MAX - ELEVATION_MIN;
  const timeIntoRamp = seconds - GRACE_PERIOD;

  return Math.round(ELEVATION_MAX - (timeIntoRamp / rampDuration) * elevationRange);
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
