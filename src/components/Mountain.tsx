import { useMemo, memo, useState, useEffect, useRef } from "react";
import { Blob } from "./Blob";
import { generateBlob } from "../lib/blobGenerator";
import { SUMMIT } from "../../lib/elevation";
import { Rope, RopeClimber, type RopePlayer, type RopeRevealState, type ClimberRevealState, type RevealPhase } from "./Rope";
import type { RopeClimbingState, RopeData } from "../../lib/ropeTypes";
import { playSound } from "../lib/soundManager";
import { AnswerPills } from "./AnswerPills";

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

interface MountainProps {
  players: MountainPlayer[];
  mode: MountainMode;
  /** Current player's elevation (for player mode focus) */
  currentPlayerElevation?: number;
  /** Current player's ID (to highlight) */
  currentPlayerId?: string;
  /** Width of the mountain view */
  width?: number;
  /** Height of the mountain view */
  height?: number;
  className?: string;
  /** Rope climbing state from getRopeClimbingState query */
  ropeClimbingState?: RopeClimbingState | null;
  /** Question to display in the sky (spectator full-screen mode) */
  skyQuestion?: SkyQuestion | null;
}

// Number of checkpoints (every 100m from 0 to 1000)
const CHECKPOINT_INTERVAL = 100;
const NUM_CHECKPOINTS = Math.floor(SUMMIT / CHECKPOINT_INTERVAL) + 1;

