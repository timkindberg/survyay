import { useMemo } from "react";
import "../Mountain.css";
import { SUMMIT } from "../../../lib/elevation";
import type { RopeClimbingState } from "../../../lib/ropeTypes";
import type { MountainPlayer, MountainMode, SkyQuestion, SizeConfig } from "./types";
import { CHECKPOINT_INTERVAL, CHECKPOINT_NAMES, PLAYER_SIZE_CONFIG, MAX_PLAYERS_PER_ROW } from "./types";
import { MountainDefs } from "./MountainDefs";
import { MountainShape } from "./MountainShape";
import { MountainDetails } from "./MountainDetails";
import { SummitDecoration } from "./SummitDecoration";
import { CheckpointMarker } from "./CheckpointMarker";
import { MemoizedPlayerBlob } from "./PlayerBlob";
import { RopesOverlay } from "./RopesOverlay";

const NUM_CHECKPOINTS = Math.floor(SUMMIT / CHECKPOINT_INTERVAL) + 1;

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
  /**
   * Shuffled answer order for randomized display.
   * Array of original indices in shuffled order.
   * e.g., [2, 0, 3, 1] means: position 0 shows original answer 2, position 1 shows original answer 0, etc.
   * If not provided, answers are shown in original order.
   */
  answerShuffleOrder?: number[];
}

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
  answerShuffleOrder,
}: MountainProps) {
  // Determine if ropes should be shown
  // Show ropes during answers_shown and revealed phases (not during question_shown or results)
  // During "results" phase, blobs should appear at their actual elevation on the mountain
  const showRopes =
    ropeClimbingState !== null &&
    ropeClimbingState !== undefined &&
    ropeClimbingState.questionPhase !== "question_shown" &&
    ropeClimbingState.questionPhase !== "results";

  // Calculate the visible elevation range
  const { minElevation, maxElevation } = useMemo(() => {
    if (mode === "spectator" || mode === "admin-preview") {
      // Spectator/admin sees full mountain with decorative summit area
      // Increased sky area (SUMMIT + 350) to give more room for question text and answer pills
      return { minElevation: -50, maxElevation: SUMMIT + 350 };
    } else {
      // Player sees their elevation +/- 150m, with minimum visibility
      // During reveal/results phases, freeze viewport at player's answer elevation to prevent visual glitches
      // when their database elevation updates mid-animation
      let baseElevation = currentPlayerElevation;
      let lowestElevationToInclude = currentPlayerElevation;

      if (ropeClimbingState && currentPlayerId) {
        const questionPhase = ropeClimbingState.questionPhase;
        if (questionPhase === "revealed" || questionPhase === "results") {
          // Find the player's elevation when they answered
          for (const rope of ropeClimbingState.ropes) {
            const playerOnRope = rope.players.find(p => p.playerId === currentPlayerId);
            if (playerOnRope) {
              baseElevation = playerOnRope.elevationAtAnswer;
              break;
            }
          }

          // CRITICAL FIX: During reveal/results, we must include ALL player elevations in the viewport
          // This prevents blobs at 0m from rendering below the visible area
          // Collect all elevations: players on ropes (at their elevationAtAnswer) and players who haven't answered
          const allElevations: number[] = [baseElevation];

          // Add elevationAtAnswer for all players on ropes
          for (const rope of ropeClimbingState.ropes) {
            for (const player of rope.players) {
              allElevations.push(player.elevationAtAnswer);
            }
          }

          // Add elevations for players who haven't answered yet
          for (const player of ropeClimbingState.notAnswered) {
            allElevations.push(player.elevation);
          }

          // The viewport must include the lowest elevation among all players
          lowestElevationToInclude = Math.min(...allElevations, 0); // Always include 0m as floor
        }
      }

      // Calculate viewport range, ensuring it includes all relevant elevations during reveal
      const playerMin = Math.max(-50, Math.min(baseElevation - 150, lowestElevationToInclude - 50));
      const playerMax = Math.min(SUMMIT + 100, baseElevation + 200);
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
  }, [mode, currentPlayerElevation, ropeClimbingState, currentPlayerId]);

  // Convert elevation to Y coordinate (higher elevation = lower Y)
  // This is the base conversion used for mountain structure (tip, snow cap, etc.)
  const elevationToY = (elevation: number): number => {
    const range = maxElevation - minElevation;
    const padding = 20;
    const usableHeight = height - padding * 2;
    const normalized = (elevation - minElevation) / range;
    return height - padding - normalized * usableHeight;
  };

  // VISUAL CAP: For player blob positioning only - players can earn bonus
  // elevation above 1000m for scoring, but their visual position is capped
  // at the summit line so they don't float above the mountain.
  const elevationToYCapped = (elevation: number): number => {
    const visualElevation = Math.min(elevation, SUMMIT);
    return elevationToY(visualElevation);
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
      if (band.length <= maxPerRow) {
        // Simple horizontal spread
        const totalWidth = (band.length - 1) * blobSpacing;
        const startX = centerX - totalWidth / 2;

        band.forEach((p, i) => {
          positions.push({
            player: p,
            x: startX + i * blobSpacing,
            y: elevationToYCapped(p.elevation),
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
            y: elevationToYCapped(p.elevation) + row * rowHeight - (numRows - 1) * rowHeight / 2,
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
        <MountainDefs mode={mode} />

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
          elevationToYCapped={elevationToYCapped}
          minElevation={minElevation}
          maxElevation={maxElevation}
          sizeConfig={sizeConfig}
          currentPlayerId={currentPlayerId}
          mode={mode}
          questionPhase={ropeClimbingState.questionPhase}
          currentPlayerElevation={currentPlayerElevation}
          answerShuffleOrder={answerShuffleOrder}
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

    </div>
  );
}
