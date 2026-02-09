import { useMemo, memo, useState, useEffect, useRef } from "react";
import { Blob } from "../Blob";
import { generateBlob } from "../../lib/blobGenerator";
import { SUMMIT } from "../../../lib/elevation";
import { Rope, RopeClimber, type RopeRevealState, type ClimberRevealState, type RevealPhase } from "../Rope";
import type { RopeClimbingState, RopeData, QuestionPhase } from "../../../lib/ropeTypes";
import { playSound } from "../../lib/soundManager";
import type { MountainMode, SizeConfig } from "./types";

/**
 * Ropes overlay component - renders 4 vertical ropes with climbers
 */
export function RopesOverlay({
  ropeClimbingState,
  width,
  height,
  elevationToY,
  elevationToYCapped,
  minElevation,
  maxElevation,
  sizeConfig,
  currentPlayerId,
  mode,
  questionPhase,
  currentPlayerElevation,
  answerShuffleOrder,
}: {
  ropeClimbingState: RopeClimbingState;
  width: number;
  height: number;
  elevationToY: (elevation: number) => number;
  /** Capped version for player blob positioning - caps elevation at SUMMIT */
  elevationToYCapped: (elevation: number) => number;
  minElevation: number;
  maxElevation: number;
  sizeConfig: SizeConfig;
  currentPlayerId?: string;
  mode: MountainMode;
  questionPhase: QuestionPhase;
  /** Current player's elevation - used to position scissors in player view */
  currentPlayerElevation?: number;
  /** Shuffled order - array of original indices in visual order. If provided, ropes are displayed in this order. */
  answerShuffleOrder?: number[];
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
  const prevQuestionPhaseRef = useRef<QuestionPhase | null>(null);

  // Reset reveal state when stepping BACKWARD from revealed phase
  // This handles the "Hide Answers" button going from revealed -> answers_shown
  // But NOT when going FORWARD from revealed -> results (leaderboard)
  useEffect(() => {
    const prevPhase = prevQuestionPhaseRef.current;
    const currentPhase = questionPhase;
    prevQuestionPhaseRef.current = currentPhase;

    // Phase order: question_shown -> answers_shown -> revealed -> results
    // Only reset when going BACKWARD, not forward to results
    const isBackwardTransition = prevPhase === "revealed" &&
      (currentPhase === "question_shown" || currentPhase === "answers_shown");

    if (isBackwardTransition) {
      // Reset all reveal-related state
      revealStartedRef.current = false;
      setRevealPhase("pending");
      setSnippedRopes(new Set());
      prevIsRevealedRef.current = false;
    }
  }, [questionPhase]);

  // Get indices of ALL wrong ropes (snip all wrong ladders, not just ones with players)
  // Sorted by player count (ascending) so least populated ropes are snipped first
  // This creates more dramatic tension by snipping the most populated wrong rope last
  const sortedWrongRopesByPopulation = useMemo(() => {
    return ropes
      .map((rope, i) => ({ rope, index: i }))
      .filter(({ rope }) => rope.isCorrect === false)
      .sort((a, b) => {
        // Sort by player count ascending (least populated first)
        const countA = a.rope.players.length;
        const countB = b.rope.players.length;
        if (countA !== countB) {
          return countA - countB;
        }
        // Tie-breaker: use deterministic order based on index for consistency across clients
        return a.index - b.index;
      })
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
      // Using a chain of promises to ensure truly sequential timing
      const snipStartTimer = setTimeout(async () => {
        if (sortedWrongRopesByPopulation.length === 0) {
          // No wrong ropes to snip - go straight to complete
          setRevealPhase("complete");
          // Play celebration for correct answers
          const correctRope = ropes.find((rope) => rope.isCorrect === true);
          if (correctRope && correctRope.players.length > 0) {
            // Play celebration fanfare first
            setTimeout(() => playSound("celebration"), 200);

            // Then play blobHappy sounds for each correct player
            const numHappySounds = Math.min(correctRope.players.length, 4); // Cap at 4 sounds
            for (let j = 0; j < numHappySounds; j++) {
              setTimeout(() => playSound("blobHappy"), 400 + j * 80);
            }
          }
        } else {
          setRevealPhase("snipping");

          // Play the "safe" sound when correct rope scissors start fading away
          // This provides audio feedback that the correct ladder is safe
          const correctRopeExists = ropes.some((rope) => rope.isCorrect === true);
          if (correctRopeExists) {
            // Slight delay so it plays after the visual transition starts
            setTimeout(() => playSound("scissorsSafe"), 100);
          }

          // Snip wrong ropes one at a time, sorted by population (least first), truly sequentially using async/await
          const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

          for (let i = 0; i < sortedWrongRopesByPopulation.length; i++) {
            const ropeIndex = sortedWrongRopesByPopulation[i];
            if (ropeIndex === undefined) continue;

            // Play snip sound
            playSound("snip");

            // Mark this rope as snipped
            setSnippedRopes(prev => new Set([...prev, ropeIndex]));

            // Play sad blob sounds for players on this specific rope (staggered)
            const rope = ropes[ropeIndex];
            if (rope && rope.players.length > 0) {
              // Play blobSad sounds for each player falling from this rope
              // Stagger them slightly for a "chorus of disappointment" effect
              const numSadSounds = Math.min(rope.players.length, 4); // Cap at 4 sounds
              for (let j = 0; j < numSadSounds; j++) {
                setTimeout(() => playSound("blobSad"), 150 + j * 100);
              }
            }

            // Wait before the next snip (800ms between each snip for dramatic pacing)
            // But don't wait after the last one
            if (i < sortedWrongRopesByPopulation.length - 1) {
              await delay(800);
            }
          }

          // After all ropes are snipped, wait a bit then transition to complete
          await delay(500);
          setRevealPhase("complete");

          // Play happy blob sounds for correct players (staggered celebration)
          const correctRope = ropes.find((rope) => rope.isCorrect === true);
          if (correctRope && correctRope.players.length > 0) {
            // Play celebration fanfare first
            setTimeout(() => playSound("celebration"), 200);

            // Then play blobHappy sounds for each correct player
            const numHappySounds = Math.min(correctRope.players.length, 4); // Cap at 4 sounds
            for (let j = 0; j < numHappySounds; j++) {
              setTimeout(() => playSound("blobHappy"), 400 + j * 80);
            }
          }
        }
      }, 1500);

      return () => {
        clearTimeout(tensionTimer);
        clearTimeout(snipStartTimer);
      };
    }

    prevIsRevealedRef.current = isRevealed;
  }, [isRevealed, ropeClimbingState.question.id, sortedWrongRopesByPopulation, ropes]);

  // Calculate rope positions - evenly spaced across the width
  const ropeCount = ropes.length;
  const padding = width * 0.1; // 10% padding on each side
  const usableWidth = width - padding * 2;
  const ropeSpacing = ropeCount > 1 ? usableWidth / (ropeCount - 1) : 0;

  // Visual order for ropes - maps visual position to original rope index
  // If answerShuffleOrder is provided, use it; otherwise use natural order [0, 1, 2, ...]
  const visualOrder = answerShuffleOrder && answerShuffleOrder.length === ropeCount
    ? answerShuffleOrder
    : ropes.map((_, i) => i);

  // Reverse mapping: original index -> visual position
  const originalToVisualPosition = useMemo(() => {
    const mapping = new Map<number, number>();
    visualOrder.forEach((originalIndex, visualPosition) => {
      mapping.set(originalIndex, visualPosition);
    });
    return mapping;
  }, [visualOrder]);

  // Get X position for a visual position (0 = leftmost, 1 = second from left, etc.)
  const getXForVisualPosition = (visualPosition: number): number => {
    if (ropeCount === 1) return width / 2;
    return padding + visualPosition * ropeSpacing;
  };

  // Get X position for an original rope index (uses the shuffle mapping)
  const getXForOriginalIndex = (originalIndex: number): number => {
    const visualPos = originalToVisualPosition.get(originalIndex) ?? originalIndex;
    return getXForVisualPosition(visualPos);
  };

  // Legacy ropeXPositions for backward compatibility - maps original index to X position
  const ropeXPositions = ropes.map((_, originalIndex) => getXForOriginalIndex(originalIndex));

  // Calculate rope top and bottom Y positions
  // IMPORTANT: Ropes should stop at the summit line, not extend into the sky area
  const ropeTopY = elevationToY(SUMMIT);
  const ropeBottomY = elevationToY(minElevation);

  // For player mode, calculate scissors position relative to their visible viewport
  // In spectator/admin mode, scissors appear at the summit line (ropeTopY)
  // In player mode, scissors appear near the top of what the player can see
  const scissorsBaseY = useMemo(() => {
    if (mode === "player" && currentPlayerElevation !== undefined) {
      // Player's visible range extends to currentPlayerElevation + 200 (from the viewport calculation)
      // Position scissors about 150m above the player's current elevation, but clamped to visible area
      const scissorsElevation = Math.min(SUMMIT, currentPlayerElevation + 150);
      return elevationToY(scissorsElevation);
    }
    // Spectator/admin mode: scissors at summit line
    return ropeTopY;
  }, [mode, currentPlayerElevation, elevationToY, ropeTopY]);

  // Labels for ropes (A, B, C, D, etc.) - based on VISUAL position, not original index
  // When shuffled, the leftmost rope is always "A", second is "B", etc.
  const ropeLabels = ropes.map((_, originalIndex) => {
    const visualPosition = originalToVisualPosition.get(originalIndex) ?? originalIndex;
    return String.fromCharCode(65 + visualPosition);
  });

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

  // Calculate cut Y position for wrong ropes
  // The scissors appear relative to the player's view, so the cut happens there
  // This means: portion ABOVE scissors stays attached, portion BELOW scissors falls
  const getCutY = (rope: RopeData, ropeIndex: number): number | undefined => {
    // Only show cut for wrong ropes that have been snipped
    if (rope.isCorrect !== false) return undefined;
    if (!snippedRopes.has(ropeIndex) && revealPhase !== "complete") return undefined;

    // Scissors are positioned at scissorsBaseY + 15, so cut should be at the same position
    // Add a small offset (5px) to place the cut just below the scissors blades
    return scissorsBaseY + 20;
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
            optionText={rope.optionText}
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
            questionPhase={questionPhase}
          />
        ))}
      </svg>

      {/* Scissors animation - show on ALL ropes during scissors/snipping phases for suspense */}
      {(revealPhase === "scissors" || revealPhase === "snipping") &&
        ropes.map((rope, i) => {
          // Skip poll-mode ropes (isCorrect === null)
          if (rope.isCorrect === null) return null;

          // Position scissors relative to the player's view
          // In player mode: scissors appear near the top of their visible area
          // In spectator/admin mode: scissors appear at the summit line (ropeTopY)
          const scissorsY = scissorsBaseY + 15;

          // Determine scissors class based on rope correctness and phase
          // During scissors phase: all scissors hover menacingly
          // During snipping phase:
          //   - Wrong rope that just got snipped: play snip animation
          //   - Correct rope: fade away to show it's safe
          //   - Wrong ropes not yet snipped: keep hovering
          const isCorrectRope = rope.isCorrect === true;
          const isWrongRope = rope.isCorrect === false;
          const isSnippingPhase = revealPhase === "snipping";
          const hasBeenSnipped = snippedRopes.has(i);

          let scissorsClass = "rope-scissors";
          if (revealPhase === "scissors") {
            // All scissors hover menacingly during tension phase
            scissorsClass += " rope-scissors-hover";
          } else if (isSnippingPhase) {
            if (isWrongRope && hasBeenSnipped) {
              // This wrong rope just got snipped - play snip animation
              scissorsClass += " rope-scissors-snipping";
            } else if (isCorrectRope) {
              // Correct rope - scissors should fade away to show it's safe
              scissorsClass += " rope-scissors-correct";
            } else {
              // Wrong rope not yet snipped - keep hovering
              scissorsClass += " rope-scissors-hover";
            }
          }

          return (
            <div
              key={`scissors-${i}`}
              className={scissorsClass}
              style={{
                left: (ropeXPositions[i] ?? width / 2) - 32,
                top: scissorsY - 32,
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
          elevationToYCapped={elevationToYCapped}
          sizeConfig={sizeConfig}
          currentPlayerId={currentPlayerId}
          ropeIndex={ropeIndex}
          revealPhase={revealPhase}
          isSnipped={snippedRopes.has(ropeIndex)}
        />
      ))}

      {/* Players who haven't answered yet - show at their last column position */}
      {notAnswered.map((player, index) => {
        const y = elevationToYCapped(player.elevation);
        // Position based on last answer's column, or spread out if no previous answer
        let x: number;
        if (player.lastOptionIndex !== null && player.lastOptionIndex >= 0) {
          // Player has a previous answer - use lastOptionIndex to position them
          // (mod by ropeCount to handle different numbers of options between questions)
          // IMPORTANT: lastOptionIndex is an ORIGINAL answer index, not a visual position!
          // Use getXForOriginalIndex to correctly map through the shuffle order.
          const originalIndex = player.lastOptionIndex % ropeCount;
          x = getXForOriginalIndex(originalIndex);
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
      {revealPhase === "complete" && <CelebrationParticles ropes={ropes} ropeXPositions={ropeXPositions} elevationToYCapped={elevationToYCapped} />}
    </>
  );
}

/**
 * Celebration particles that burst from correct rope climbers
 */
function CelebrationParticles({
  ropes,
  ropeXPositions,
  elevationToYCapped,
}: {
  ropes: RopeData[];
  ropeXPositions: number[];
  elevationToYCapped: (elevation: number) => number;
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
        const y = elevationToYCapped(player.elevationAtAnswer);

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
  elevationToYCapped,
  sizeConfig,
  currentPlayerId,
  ropeIndex,
  revealPhase = "pending",
  isSnipped = false,
}: {
  ropeData: RopeData;
  ropeX: number;
  elevationToYCapped: (elevation: number) => number;
  sizeConfig: SizeConfig;
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

  // IMPORTANT: Blobs should NEVER appear above their final elevation!
  // Before reveal: blob is at elevationAtAnswer (where they grabbed the rope)
  // After reveal (correct): blob climbs UP by their actual elevationGain
  // After reveal (wrong): blob stays at elevationAtAnswer
  //
  // We use a small visual offset just for player stacking (when multiple players on same rope)
  // but NO large "climb up" animation that would make them appear higher than they'll end up.

  return (
    <>
      {players.map((player, playerIndex) => {
        // Calculate Y position based on elevation when they answered
        const baseY = elevationToYCapped(player.elevationAtAnswer);

        // Small stacking offset for multiple players on same rope (just for visual separation)
        // Earlier answerers (lower index) get positioned slightly higher
        // Keep this small (8px per player) so it doesn't misrepresent elevation
        const totalPlayers = players.length;
        const stackOffset = -((totalPlayers - 1 - playerIndex) * 8);

        // The climb offset is ONLY the small stacking offset
        // No large arbitrary climb - we don't want blobs appearing above their actual elevation
        const climbOffset = stackOffset;

        // Slight horizontal offset for visual separation
        const xOffset = (playerIndex % 2 === 0 ? -1 : 1) * (playerIndex > 0 ? 8 : 0);

        // Fall distance: for wrong answers, they just stay at their position (no fall needed)
        // since we're not artificially elevating them anymore
        const fallDistance = 0;

        // Climb distance for correct answers: this is the ACTUAL elevation gain!
        // This is the only upward movement - it represents real scoring
        let climbDistance = 0;
        if (isCorrect === true) {
          if (player.elevationGain !== undefined && player.elevationGain > 0) {
            // Convert elevation gain (meters) to visual climb distance (pixels)
            // Y increases downward, so startY > endY when climbing up
            const startY = elevationToYCapped(player.elevationAtAnswer);
            const endY = elevationToYCapped(player.elevationAtAnswer + player.elevationGain);
            climbDistance = startY - endY; // Positive = climbing up
            // Add small offset per player for visual stacking at final position
            climbDistance += playerIndex * 5;
            // Ensure minimum visible climb for feedback
            climbDistance = Math.max(climbDistance, 10);
          } else {
            // Fallback if elevationGain not yet populated (shouldn't happen during celebrate)
            // Use a small default based on typical scoring
            climbDistance = 20 + playerIndex * 5;
          }
        }

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

  // Highlight circle size is slightly larger than the blob
  const highlightSize = size * 1.4;

  return (
    <div
      className={`thinking-player ${isRevealed ? "thinking-player-reveal" : ""} ${isCurrentPlayer ? "current-player-highlight" : ""}`}
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size,
        zIndex: isCurrentPlayer ? 100 : 5,
        filter: isCurrentPlayer
          ? "drop-shadow(0 0 6px gold) drop-shadow(0 0 12px rgba(255,215,0,0.5))"
          : "none",
        pointerEvents: "none",
      }}
    >
      {/* Highlight circle behind current player's blob */}
      {isCurrentPlayer && (
        <div
          className="player-highlight-circle"
          style={{
            position: "absolute",
            width: highlightSize,
            height: highlightSize,
            left: (size - highlightSize) / 2,
            top: (size - highlightSize) / 2,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255, 215, 0, 0.4) 0%, rgba(255, 215, 0, 0.15) 50%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
      )}
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