// Checkpoint names for flavor
const CHECKPOINT_NAMES: Record<number, string> = {
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
const PLAYER_SIZE_CONFIG: Record<MountainMode, { size: number; spacing: number; showName: boolean; nameSize: number }> = {
  spectator: { size: 24, spacing: 26, showName: true, nameSize: 8 },
  player: { size: 40, spacing: 44, showName: true, nameSize: 10 },
  "admin-preview": { size: 12, spacing: 14, showName: false, nameSize: 6 },
};

// Maximum players per row before clustering
const MAX_PLAYERS_PER_ROW: Record<MountainMode, number> = {
  spectator: 20,
  player: 8,
  "admin-preview": 16,
};

/**
 * Mountain visualization component
 *
 * Displays a vertical mountain with:
 * - Full-width terrain (no tapering until decorative summit tip)
 * - Decorative summit area with sunshine, clouds, distant mountains
 * - Checkpoint markers every 100m
 * - Player blobs at their elevation
 * - Zooming based on mode (spectator=all, player=focused)
 * - Optimized for 50+ players with clustering
 */
export function Mountain({
  players,
  mode,
  currentPlayerElevation = 0,
  currentPlayerId,
  width = 400,
  height = 600,
  className = "",
  ropeClimbingState,
  skyQuestion,
}: MountainProps) {
  // Determine if ropes should be shown
  const showRopes = ropeClimbingState !== null && ropeClimbingState !== undefined;
  // Calculate the visible elevation range
  const { minElevation, maxElevation } = useMemo(() => {
    if (mode === "spectator" || mode === "admin-preview") {
      // Spectator/admin sees full mountain with decorative summit area
      // Increased sky area (SUMMIT + 350) to give more room for question text and answer pills
      return { minElevation: -50, maxElevation: SUMMIT + 350 };
    } else {
      // Player sees their elevation +/- 150m, with minimum visibility
      const playerMin = Math.max(-50, currentPlayerElevation - 150);
      const playerMax = Math.min(SUMMIT + 100, currentPlayerElevation + 200);
      // Ensure at least 300m range
      if (playerMax - playerMin < 300) {
        if (playerMin <= 0) {
          return { minElevation: -50, maxElevation: 250 };
        } else {
          return { minElevation: playerMax - 300, maxElevation: playerMax };
        }
      }
      return { minElevation: playerMin, maxElevation: playerMax };
    }
  }, [mode, currentPlayerElevation]);

  // Convert elevation to Y coordinate (higher elevation = lower Y)
  const elevationToY = (elevation: number): number => {
    const range = maxElevation - minElevation;
    const padding = 20;
    const usableHeight = height - padding * 2;
    const normalized = (elevation - minElevation) / range;
    return height - padding - normalized * usableHeight;
  };

  // Get visible checkpoints
  const visibleCheckpoints = useMemo(() => {
    const checkpoints: number[] = [];
    for (let i = 0; i < NUM_CHECKPOINTS; i++) {
      const elevation = i * CHECKPOINT_INTERVAL;
      if (elevation >= minElevation - 50 && elevation <= maxElevation + 50) {
        checkpoints.push(elevation);
      }
    }
    return checkpoints;
  }, [minElevation, maxElevation]);

  // Player sizing based on mode
  const sizeConfig = PLAYER_SIZE_CONFIG[mode];
  const maxPerRow = MAX_PLAYERS_PER_ROW[mode];

  // Group players by approximate elevation for stacking with smart clustering
  const playerPositions = useMemo(() => {
    // Sort by elevation
    const sorted = [...players].sort((a, b) => a.elevation - b.elevation);

    // Calculate positions with horizontal stacking for nearby players
    const STACK_THRESHOLD = (maxElevation - minElevation) * 0.025; // 2.5% of visible range
    const positions: Array<{
      player: MountainPlayer;
      x: number;
      y: number;
      isCurrentPlayer: boolean;
      isCluster: boolean;
      clusterCount?: number;
    }> = [];

    const centerX = width / 2;
    const blobSpacing = sizeConfig.spacing;
    const usableWidth = width * 0.85; // Use 85% of width for players

    // Group by elevation bands
    const bands: MountainPlayer[][] = [];
    let currentBand: MountainPlayer[] = [];
    let bandElevation = -Infinity;

    for (const player of sorted) {
      if (player.elevation - bandElevation > STACK_THRESHOLD || currentBand.length === 0) {
        if (currentBand.length > 0) {
          bands.push(currentBand);
        }
        currentBand = [player];
        bandElevation = player.elevation;
      } else {
        currentBand.push(player);
      }
    }
    if (currentBand.length > 0) {
      bands.push(currentBand);
    }

    // Process each band
    for (const band of bands) {
      const avgElevation = band.reduce((sum, p) => sum + p.elevation, 0) / band.length;
      const y = elevationToY(avgElevation);

      if (band.length <= maxPerRow) {
        // Simple horizontal spread
        const totalWidth = (band.length - 1) * blobSpacing;
        const startX = centerX - totalWidth / 2;

        band.forEach((p, i) => {
          positions.push({
            player: p,
            x: startX + i * blobSpacing,
            y: elevationToY(p.elevation),
            isCurrentPlayer: p.id === currentPlayerId,
            isCluster: false,
          });
        });
      } else {
        // Multi-row layout for large groups
        const playersPerRow = Math.min(maxPerRow, Math.ceil(Math.sqrt(band.length * 2)));
        const numRows = Math.ceil(band.length / playersPerRow);
        const rowHeight = sizeConfig.size * 0.4; // Slight vertical offset between rows

        band.forEach((p, i) => {
          const row = Math.floor(i / playersPerRow);
          const col = i % playersPerRow;
          const playersInThisRow = Math.min(playersPerRow, band.length - row * playersPerRow);

          const rowWidth = (playersInThisRow - 1) * blobSpacing;
          const startX = centerX - rowWidth / 2;
          // Offset odd rows slightly for hexagonal packing
          const rowOffset = row % 2 === 1 ? blobSpacing / 2 : 0;

          positions.push({
            player: p,
            x: Math.max(sizeConfig.size, Math.min(width - sizeConfig.size, startX + col * blobSpacing + rowOffset)),
            y: elevationToY(p.elevation) + row * rowHeight - (numRows - 1) * rowHeight / 2,
            isCurrentPlayer: p.id === currentPlayerId,
            isCluster: band.length > maxPerRow,
          });
        });
      }
    }

    // Sort by Y position so current player renders on top
    return positions.sort((a, b) => {
      if (a.isCurrentPlayer) return 1;
      if (b.isCurrentPlayer) return -1;
      return b.y - a.y;
    });
  }, [players, currentPlayerId, minElevation, maxElevation, width, sizeConfig, maxPerRow]);

  // Determine if we should show the decorative summit
  const showSummitDecoration = maxElevation > SUMMIT;

  return (
    <div className={`mountain ${className}`} style={{ position: "relative", width, height, overflow: "hidden" }}>
      <svg width={width} height={height} style={{ position: "absolute", top: 0, left: 0 }}>
        <defs>
          {/* Alpine rock face gradient - dark slate/granite tones */}
          <linearGradient id={`mountain-gradient-${mode}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#2d3748" /> {/* Summit - dark blue-gray */}
            <stop offset="15%" stopColor="#3a3f4a" /> {/* High - deep slate */}
            <stop offset="35%" stopColor="#4a5568" /> {/* Mid-high - granite gray */}
            <stop offset="60%" stopColor="#3a3f4a" /> {/* Mid - dark slate */}
            <stop offset="85%" stopColor="#2d3748" /> {/* Lower - darker granite */}
            <stop offset="100%" stopColor="#1a202c" /> {/* Base - near black */}
          </linearGradient>

          {/* Secondary rock layer gradient for depth */}
          <linearGradient id={`rock-layer-gradient-${mode}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4a5568" />
            <stop offset="50%" stopColor="#3a3f4a" />
            <stop offset="100%" stopColor="#2d3748" />
          </linearGradient>

          {/* Sky gradient for summit decoration */}
          <linearGradient id={`sky-gradient-${mode}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1e3a5f" /> {/* Deep alpine sky */}
            <stop offset="50%" stopColor="#4a7eb3" /> {/* Mountain sky blue */}
            <stop offset="100%" stopColor="#87CEEB" stopOpacity="0.6" />
          </linearGradient>

          {/* Sun glow - colder for alpine */}
          <radialGradient id={`sun-glow-${mode}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFEF0" />
            <stop offset="40%" stopColor="#FFE4B5" />
            <stop offset="70%" stopColor="#FFA500" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#FF8C00" stopOpacity="0" />
          </radialGradient>

          {/* Snow gradient - bright white for contrast */}
          <linearGradient id={`snow-gradient-${mode}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="30%" stopColor="#F7FAFC" />
            <stop offset="60%" stopColor="#E2E8F0" />
            <stop offset="100%" stopColor="#CBD5E0" stopOpacity="0.8" />
          </linearGradient>

          {/* Rocky shadow gradient for depth - left side darker */}
          <linearGradient id={`rock-shadow-${mode}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(0,0,0,0.4)" />
            <stop offset="30%" stopColor="rgba(0,0,0,0.15)" />
            <stop offset="70%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.2)" />
          </linearGradient>

          {/* Rock highlight gradient for exposed faces */}
          <linearGradient id={`rock-highlight-${mode}`} x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#a0aec0" stopOpacity="0.4" />
            <stop offset="50%" stopColor="#718096" stopOpacity="0.2" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>

          {/* Fine rock texture pattern - very subtle grain */}
          <pattern id={`rock-texture-${mode}`} patternUnits="userSpaceOnUse" width="40" height="40">
            <rect width="40" height="40" fill="transparent" />
            <circle cx="8" cy="8" r="0.5" fill="rgba(0,0,0,0.05)" />
            <circle cx="28" cy="12" r="0.4" fill="rgba(80,90,100,0.06)" />
            <circle cx="16" cy="24" r="0.6" fill="rgba(0,0,0,0.04)" />
            <circle cx="34" cy="30" r="0.3" fill="rgba(100,110,120,0.05)" />
            <circle cx="6" cy="36" r="0.5" fill="rgba(0,0,0,0.04)" />
          </pattern>

          {/* Filter for subtle noise texture */}
          <filter id={`mountain-noise-${mode}`} x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>

        {/* Sky background for summit area */}
        {showSummitDecoration && (
          <SummitDecoration
            width={width}
            summitY={elevationToY(SUMMIT)}
            topY={0}
            mode={mode}
            skyQuestion={skyQuestion}
          />
        )}

        {/* Mountain body - full width with decorative tip */}
        <MountainShape
          width={width}
          height={height}
          minElevation={minElevation}
          maxElevation={maxElevation}
          elevationToY={elevationToY}
          mode={mode}
        />

        {/* Deep shadow on left side for imposing 3D effect */}
        <rect
          x={0}
          y={elevationToY(SUMMIT)}
          width={width * 0.4}
          height={height - elevationToY(SUMMIT)}
          fill="url(#rock-shadow-${mode})"
          opacity="0.5"
        />

        {/* Surface details - boulders and ledges */}
        <MountainDetails
          width={width}
          height={height}
          minElevation={minElevation}
          maxElevation={maxElevation}
          elevationToY={elevationToY}
          mode={mode}
        />

        {/* Checkpoint markers */}
        {visibleCheckpoints.map((elevation) => (
          <CheckpointMarker
            key={elevation}
            elevation={elevation}
            y={elevationToY(elevation)}
            width={width}
            name={CHECKPOINT_NAMES[elevation]}
            isSummit={elevation === SUMMIT}
            mode={mode}
          />
        ))}
      </svg>

      {/* When question is active, show ropes and climbers instead of normal player positions */}
      {showRopes ? (
        <RopesOverlay
          ropeClimbingState={ropeClimbingState}
          width={width}
          height={height}
          elevationToY={elevationToY}
          minElevation={minElevation}
          maxElevation={maxElevation}
          sizeConfig={sizeConfig}
          currentPlayerId={currentPlayerId}
          mode={mode}
        />
      ) : (
        /* Player blobs (positioned absolutely over SVG) */
        playerPositions.map(({ player, x, y, isCurrentPlayer }) => (
          <MemoizedPlayerBlob
            key={player.id}
            player={player}
            x={x}
            y={y}
            isCurrentPlayer={isCurrentPlayer}
            size={sizeConfig.size}
            showName={sizeConfig.showName}
            nameSize={sizeConfig.nameSize}
          />
        ))
      )}

      {/* Answer pills in the sky (spectator mode with active question) */}
      {mode === "spectator" && skyQuestion && skyQuestion.options && (
        <AnswerPills
          options={skyQuestion.options}
          phase={skyQuestion.phase}
          correctAnswerIndex={skyQuestion.correctAnswerIndex}
        />
      )}
    </div>
  );
}

/**
 * Ropes overlay component - renders 4 vertical ropes with climbers
 */
function RopesOverlay({
  ropeClimbingState,
  width,
  height,
  elevationToY,
  minElevation,
  maxElevation,
  sizeConfig,
  currentPlayerId,
  mode,
}: {
  ropeClimbingState: RopeClimbingState;
  width: number;
  height: number;
  elevationToY: (elevation: number) => number;
  minElevation: number;
  maxElevation: number;
  sizeConfig: { size: number; spacing: number; showName: boolean; nameSize: number };
  currentPlayerId?: string;
  mode: MountainMode;
}) {
  const { ropes, notAnswered, timing } = ropeClimbingState;
  const isRevealed = timing.isRevealed;

  // Reveal phase state machine
  const [revealPhase, setRevealPhase] = useState<RevealPhase>("pending");
  const [snippedRopes, setSnippedRopes] = useState<Set<number>>(new Set());

  // Track if we've started the reveal sequence for this question
  const revealStartedRef = useRef(false);
  const prevIsRevealedRef = useRef(false);
  const prevQuestionIdRef = useRef<string | null>(null);

  // Get indices of wrong ropes that have players
  const wrongRopeIndices = useMemo(() => {
    return ropes
      .map((rope, i) => ({ rope, index: i }))
      .filter(({ rope }) => rope.isCorrect === false && rope.players.length > 0)
      .map(({ index }) => index);
  }, [ropes]);

  // Orchestrate the reveal sequence
  useEffect(() => {
    // Reset state when question changes
    if (ropeClimbingState.question.id !== prevQuestionIdRef.current) {
      prevQuestionIdRef.current = ropeClimbingState.question.id;
      revealStartedRef.current = false;
      setRevealPhase("pending");
      setSnippedRopes(new Set());
      prevIsRevealedRef.current = false;
      return;
    }

    // Only start reveal sequence once per question
    if (isRevealed && !prevIsRevealedRef.current && !revealStartedRef.current) {
      revealStartedRef.current = true;

      // PHASE 1: Show scissors on ALL ropes (0ms)
      setRevealPhase("scissors");

      // PHASE 2: Tension pause (1500ms) - play rope tension sound
      const tensionTimer = setTimeout(() => {
        playSound("ropeTension");
      }, 500);

      // PHASE 3: Start snipping sequence (after 1500ms tension pause)
      const snipStartTimer = setTimeout(() => {
        if (wrongRopeIndices.length === 0) {
          // No wrong ropes to snip - go straight to complete
          setRevealPhase("complete");
          // Play celebration for correct answers
          const hasCorrectPlayers = ropes.some(
            (rope) => rope.isCorrect === true && rope.players.length > 0
          );
          if (hasCorrectPlayers) {
            setTimeout(() => playSound("celebration"), 200);
          }
        } else {
          setRevealPhase("snipping");

          // Snip wrong ropes one at a time (~500ms per rope)
          wrongRopeIndices.forEach((ropeIndex, i) => {
            setTimeout(() => {
              // Play snip sound
              playSound("snip");

              // Play scream sound for falling players
              const rope = ropes[ropeIndex];
              if (rope && rope.players.length > 0) {
                setTimeout(() => playSound("scream"), 100);
              }

              // Mark this rope as snipped
              setSnippedRopes(prev => new Set([...prev, ropeIndex]));

              // After all ropes are snipped, transition to complete
              if (i === wrongRopeIndices.length - 1) {
                setTimeout(() => {
                  setRevealPhase("complete");

                  // Play celebration for correct answers
                  const hasCorrectPlayers = ropes.some(
                    (rope) => rope.isCorrect === true && rope.players.length > 0
                  );
                  if (hasCorrectPlayers) {
                    setTimeout(() => playSound("celebration"), 200);
                  }
                }, 300);
              }
            }, i * 500); // 500ms between each snip
          });
        }
      }, 1500);

      return () => {
        clearTimeout(tensionTimer);
        clearTimeout(snipStartTimer);
      };
    }

    prevIsRevealedRef.current = isRevealed;
  }, [isRevealed, ropeClimbingState.question.id, wrongRopeIndices, ropes]);

  // Calculate rope positions - evenly spaced across the width
  const ropeCount = ropes.length;
  const padding = width * 0.1; // 10% padding on each side
  const usableWidth = width - padding * 2;
  const ropeSpacing = ropeCount > 1 ? usableWidth / (ropeCount - 1) : 0;

  // Get rope X positions
  const ropeXPositions = ropes.map((_, i) => {
    if (ropeCount === 1) return width / 2;
    return padding + i * ropeSpacing;
  });

  // Calculate rope top and bottom Y positions
  // IMPORTANT: Ropes should stop at the summit line, not extend into the sky area
  const ropeTopY = elevationToY(SUMMIT);
  const ropeBottomY = elevationToY(minElevation);

  // Labels for ropes (A, B, C, D, etc.)
  const ropeLabels = ropes.map((_, i) => String.fromCharCode(65 + i));

  // Determine rope reveal states based on current phase
  const getRopeRevealState = (rope: RopeData, ropeIndex: number): RopeRevealState => {
    // During pending phase, show all as pending
    if (revealPhase === "pending") return "pending";

    // During scissors phase, still show pending (scissors appear but no cut yet)
    if (revealPhase === "scissors") return "pending";

    // During snipping phase, only show "wrong" for ropes that have been snipped
    if (revealPhase === "snipping") {
      if (rope.isCorrect === null) return "poll";
      if (rope.isCorrect === true) return "pending"; // Not yet revealed as correct
      // Wrong rope - check if it's been snipped
      return snippedRopes.has(ropeIndex) ? "wrong" : "pending";
    }

    // Complete phase - show final states
    if (rope.isCorrect === null) return "poll";
    return rope.isCorrect ? "correct" : "wrong";
  };

  // Calculate cut Y position for wrong ropes (based on highest climber's visual position)
  const getCutY = (rope: RopeData, ropeIndex: number): number | undefined => {
    // Only show cut for wrong ropes that have been snipped
    if (rope.isCorrect !== false) return undefined;
    if (!snippedRopes.has(ropeIndex) && revealPhase !== "complete") return undefined;

    // For empty ropes, cut near the bottom of the visible area (not at the top)
    if (rope.players.length === 0) {
      // Cut at 80% down the rope (closer to where players would typically be)
      return ropeTopY + (ropeBottomY - ropeTopY) * 0.8;
    }

    // Find the player who is visually highest on the rope
    // Players are sorted by answeredAt, and later players have more negative climbOffset
    // So the last player (highest index) is visually highest on the rope
    const playerVisualPositions = rope.players.map((p, playerIndex) => {
      const baseY = elevationToY(p.elevationAtAnswer);
      // Account for climb offset: later players climb higher (more negative offset)
      const climbOffset = -(playerIndex * 15);
      return baseY + climbOffset; // This is the visual Y position
    });

    // Find the minimum Y (highest visual position)
    const highestVisualY = Math.min(...playerVisualPositions);

    // Cut 30px above the visually highest player
    // But ensure cut is at least 20px below the rope top (summit line)
    return Math.max(ropeTopY + 20, highestVisualY - 30);
  };

  return (
    <>
      {/* Rope SVG layer */}
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      >
        {ropes.map((rope, i) => (
          <Rope
            key={i}
            label={ropeLabels[i] ?? "?"}
            answerText={rope.optionText}
            x={ropeXPositions[i] ?? width / 2}
            topY={ropeTopY}
            bottomY={ropeBottomY}
            players={[]} // Players rendered separately as HTML
            playerSize={sizeConfig.size}
            showNames={sizeConfig.showName}
            currentPlayerId={currentPlayerId}
            elevationToY={elevationToY}
            revealState={getRopeRevealState(rope, i)}
            cutY={getCutY(rope, i)}
            revealPhase={revealPhase}
            isWrongRope={rope.isCorrect === false}
          />
        ))}
      </svg>

      {/* Scissors animation - show on ALL ropes during scissors phase, then only on wrong ropes during snipping */}
      {(revealPhase === "scissors" || revealPhase === "snipping") &&
        ropes.map((rope, i) => {
          // During scissors phase, show on ALL ropes for suspense
          // During snipping phase, only show on wrong ropes that haven't been snipped yet
          if (revealPhase === "snipping") {
            if (rope.isCorrect !== false || snippedRopes.has(i)) return null;
          }

          // Skip ropes with no players (no tension if no one is on it)
          if (rope.players.length === 0) return null;

          // Calculate cut position based on highest player's visual position
          // Account for climb offset (later players are visually higher on the rope)
          const playerVisualPositions = rope.players.map((p, playerIndex) => {
            const baseY = elevationToY(p.elevationAtAnswer);
            const climbOffset = -(playerIndex * 15);
            return baseY + climbOffset;
          });
          const highestVisualY = Math.min(...playerVisualPositions);
          const cutY = Math.max(ropeTopY + 20, highestVisualY - 30);

          // Determine if this is the correct rope (will disappear, not cut)
          const isCorrectRope = rope.isCorrect === true;

          return (
            <div
              key={`scissors-${i}`}
              className={`rope-scissors ${revealPhase === "scissors" ? "rope-scissors-hover" : ""} ${isCorrectRope ? "rope-scissors-correct" : ""}`}
              style={{
                left: (ropeXPositions[i] ?? width / 2) - 12,
                top: cutY - 12,
              }}
            >
              ✂️
            </div>
          );
        })}

      {/* Climbers on ropes (HTML layer for animations) */}
      {ropes.map((rope, ropeIndex) => (
        <RopeClimbersGroup
          key={ropeIndex}
          ropeData={rope}
          ropeX={ropeXPositions[ropeIndex] ?? width / 2}
          elevationToY={elevationToY}
          sizeConfig={sizeConfig}
          currentPlayerId={currentPlayerId}
          ropeIndex={ropeIndex}
          revealPhase={revealPhase}
          isSnipped={snippedRopes.has(ropeIndex)}
        />
      ))}

      {/* Players who haven't answered yet - show at their last column position */}
      {notAnswered.map((player, index) => {
        const y = elevationToY(player.elevation);
        // Position based on last answer's column, or spread out if no previous answer
        let x: number;
        if (player.lastOptionIndex !== null && player.lastOptionIndex >= 0 && player.lastOptionIndex < ropeXPositions.length) {
          // Player has a previous answer - position at that rope's X coordinate
          x = ropeXPositions[player.lastOptionIndex] ?? width / 2;
        } else {
          // New player with no previous answer - spread evenly across available space
          // Position them between the ropes, using index for distribution
          const newPlayerCount = notAnswered.filter(p => p.lastOptionIndex === null).length;
          const newPlayerIndex = notAnswered.filter((p, i) => p.lastOptionIndex === null && i < index).length;
          const spreadWidth = width * 0.6; // Use 60% of width for new players
          const startX = (width - spreadWidth) / 2; // Center the spread
          if (newPlayerCount <= 1) {
            x = width / 2;
          } else {
            x = startX + (newPlayerIndex / (newPlayerCount - 1)) * spreadWidth;
          }
        }
        return (
          <ThinkingPlayer
            key={player.playerId}
            playerId={player.playerId}
            playerName={player.playerName}
            x={x}
            y={y}
            size={sizeConfig.size}
            showName={sizeConfig.showName}
            nameSize={sizeConfig.nameSize}
            isCurrentPlayer={player.playerId === currentPlayerId}
            isRevealed={isRevealed}
          />
        );
      })}

      {/* Celebration particles for correct rope - only during complete phase */}
      {revealPhase === "complete" && <CelebrationParticles ropes={ropes} ropeXPositions={ropeXPositions} elevationToY={elevationToY} />}
    </>
  );
}

/**
 * Celebration particles that burst from correct rope climbers
 */
function CelebrationParticles({
  ropes,
  ropeXPositions,
  elevationToY,
}: {
  ropes: RopeData[];
  ropeXPositions: number[];
  elevationToY: (elevation: number) => number;
}) {
  const [particles, setParticles] = useState<
    Array<{ id: number; x: number; y: number; tx: number; ty: number; color: string }>
  >([]);

  useEffect(() => {
    // Generate particles for each correct rope climber
    const newParticles: typeof particles = [];
    let particleId = 0;

    ropes.forEach((rope, ropeIndex) => {
      if (rope.isCorrect !== true) return;

      rope.players.forEach((player) => {
        const x = ropeXPositions[ropeIndex] ?? 0;
        const y = elevationToY(player.elevationAtAnswer);

        // Generate 8-12 particles per player
        const numParticles = 8 + Math.floor(Math.random() * 5);
        const colors = ["#4ade80", "#22c55e", "#fbbf24", "#f59e0b", "#60a5fa", "#a855f7"];

        for (let i = 0; i < numParticles; i++) {
          const angle = (i / numParticles) * Math.PI * 2 + Math.random() * 0.5;
          const distance = 30 + Math.random() * 50;
          newParticles.push({
            id: particleId++,
            x,
            y,
            tx: Math.cos(angle) * distance,
            ty: Math.sin(angle) * distance - 20, // Bias upward
            color: colors[Math.floor(Math.random() * colors.length)]!,
          });
        }
      });
    });

    setParticles(newParticles);

    // Clear particles after animation
    const timer = setTimeout(() => setParticles([]), 1000);
    return () => clearTimeout(timer);
  }, []); // Only run once on mount

  return (
    <>
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="celebration-particle"
          style={{
            left: particle.x,
            top: particle.y,
            backgroundColor: particle.color,
            "--tx": `${particle.tx}px`,
            "--ty": `${particle.ty}px`,
          } as React.CSSProperties}
        />
      ))}
    </>
  );
}

/**
 * Group of climbers on a single rope
 */
const RopeClimbersGroup = memo(function RopeClimbersGroup({
  ropeData,
  ropeX,
  elevationToY,
  sizeConfig,
  currentPlayerId,
  ropeIndex,
  revealPhase = "pending",
  isSnipped = false,
}: {
  ropeData: RopeData;
  ropeX: number;
  elevationToY: (elevation: number) => number;
  sizeConfig: { size: number; spacing: number; showName: boolean; nameSize: number };
  currentPlayerId?: string;
  ropeIndex: number;
  revealPhase?: RevealPhase;
  isSnipped?: boolean;
}) {
  const { players, isCorrect } = ropeData;

  // Track animation phases for falling players
  const [animationPhase, setAnimationPhase] = useState<"climbing" | "falling" | "landed">("climbing");

  useEffect(() => {
    // Start falling animation when this rope gets snipped
    if (isSnipped && isCorrect === false) {
      setAnimationPhase("falling");
      // Transition to landed after fall animation completes
      const timer = setTimeout(() => {
        setAnimationPhase("landed");
      }, 800); // Match the blob-fall-from-rope animation duration
      return () => clearTimeout(timer);
    } else if (revealPhase === "pending") {
      setAnimationPhase("climbing");
    }
  }, [isSnipped, isCorrect, revealPhase]);

  // Determine climber reveal state based on reveal phase
  const getClimberRevealState = (): ClimberRevealState => {
    // During pending or scissors phase, everyone is still climbing
    if (revealPhase === "pending" || revealPhase === "scissors") return "climbing";

    // During snipping phase
    if (revealPhase === "snipping") {
      // Wrong ropes that have been snipped start falling
      if (isCorrect === false && isSnipped) return animationPhase;
      // Everything else still climbing (including correct ropes)
      return "climbing";
    }

    // Complete phase - show final states
    if (isCorrect === true) return "celebrating";
    if (isCorrect === false) return animationPhase;
    // Poll mode (isCorrect === null) - just keep climbing look
    return "climbing";
  };

  return (
    <>
      {players.map((player, playerIndex) => {
        // Calculate Y position based on elevation when they answered
        const baseY = elevationToY(player.elevationAtAnswer);

        // Offset players vertically if multiple on same rope
        // Earlier answerers (lower index) should be HIGHER on the rope
        // Since players array is sorted by answeredAt ascending, index 0 answered first
        // Higher position on rope = more negative Y offset (since Y increases downward)
        const totalPlayers = players.length;
        const climbOffset = -((totalPlayers - 1 - playerIndex) * 15); // Earlier answerers get more negative offset (higher)

        // Slight horizontal offset for visual separation
        const xOffset = (playerIndex % 2 === 0 ? -1 : 1) * (playerIndex > 0 ? 8 : 0);

        // Calculate fall distance (from current climb position back to their original elevation)
        // The climb offset puts them higher, so they need to fall back that distance
        const fallDistance = Math.abs(climbOffset) + 30 + playerIndex * 10; // Add some extra for dramatic effect

        // Calculate climb distance for correct answers (elevation gain visual)
        const climbDistance = isCorrect === true ? 40 + playerIndex * 5 : 0;

        return (
          <RopeClimber
            key={player.playerId}
            player={{
              id: player.playerId,
              name: player.playerName,
              elevation: player.elevationAtAnswer,
            }}
            x={ropeX + xOffset}
            y={baseY}
            size={sizeConfig.size}
            showName={sizeConfig.showName}
            isCurrentPlayer={player.playerId === currentPlayerId}
            climbOffset={climbOffset}
            revealState={getClimberRevealState()}
            fallDistance={fallDistance}
            climbDistance={climbDistance}
          />
        );
      })}
    </>
  );
});

/**
 * Player who hasn't answered yet - shows "thinking" animation
 */
const ThinkingPlayer = memo(function ThinkingPlayer({
  playerId,
  playerName,
  x,
  y,
  size,
  showName,
  nameSize,
  isCurrentPlayer,
  isRevealed = false,
}: {
  playerId: string;
  playerName: string;
  x: number;
  y: number;
  size: number;
  showName: boolean;
  nameSize: number;
  isCurrentPlayer: boolean;
  isRevealed?: boolean;
}) {
  const blobConfig = useMemo(() => generateBlob(playerName), [playerName]);

  return (
    <div
      className={`thinking-player ${isRevealed ? "thinking-player-reveal" : ""}`}
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        zIndex: isCurrentPlayer ? 100 : 5,
        filter: isCurrentPlayer
          ? "drop-shadow(0 0 6px gold) drop-shadow(0 0 12px rgba(255,215,0,0.5))"
          : "none",
        pointerEvents: "none",
      }}
    >
      <Blob config={blobConfig} size={size} state="idle" />
      {showName && (
        <div
          style={{
            position: "absolute",
            top: size,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: `${nameSize}px`,
            fontWeight: isCurrentPlayer ? "bold" : "normal",
            color: isCurrentPlayer ? "#FFD700" : "#FFFFFF",
            whiteSpace: "nowrap",
            textShadow: isCurrentPlayer
              ? "0 1px 3px rgba(0,0,0,0.8), 0 0 8px rgba(255,215,0,0.5)"
              : "0 1px 3px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.8)",
            background: "rgba(0,0,0,0.5)",
            padding: "2px 5px",
            borderRadius: "3px",
            maxWidth: size * 3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            border: isCurrentPlayer ? "1px solid rgba(255,215,0,0.4)" : "1px solid rgba(255,255,255,0.2)",
          }}
        >
          {playerName}
        </div>
      )}
      {/* Thinking indicator - hide during reveal */}
      {!isRevealed && (
        <div className="thinking-dots">
          <span className="thinking-dot" />
          <span className="thinking-dot" />
          <span className="thinking-dot" />
        </div>
      )}
    </div>
  );
});

/**
 * Decorative summit area - sunshine, clouds, distant mountains, victory flag
 * In spectator full-screen mode, also displays the current question in the sky
 */
function SummitDecoration({
  width,
  summitY,
  topY,
  mode,
  skyQuestion,
}: {
  width: number;
  summitY: number;
  topY: number;
  mode: MountainMode;
  skyQuestion?: SkyQuestion | null;
}) {
  const sunSize = mode === "admin-preview" ? 15 : mode === "spectator" ? 35 : 25;
  const cloudScale = mode === "admin-preview" ? 0.4 : mode === "spectator" ? 1 : 0.7;
  const midX = width / 2;

  // Calculate peak position (where the mountain tip would be)
  const peakY = topY + 20;

  // Calculate the sky height for question placement
  const skyHeight = summitY - topY;
  // Question text positioning - centered in the upper portion of the sky
  const questionY = topY + skyHeight * 0.35;

  return (
    <g>
      {/* Sky background */}
      <rect
        x={0}
        y={topY}
        width={width}
        height={summitY - topY + 30}
        fill={`url(#sky-gradient-${mode})`}
      />

      {/* Distant mountains silhouette - more layered for depth */}
      {/* Far layer */}
      <path
        d={`M0 ${summitY + 25}
           L${width * 0.08} ${summitY - 5}
           L${width * 0.18} ${summitY + 8}
           L${width * 0.3} ${summitY - 18}
           L${width * 0.42} ${summitY + 2}
           L${width * 0.55} ${summitY - 12}
           L${width * 0.68} ${summitY + 5}
           L${width * 0.8} ${summitY - 8}
           L${width * 0.92} ${summitY + 10}
           L${width} ${summitY}
           L${width} ${summitY + 30}
           L0 ${summitY + 30} Z`}
        fill="#9EB3C8"
        opacity="0.35"
      />
      {/* Near layer */}
      <path
        d={`M0 ${summitY + 20}
           L${width * 0.12} ${summitY + 5}
           L${width * 0.25} ${summitY + 15}
           L${width * 0.38} ${summitY - 8}
           L${width * 0.52} ${summitY + 10}
           L${width * 0.65} ${summitY - 3}
           L${width * 0.78} ${summitY + 12}
           L${width * 0.9} ${summitY + 2}
           L${width} ${summitY + 8}
           L${width} ${summitY + 25}
           L0 ${summitY + 25} Z`}
        fill="#8BA3B8"
        opacity="0.45"
      />

      {/* Sun with rays - positioned in top-right, but moved down if question is showing */}
      <g>
        {/* Sun rays */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
          <line
            key={angle}
            x1={width * 0.88}
            y1={topY + sunSize + 15}
            x2={width * 0.88 + Math.cos((angle * Math.PI) / 180) * sunSize * 1.8}
            y2={topY + sunSize + 15 + Math.sin((angle * Math.PI) / 180) * sunSize * 1.8}
            stroke="#FFD700"
            strokeWidth={mode === "admin-preview" ? 1 : 2}
            opacity="0.4"
          />
        ))}
        {/* Outer glow */}
        <circle
          cx={width * 0.88}
          cy={topY + sunSize + 15}
          r={sunSize * 1.2}
          fill={`url(#sun-glow-${mode})`}
        />
        {/* Inner sun */}
        <circle
          cx={width * 0.88}
          cy={topY + sunSize + 15}
          r={sunSize * 0.65}
          fill="#FFF8DC"
        />
      </g>

      {/* Clouds - multiple clouds with varied sizes and opacity, positioned to not overlap with question text */}
      {/* Upper left - small, faint */}
      <Cloud x={width * 0.03} y={topY + 15} scale={cloudScale * 0.5} opacity={0.4} />
      {/* Upper right - medium */}
      <Cloud x={width * 0.85} y={topY + 25} scale={cloudScale * 0.65} opacity={0.6} />
      {/* Mid-left - larger, more visible */}
      <Cloud x={width * 0.08} y={topY + skyHeight * 0.45} scale={cloudScale * 0.8} opacity={0.7} />
      {/* Mid-right - small, subtle */}
      <Cloud x={width * 0.72} y={topY + skyHeight * 0.5} scale={cloudScale * 0.55} opacity={0.5} />
      {/* Lower left (near summit) - medium */}
      <Cloud x={width * 0.15} y={topY + skyHeight * 0.75} scale={cloudScale * 0.7} opacity={0.8} />
      {/* Lower right (near summit) - larger, prominent */}
      <Cloud x={width * 0.78} y={topY + skyHeight * 0.7} scale={cloudScale * 0.9} opacity={0.75} />

      {/* Question text in the sky (spectator mode only) */}
      {skyQuestion && mode === "spectator" && (
        <SkyQuestionDisplay
          question={skyQuestion}
          width={width}
          midX={midX}
          questionY={questionY}
          skyHeight={skyHeight}
          topY={topY}
        />
      )}

      {/* Victory flag at the peak */}
      <SummitFlag
        x={midX}
        y={peakY}
        mode={mode}
      />
    </g>
  );
}

/**
 * Question display in the sky area
 */
function SkyQuestionDisplay({
  question,
  width,
  midX,
  questionY,
  skyHeight,
  topY,
}: {
  question: SkyQuestion;
  width: number;
  midX: number;
  questionY: number;
  skyHeight: number;
  topY: number;
}) {
  // Calculate font size based on viewport width
  const fontSize = Math.max(16, Math.min(32, width / 30));
  const smallFontSize = Math.max(12, fontSize * 0.5);

  // Calculate max text width for wrapping
  const maxTextWidth = width * 0.8;

  // Estimate number of lines for question (rough calculation)
  const charsPerLine = Math.floor(maxTextWidth / (fontSize * 0.5));
  const questionLines = Math.ceil(question.text.length / charsPerLine);
  const lineHeight = fontSize * 1.3;

  return (
    <g className="sky-question">
      {/* Question number badge */}
      <text
        x={midX}
        y={topY + 40}
        textAnchor="middle"
        fill="rgba(255,255,255,0.7)"
        fontSize={smallFontSize}
        fontWeight="600"
        style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}
      >
        Question {question.questionNumber} of {question.totalQuestions}
      </text>

      {/* Question text - with shadow for readability */}
      {/* Shadow layer */}
      <text
        x={midX + 2}
        y={questionY + 2}
        textAnchor="middle"
        fill="rgba(0,0,0,0.5)"
        fontSize={fontSize}
        fontWeight="700"
        style={{
          maxWidth: maxTextWidth,
        }}
      >
        {wrapText(question.text, charsPerLine).map((line, i) => (
          <tspan key={i} x={midX + 2} dy={i === 0 ? 0 : lineHeight}>
            {line}
          </tspan>
        ))}
      </text>

      {/* Main question text */}
      <text
        x={midX}
        y={questionY}
        textAnchor="middle"
        fill="white"
        fontSize={fontSize}
        fontWeight="700"
        style={{
          maxWidth: maxTextWidth,
          filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.4))",
        }}
      >
        {wrapText(question.text, charsPerLine).map((line, i) => (
          <tspan key={i} x={midX} dy={i === 0 ? 0 : lineHeight}>
            {line}
          </tspan>
        ))}
      </text>

      {/* "Get ready..." message during question_shown phase */}
      {question.phase === "question_shown" && (
        <text
          x={midX}
          y={questionY + questionLines * lineHeight + 30}
          textAnchor="middle"
          fill="rgba(255,255,255,0.6)"
          fontSize={smallFontSize * 1.2}
          fontStyle="italic"
        >
          Get ready...
        </text>
      )}
    </g>
  );
}

/**
 * Simple text wrapping helper
 */
function wrapText(text: string, charsPerLine: number): string[] {
  if (text.length <= charsPerLine) return [text];

  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + " " + word).trim().length <= charsPerLine) {
      currentLine = (currentLine + " " + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines;
}

/**
 * Victory flag at the mountain summit
 */
function SummitFlag({
  x,
  y,
  mode,
}: {
  x: number;
  y: number;
  mode: MountainMode;
}) {
  const scale = mode === "admin-preview" ? 0.5 : mode === "spectator" ? 1.2 : 0.9;
  const poleHeight = 35 * scale;
  const flagWidth = 25 * scale;
  const flagHeight = 18 * scale;

  return (
    <g>
      {/* Flag pole shadow */}
      <line
        x1={x + 2}
        y1={y}
        x2={x + 2}
        y2={y - poleHeight + 5}
        stroke="rgba(0,0,0,0.2)"
        strokeWidth={3 * scale}
        strokeLinecap="round"
      />
      {/* Flag pole */}
      <line
        x1={x}
        y1={y}
        x2={x}
        y2={y - poleHeight}
        stroke="#5C4033"
        strokeWidth={2.5 * scale}
        strokeLinecap="round"
      />
      {/* Flag with wave effect */}
      <path
        d={`M ${x} ${y - poleHeight}
           Q ${x + flagWidth * 0.5} ${y - poleHeight - 3}
             ${x + flagWidth} ${y - poleHeight + 2}
           L ${x + flagWidth - 2} ${y - poleHeight + flagHeight / 2}
           Q ${x + flagWidth * 0.6} ${y - poleHeight + flagHeight * 0.6}
             ${x + flagWidth} ${y - poleHeight + flagHeight}
           Q ${x + flagWidth * 0.4} ${y - poleHeight + flagHeight + 2}
             ${x} ${y - poleHeight + flagHeight}
           Z`}
        fill="#E63946"
      />
      {/* Flag highlight */}
      <path
        d={`M ${x} ${y - poleHeight}
           Q ${x + flagWidth * 0.3} ${y - poleHeight - 2}
             ${x + flagWidth * 0.6} ${y - poleHeight + 1}
           L ${x + flagWidth * 0.5} ${y - poleHeight + flagHeight * 0.4}
           Q ${x + flagWidth * 0.2} ${y - poleHeight + flagHeight * 0.3}
             ${x} ${y - poleHeight + flagHeight * 0.5}
           Z`}
        fill="#F4A4A8"
        opacity="0.5"
      />
      {/* Pole top ornament */}
      <circle
        cx={x}
        cy={y - poleHeight - 2 * scale}
        r={3 * scale}
        fill="#FFD700"
      />
    </g>
  );
}

/**
 * Fluffy cloud shape with depth
 */
function Cloud({ x, y, scale, opacity = 0.95 }: { x: number; y: number; scale: number; opacity?: number }) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`} opacity={opacity}>
      {/* Shadow layer */}
      <ellipse cx="2" cy="8" rx="26" ry="14" fill="rgba(150,180,200,0.3)" />
      {/* Main cloud body */}
      <ellipse cx="0" cy="0" rx="24" ry="14" fill="white" opacity="0.95" />
      <ellipse cx="-18" cy="4" rx="16" ry="11" fill="white" opacity="0.95" />
      <ellipse cx="18" cy="3" rx="18" ry="12" fill="white" opacity="0.95" />
      <ellipse cx="8" cy="-6" rx="14" ry="9" fill="white" opacity="0.95" />
      <ellipse cx="-8" cy="-4" rx="12" ry="8" fill="white" opacity="0.95" />
      {/* Highlight layer */}
      <ellipse cx="-5" cy="-8" rx="10" ry="5" fill="white" opacity="1" />
    </g>
  );
}

/**
 * Seeded random number generator for deterministic "randomness"
 * Uses a simple LCG (Linear Congruential Generator)
 */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/**
 * Generate jagged edge points with natural rocky variation
 */
function generateJaggedEdge(
  startY: number,
  endY: number,
  baseX: number,
  isLeft: boolean,
  seed: number,
  intensity: number = 1
): string[] {
  const random = seededRandom(seed);
  const points: string[] = [];
  const step = 8; // Smaller step = more detail
  const direction = isLeft ? -1 : 1;

  for (let y = startY; y >= endY; y -= step) {
    // Multiple layers of variation for natural look
    const largeWobble = Math.sin(y * 0.03 + seed) * 6 * intensity;
    const mediumWobble = Math.sin(y * 0.08 + seed * 2) * 4 * intensity;
    const smallWobble = (random() - 0.5) * 5 * intensity;

    // Occasional sharp jag
    const sharpJag = random() > 0.85 ? (random() - 0.5) * 10 * intensity : 0;

    const totalOffset = (largeWobble + mediumWobble + smallWobble + sharpJag) * direction;
    points.push(`${baseX + totalOffset},${y}`);
  }

  return points;
}

/**
 * Mountain shape - full width with decorative peak tip and jagged rocky edges
 */
function MountainShape({
  width,
  height,
  minElevation,
  maxElevation,
  elevationToY,
  mode,
}: {
  width: number;
  height: number;
  minElevation: number;
  maxElevation: number;
  elevationToY: (e: number) => number;
  mode: MountainMode;
}) {
  const summitY = elevationToY(SUMMIT);
  const tipY = elevationToY(maxElevation);
  const showTip = maxElevation > SUMMIT;
  const midX = width / 2;

  // Intensity scales with mode - less detail for admin-preview
  const edgeIntensity = mode === "admin-preview" ? 0.5 : 1;

  // Generate jagged left edge from bottom to summit
  const leftEdge = generateJaggedEdge(height, summitY, 0, true, 12345, edgeIntensity);

  // Generate jagged right edge from bottom to summit
  const rightEdge = generateJaggedEdge(height, summitY, width, false, 67890, edgeIntensity);

  // Build the path
  let pathD = `M 0,${height + 10}`; // Start below visible area

  // Left edge going up
  leftEdge.forEach((point) => {
    pathD += ` L ${point}`;
  });

  // If showing tip above summit, add the peak with jagged edges
  if (showTip) {
    const tipWidth = mode === "admin-preview" ? 0.35 : 0.25;
    const random = seededRandom(11111);

    // Left side taper to peak
    for (let y = summitY; y >= tipY + 10; y -= 6) {
      const progress = (summitY - y) / (summitY - tipY);
      const taperWidth = (1 - progress * (1 - tipWidth)) * width / 2;
      const wobble = (Math.sin(y * 0.12) * 3 + (random() - 0.5) * 4) * edgeIntensity;
      pathD += ` L ${midX - taperWidth + wobble},${y}`;
    }

    // Peak with slight jaggedness
    const peakOffset = (random() - 0.5) * 4 * edgeIntensity;
    pathD += ` L ${midX + peakOffset},${tipY - 3}`;

    // Right side taper from peak
    for (let y = tipY + 10; y <= summitY; y += 6) {
      const progress = (summitY - y) / (summitY - tipY);
      const taperWidth = (1 - progress * (1 - tipWidth)) * width / 2;
      const wobble = (Math.sin(y * 0.12 + 1) * 3 + (random() - 0.5) * 4) * edgeIntensity;
      pathD += ` L ${midX + taperWidth + wobble},${y}`;
    }
  } else {
    // Connect left and right at summit level
    pathD += ` L ${midX},${summitY}`;
  }

  // Right edge going down
  rightEdge.reverse().forEach((point) => {
    pathD += ` L ${point}`;
  });

  // Close path
  pathD += ` L ${width},${height + 10} Z`;

  return (
    <>
      {/* Main mountain body */}
      <path d={pathD} fill={`url(#mountain-gradient-${mode})`} />

      {/* Subtle edge shadow for depth on left side */}
      <path
        d={pathD}
        fill={`url(#rock-shadow-${mode})`}
        opacity="0.4"
      />

      {/* Snow cap at summit */}
      {elevationToY(SUMMIT) < height && (
        <SnowCap
          width={width}
          summitY={summitY}
          tipY={showTip ? tipY : summitY}
          showTip={showTip}
          mode={mode}
        />
      )}
    </>
  );
}

/**
 * Snow cap decoration at summit with irregular natural edges
 */
function SnowCap({
  width,
  summitY,
  tipY,
  showTip,
  mode,
}: {
  width: number;
  summitY: number;
  tipY: number;
  showTip: boolean;
  mode: MountainMode;
}) {
  const snowDepth = 50; // How far down the snow extends from summit
  const midX = width / 2;
  const random = seededRandom(99999);

  // Generate irregular snow line (bottom edge of snow)
  const generateSnowLine = (startX: number, endX: number, baseY: number): string => {
    const points: string[] = [];
    const step = 12;

    for (let x = startX; x <= endX; x += step) {
      // Distance from center affects snow depth (deeper near center)
      const distFromCenter = Math.abs(x - midX) / (width / 2);
      const depthFactor = 1 - distFromCenter * 0.6;

      // Irregular edge with multiple frequency waves
      const wave1 = Math.sin(x * 0.05) * 8;
      const wave2 = Math.sin(x * 0.12 + 2) * 4;
      const noise = (random() - 0.5) * 6;

      const y = baseY + snowDepth * depthFactor * 0.8 + wave1 + wave2 + noise;
      points.push(`${x},${y}`);
    }

    return points.join(" L ");
  };

  if (showTip) {
    // Snow on the peak with irregular dripping edges
    const peakWidth = width * 0.35;
    const leftEdge = midX - peakWidth;
    const rightEdge = midX + peakWidth;

    // Build snow path with irregular bottom edge
    let snowPath = `M ${midX},${tipY - 3}`; // Start at peak

    // Left side of peak going down
    for (let y = tipY; y <= summitY; y += 8) {
      const progress = (y - tipY) / (summitY - tipY);
      const baseX = midX - peakWidth * progress;
      const wobble = Math.sin(y * 0.15) * 3 + (random() - 0.5) * 4;
      snowPath += ` L ${baseX + wobble},${y}`;
    }

    // Irregular bottom edge
    snowPath += ` L ${generateSnowLine(leftEdge, rightEdge, summitY)}`;

    // Right side going back up
    for (let y = summitY; y >= tipY; y -= 8) {
      const progress = (y - tipY) / (summitY - tipY);
      const baseX = midX + peakWidth * progress;
      const wobble = Math.sin(y * 0.15 + 1) * 3 + (random() - 0.5) * 4;
      snowPath += ` L ${baseX + wobble},${y}`;
    }

    snowPath += " Z";

    return (
      <g>
        {/* Main snow */}
        <path
          d={snowPath}
          fill={`url(#snow-gradient-${mode})`}
          opacity="0.95"
        />
        {/* Subtle highlight on top */}
        <path
          d={`M ${midX},${tipY - 2}
              L ${midX - peakWidth * 0.5},${tipY + (summitY - tipY) * 0.3}
              Q ${midX},${tipY + (summitY - tipY) * 0.2} ${midX + peakWidth * 0.4},${tipY + (summitY - tipY) * 0.25}
              Z`}
          fill="white"
          opacity="0.5"
        />
      </g>
    );
  }

  // Snow cap without peak visible - still with irregular edge
  const snowLineY = summitY - 10;
  const leftX = width * 0.1;
  const rightX = width * 0.9;

  let snowPath = `M ${leftX},${snowLineY}`;
  snowPath += ` L ${generateSnowLine(leftX, rightX, snowLineY)}`;
  snowPath += ` L ${rightX},${snowLineY}`;
  snowPath += ` L ${rightX},${summitY - 30}`;
  snowPath += ` L ${leftX},${summitY - 30} Z`;

  return (
    <path
      d={snowPath}
      fill={`url(#snow-gradient-${mode})`}
      opacity="0.85"
    />
  );
}

/**
 * Surface details - simplified, cohesive rock face with subtle texture
 *
 * Design approach (Celeste/Alto's Adventure inspired):
 * - NO floating snow patches - snow only at summit cap
 * - NO geometric rock slabs - just subtle cracks/fissures
 * - Subtle diagonal striations as gentle texture, not bold lines
 * - Single unified rock face feel
 */
function MountainDetails({
  width,
  height,
  minElevation,
  maxElevation,
  elevationToY,
  mode,
}: {
  width: number;
  height: number;
  minElevation: number;
  maxElevation: number;
  elevationToY: (e: number) => number;
  mode: MountainMode;
}) {
  const summitY = elevationToY(SUMMIT);
  const random = seededRandom(54321);
  const mountainHeight = height - summitY;

  // Reduce detail for admin-preview mode
  const detailLevel = mode === "admin-preview" ? 0.4 : 1;

  // Generate subtle cracks/fissures (thin, organic lines)
  const numCracks = Math.floor(12 * detailLevel);
  const cracks: Array<{ path: string; opacity: number }> = [];

  for (let i = 0; i < numCracks; i++) {
    const startY = summitY + 30 + random() * (mountainHeight - 60);
    const startX = width * 0.1 + random() * width * 0.7;

    // Create organic, wandering crack path
    let path = `M ${startX} ${startY}`;
    let x = startX;
    let y = startY;
    const segments = 3 + Math.floor(random() * 4);

    for (let j = 0; j < segments; j++) {
      // Cracks tend to go diagonally down-right
      const dx = 15 + random() * 25;
      const dy = 8 + random() * 20;
      const cx = x + dx * 0.5 + (random() - 0.5) * 10;
      const cy = y + dy * 0.5 + (random() - 0.5) * 8;
      x += dx;
      y += dy;

      // Keep within bounds
      if (x > width * 0.95 || y > height - 20) break;

      path += ` Q ${cx} ${cy} ${x} ${y}`;
    }

    cracks.push({
      path,
      opacity: 0.15 + random() * 0.15,
    });
  }

  // Generate subtle horizontal ledge lines (just hints, not full ledges)
  const numLedgeHints = Math.floor(6 * detailLevel);
  const ledgeHints: Array<{ x1: number; x2: number; y: number; opacity: number }> = [];

  for (let i = 0; i < numLedgeHints; i++) {
    const y = summitY + 60 + random() * (mountainHeight - 120);
    const x1 = width * 0.15 + random() * width * 0.2;
    const ledgeWidth = 30 + random() * 50;

    ledgeHints.push({
      x1,
      x2: x1 + ledgeWidth,
      y,
      opacity: 0.2 + random() * 0.15,
    });
  }

  // Generate subtle vertical variations (darker streaks for depth)
  const numStreaks = Math.floor(5 * detailLevel);
  const darkStreaks: Array<{ x: number; width: number; opacity: number }> = [];

  for (let i = 0; i < numStreaks; i++) {
    darkStreaks.push({
      x: width * 0.1 + random() * width * 0.7,
      width: 20 + random() * 40,
      opacity: 0.08 + random() * 0.08,
    });
  }

  return (
    <g>
      {/* Vertical dark streaks for depth variation */}
      {darkStreaks.map((streak, i) => (
        <rect
          key={`streak-${i}`}
          x={streak.x}
          y={summitY}
          width={streak.width}
          height={mountainHeight}
          fill="#0a0c10"
          opacity={streak.opacity}
        />
      ))}

      {/* Subtle cracks/fissures */}
      {cracks.map((crack, i) => (
        <g key={`crack-${i}`}>
          {/* Soft shadow */}
          <path
            d={crack.path}
            fill="none"
            stroke="#0a0c10"
            strokeWidth={2}
            opacity={crack.opacity * 0.5}
            strokeLinecap="round"
            transform="translate(1, 1)"
          />
          {/* Main crack */}
          <path
            d={crack.path}
            fill="none"
            stroke="#1a202c"
            strokeWidth={1}
            opacity={crack.opacity}
            strokeLinecap="round"
          />
        </g>
      ))}

      {/* Subtle ledge hints */}
      {ledgeHints.map((ledge, i) => (
        <g key={`ledge-${i}`}>
          {/* Shadow below ledge */}
          <line
            x1={ledge.x1}
            y1={ledge.y + 2}
            x2={ledge.x2}
            y2={ledge.y + 3}
            stroke="#0a0c10"
            strokeWidth={2}
            opacity={ledge.opacity}
            strokeLinecap="round"
          />
          {/* Ledge highlight */}
          <line
            x1={ledge.x1}
            y1={ledge.y}
            x2={ledge.x2}
            y2={ledge.y}
            stroke="#5a6577"
            strokeWidth={1}
            opacity={ledge.opacity}
            strokeLinecap="round"
          />
        </g>
      ))}

      {/* Very subtle texture overlay - just fine grain noise */}
      <rect
        x={0}
        y={summitY}
        width={width}
        height={mountainHeight}
        fill={`url(#rock-texture-${mode})`}
        opacity="0.3"
      />
    </g>
  );
}

/**
 * Checkpoint marker with elevation labels on both sides
 */
function CheckpointMarker({
  elevation,
  y,
  width,
  isSummit,
  mode,
}: {
  elevation: number;
  y: number;
  width: number;
  name?: string; // Kept for API compatibility but no longer used
  isSummit: boolean;
  mode: MountainMode;
}) {
  const isCompact = mode === "admin-preview";

  return (
    <g>
      {/* Horizontal line across mountain - higher contrast for dark rock */}
      <line
        x1={0}
        y1={y}
        x2={width}
        y2={y}
        stroke={isSummit ? "#FFD700" : "rgba(255,255,255,0.45)"}
        strokeWidth={isSummit ? 2 : 1}
        strokeDasharray={isSummit ? "none" : "8,6"}
      />

      {/* Left elevation label - with shadow for visibility on dark rock */}
      {!isCompact && (
        <g>
          <text
            x={8}
            y={y + 4}
            fontSize="10"
            fill="#000"
            textAnchor="start"
            fontWeight={isSummit ? "bold" : "normal"}
            opacity="0.5"
            transform="translate(1, 1)"
          >
            {elevation}m
          </text>
          <text
            x={8}
            y={y + 4}
            fontSize="10"
            fill={isSummit ? "#FFD700" : "#FFFFFF"}
            textAnchor="start"
            fontWeight={isSummit ? "bold" : "normal"}
          >
            {elevation}m
          </text>
        </g>
      )}

      {/* Right elevation label - with shadow for visibility on dark rock */}
      {!isCompact && (
        <g>
          <text
            x={width - 8}
            y={y + 4}
            fontSize="10"
            fill="#000"
            textAnchor="end"
            fontWeight={isSummit ? "bold" : "normal"}
            opacity="0.5"
            transform="translate(1, 1)"
          >
            {elevation}m
          </text>
          <text
            x={width - 8}
            y={y + 4}
            fontSize="10"
            fill={isSummit ? "#FFD700" : "#FFFFFF"}
            textAnchor="end"
            fontWeight={isSummit ? "bold" : "normal"}
          >
            {elevation}m
          </text>
        </g>
      )}
    </g>
  );
}


/**
 * Player blob positioned on the mountain (memoized for performance)
 */
const MemoizedPlayerBlob = memo(function PlayerBlob({
  player,
  x,
  y,
  isCurrentPlayer,
  size,
  showName,
  nameSize,
}: {
  player: MountainPlayer;
  x: number;
  y: number;
  isCurrentPlayer: boolean;
  size: number;
  showName: boolean;
  nameSize: number;
}) {
  const blobConfig = useMemo(() => generateBlob(player.name), [player.name]);

  return (
    <div
      className="mountain-player"
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        transition: "left 0.3s ease-out, top 0.5s ease-out",
        zIndex: isCurrentPlayer ? 100 : 1,
        filter: isCurrentPlayer ? "drop-shadow(0 0 6px gold) drop-shadow(0 0 12px rgba(255,215,0,0.5))" : "none",
      }}
    >
      <Blob config={blobConfig} size={size} state="idle" />
      {/* Name label - optimized for dark rock background */}
      {showName && (
        <div
          style={{
            position: "absolute",
            top: size,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: `${nameSize}px`,
            fontWeight: isCurrentPlayer ? "bold" : "normal",
            color: isCurrentPlayer ? "#FFD700" : "#FFFFFF",
            whiteSpace: "nowrap",
            textShadow: isCurrentPlayer
              ? "0 1px 3px rgba(0,0,0,0.8), 0 0 8px rgba(255,215,0,0.5)"
              : "0 1px 3px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.8)",
            background: "rgba(0,0,0,0.5)",
            padding: "2px 5px",
            borderRadius: "3px",
            maxWidth: size * 3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            border: isCurrentPlayer ? "1px solid rgba(255,215,0,0.4)" : "1px solid rgba(255,255,255,0.2)",
          }}
        >
          {player.name}
        </div>
      )}
    </div>
  );
});
