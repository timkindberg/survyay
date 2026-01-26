import { memo, useMemo } from "react";
import { Blob } from "./Blob";
import { generateBlob } from "../lib/blobGenerator";

export interface RopePlayer {
  id: string;
  name: string;
  elevation: number;
}

/** State of the rope after reveal */
export type RopeRevealState = "pending" | "correct" | "wrong" | "poll";

/** Reveal phase progression */
export type RevealPhase = "pending" | "scissors" | "snipping" | "complete";

interface RopeProps {
  /** Label for the rope (A, B, C, D) */
  label: string;
  /** Answer text for this option */
  answerText: string;
  /** X position of the rope center */
  x: number;
  /** Top Y position (top of visible area) */
  topY: number;
  /** Bottom Y position (bottom of visible area) */
  bottomY: number;
  /** Players currently on this rope */
  players: RopePlayer[];
  /** Size of player blobs */
  playerSize: number;
  /** Whether to show player names */
  showNames: boolean;
  /** Current player ID to highlight */
  currentPlayerId?: string;
  /** Convert elevation to Y coordinate */
  elevationToY: (elevation: number) => number;
  /** Reveal state of the rope (after timer expires) */
  revealState?: RopeRevealState;
  /** Y position where the rope should be cut (only for wrong ropes) */
  cutY?: number;
  /** Current reveal phase */
  revealPhase?: RevealPhase;
  /** Whether this is a wrong rope (for tension styling) */
  isWrongRope?: boolean;
}

/**
 * Vertical rope ladder component
 *
 * Renders a rope ladder that spans the mountain height,
 * with players attached at their current elevation + climbing animation
 */
export const Rope = memo(function Rope({
  label,
  answerText,
  x,
  topY,
  bottomY,
  revealState = "pending",
  cutY,
  revealPhase = "pending",
  isWrongRope = false,
}: RopeProps) {
  const ropeHeight = bottomY - topY;

  // Ladder dimensions
  const ladderWidth = 24; // Total width of the ladder
  const leftRopeX = x - ladderWidth / 2; // Left vertical rope position
  const rightRopeX = x + ladderWidth / 2; // Right vertical rope position
  const verticalRopeWidth = 4; // Width of vertical rope strokes (increased for visibility)

  // Rope colors (solid colors for better visibility on vertical lines)
  const ropeColor = "#A67C3D"; // Tan/brown rope color
  const ropeColorDark = "#8B6914"; // Darker shade for shadow/depth
  const ropeColorCorrect = "#22c55e"; // Green for correct
  const ropeColorWrong = "#8b8b8b"; // Gray for wrong

  // Calculate rung positions (every 20px for better density)
  const rungSpacing = 20;
  const numRungs = Math.max(1, Math.floor(ropeHeight / rungSpacing));
  const rungs = useMemo(() => {
    return Array.from({ length: numRungs }, (_, i) => topY + i * rungSpacing + rungSpacing / 2);
  }, [numRungs, topY, rungSpacing]);

  // Determine rope colors based on reveal state
  const isCorrect = revealState === "correct";
  const isWrong = revealState === "wrong";
  const isPoll = revealState === "poll";

  // For wrong ropes, we'll render two parts: above cut and below cut (falling away)
  // If cutY is not provided, default to 80% down the rope (near where players typically are)
  const actualCutY = cutY ?? (topY + ropeHeight * 0.8);

  // Add tension wobble during scissors phase
  const isTensionPhase = revealPhase === "scissors";

  return (
    <g className={`rope ${isCorrect ? "rope-correct" : ""} ${isTensionPhase ? "rope-tension-wobble" : ""}`}>
      {/* Rope SVG elements */}
      <defs>
        {/* Rope texture gradient */}
        <linearGradient id={`rope-gradient-${label}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#8B6914" />
          <stop offset="30%" stopColor="#C4A24E" />
          <stop offset="50%" stopColor="#DDB855" />
          <stop offset="70%" stopColor="#C4A24E" />
          <stop offset="100%" stopColor="#8B6914" />
        </linearGradient>
        {/* Correct rope gradient - green tint */}
        <linearGradient id={`rope-gradient-correct-${label}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#166534" />
          <stop offset="30%" stopColor="#22c55e" />
          <stop offset="50%" stopColor="#4ade80" />
          <stop offset="70%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#166534" />
        </linearGradient>
        {/* Wrong rope gradient - red/gray tint */}
        <linearGradient id={`rope-gradient-wrong-${label}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#6b6b6b" />
          <stop offset="30%" stopColor="#8b8b8b" />
          <stop offset="50%" stopColor="#9a9a9a" />
          <stop offset="70%" stopColor="#8b8b8b" />
          <stop offset="100%" stopColor="#6b6b6b" />
        </linearGradient>
      </defs>

      {/* For wrong ropes, show the cut effect */}
      {isWrong ? (
        <>
          {/* Upper part of rope (above cut) - stays in place */}
          <g>
            {/* Left vertical rope - upper shadow */}
            <line
              x1={leftRopeX + 1}
              y1={topY}
              x2={leftRopeX + 1}
              y2={actualCutY}
              stroke="rgba(0,0,0,0.3)"
              strokeWidth={verticalRopeWidth}
              strokeLinecap="round"
            />
            {/* Left vertical rope - upper */}
            <line
              x1={leftRopeX}
              y1={topY}
              x2={leftRopeX}
              y2={actualCutY}
              stroke={ropeColorWrong}
              strokeWidth={verticalRopeWidth}
              strokeLinecap="round"
            />
            {/* Right vertical rope - upper shadow */}
            <line
              x1={rightRopeX + 1}
              y1={topY}
              x2={rightRopeX + 1}
              y2={actualCutY}
              stroke="rgba(0,0,0,0.3)"
              strokeWidth={verticalRopeWidth}
              strokeLinecap="round"
            />
            {/* Right vertical rope - upper */}
            <line
              x1={rightRopeX}
              y1={topY}
              x2={rightRopeX}
              y2={actualCutY}
              stroke={ropeColorWrong}
              strokeWidth={verticalRopeWidth}
              strokeLinecap="round"
            />
            {/* Rope rungs above cut */}
            {rungs.filter(rungY => rungY < actualCutY).map((rungY, i) => (
              <g key={i}>
                {/* Rung shadow */}
                <line
                  x1={leftRopeX}
                  y1={rungY + 1}
                  x2={rightRopeX}
                  y2={rungY + 1}
                  stroke="rgba(0,0,0,0.2)"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                {/* Rung */}
                <line
                  x1={leftRopeX}
                  y1={rungY}
                  x2={rightRopeX}
                  y2={rungY}
                  stroke="#6b6b6b"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </g>
            ))}
          </g>

          {/* Cut point frayed ends - left rope */}
          <g className="rope-cut-point">
            <line x1={leftRopeX - 2} y1={actualCutY} x2={leftRopeX - 4} y2={actualCutY + 8} stroke="#8B6914" strokeWidth="2" strokeLinecap="round" />
            <line x1={leftRopeX} y1={actualCutY} x2={leftRopeX - 1} y2={actualCutY + 10} stroke="#C4A24E" strokeWidth="2" strokeLinecap="round" />
            <line x1={leftRopeX + 2} y1={actualCutY} x2={leftRopeX + 1} y2={actualCutY + 7} stroke="#DDB855" strokeWidth="2" strokeLinecap="round" />
          </g>
          {/* Cut point frayed ends - right rope */}
          <g className="rope-cut-point">
            <line x1={rightRopeX - 2} y1={actualCutY} x2={rightRopeX - 1} y2={actualCutY + 7} stroke="#DDB855" strokeWidth="2" strokeLinecap="round" />
            <line x1={rightRopeX} y1={actualCutY} x2={rightRopeX + 1} y2={actualCutY + 10} stroke="#C4A24E" strokeWidth="2" strokeLinecap="round" />
            <line x1={rightRopeX + 2} y1={actualCutY} x2={rightRopeX + 4} y2={actualCutY + 8} stroke="#8B6914" strokeWidth="2" strokeLinecap="round" />
          </g>

          {/* Lower part of rope (below cut) - falls away and fades */}
          <g className="rope-cut" style={{ transformOrigin: `${x}px ${actualCutY}px` }}>
            {/* Left vertical rope - lower shadow */}
            <line
              x1={leftRopeX + 1}
              y1={actualCutY}
              x2={leftRopeX + 1}
              y2={bottomY}
              stroke="rgba(0,0,0,0.3)"
              strokeWidth={verticalRopeWidth}
              strokeLinecap="round"
            />
            {/* Left vertical rope - lower */}
            <line
              x1={leftRopeX}
              y1={actualCutY}
              x2={leftRopeX}
              y2={bottomY}
              stroke={ropeColorWrong}
              strokeWidth={verticalRopeWidth}
              strokeLinecap="round"
            />
            {/* Right vertical rope - lower shadow */}
            <line
              x1={rightRopeX + 1}
              y1={actualCutY}
              x2={rightRopeX + 1}
              y2={bottomY}
              stroke="rgba(0,0,0,0.3)"
              strokeWidth={verticalRopeWidth}
              strokeLinecap="round"
            />
            {/* Right vertical rope - lower */}
            <line
              x1={rightRopeX}
              y1={actualCutY}
              x2={rightRopeX}
              y2={bottomY}
              stroke={ropeColorWrong}
              strokeWidth={verticalRopeWidth}
              strokeLinecap="round"
            />
            {/* Rope rungs below cut */}
            {rungs.filter(rungY => rungY >= actualCutY).map((rungY, i) => (
              <g key={i}>
                {/* Rung shadow */}
                <line
                  x1={leftRopeX}
                  y1={rungY + 1}
                  x2={rightRopeX}
                  y2={rungY + 1}
                  stroke="rgba(0,0,0,0.2)"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                {/* Rung */}
                <line
                  x1={leftRopeX}
                  y1={rungY}
                  x2={rightRopeX}
                  y2={rungY}
                  stroke="#6b6b6b"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </g>
            ))}
          </g>
        </>
      ) : (
        <>
          {/* Normal rope rendering for correct, poll, or pending states */}
          {/* Left vertical rope - shadow */}
          <line
            x1={leftRopeX + 1}
            y1={topY}
            x2={leftRopeX + 1}
            y2={bottomY}
            stroke="rgba(0,0,0,0.3)"
            strokeWidth={verticalRopeWidth}
            strokeLinecap="round"
          />
          {/* Left vertical rope */}
          <line
            x1={leftRopeX}
            y1={topY}
            x2={leftRopeX}
            y2={bottomY}
            stroke={isCorrect ? ropeColorCorrect : ropeColor}
            strokeWidth={verticalRopeWidth}
            strokeLinecap="round"
          />

          {/* Right vertical rope - shadow */}
          <line
            x1={rightRopeX + 1}
            y1={topY}
            x2={rightRopeX + 1}
            y2={bottomY}
            stroke="rgba(0,0,0,0.3)"
            strokeWidth={verticalRopeWidth}
            strokeLinecap="round"
          />
          {/* Right vertical rope */}
          <line
            x1={rightRopeX}
            y1={topY}
            x2={rightRopeX}
            y2={bottomY}
            stroke={isCorrect ? ropeColorCorrect : ropeColor}
            strokeWidth={verticalRopeWidth}
            strokeLinecap="round"
          />

          {/* Rope rungs (horizontal bars connecting the two vertical ropes) */}
          {rungs.map((rungY, i) => (
            <g key={i}>
              {/* Rung shadow */}
              <line
                x1={leftRopeX}
                y1={rungY + 1}
                x2={rightRopeX}
                y2={rungY + 1}
                stroke="rgba(0,0,0,0.2)"
                strokeWidth="3"
                strokeLinecap="round"
              />
              {/* Rung */}
              <line
                x1={leftRopeX}
                y1={rungY}
                x2={rightRopeX}
                y2={rungY}
                stroke={isCorrect ? "#166534" : "#7a6540"}
                strokeWidth="3"
                strokeLinecap="round"
              />
            </g>
          ))}
        </>
      )}

      {/* Label at top */}
      <g
        transform={`translate(${x}, ${topY - 15})`}
        className={isCorrect ? "rope-label-correct" : ""}
      >
        {/* Label background */}
        <rect
          x="-16"
          y="-14"
          width="32"
          height="24"
          rx="6"
          fill={isCorrect ? "rgba(22, 101, 52, 0.95)" : isWrong ? "rgba(127, 29, 29, 0.9)" : "rgba(30, 41, 59, 0.9)"}
          stroke={isCorrect ? "rgba(74, 222, 128, 0.6)" : isWrong ? "rgba(248, 113, 113, 0.4)" : "rgba(255, 255, 255, 0.3)"}
          strokeWidth="1"
        />
        {/* Checkmark or X indicator */}
        {isCorrect && (
          <text x="0" y="4" textAnchor="middle" fill="#4ade80" fontSize="16" fontWeight="bold">
            ✓
          </text>
        )}
        {isWrong && (
          <text x="0" y="4" textAnchor="middle" fill="#f87171" fontSize="16" fontWeight="bold">
            ✗
          </text>
        )}
        {!isCorrect && !isWrong && (
          <text
            x="0"
            y="2"
            textAnchor="middle"
            fill="white"
            fontSize="14"
            fontWeight="bold"
            fontFamily="system-ui, sans-serif"
          >
            {label}
          </text>
        )}
      </g>

      {/* Answer text tooltip (shown below label) */}
      {answerText && (
        <g transform={`translate(${x}, ${topY - 45})`}>
          <rect
            x={-Math.min(60, answerText.length * 4)}
            y="-12"
            width={Math.min(120, answerText.length * 8)}
            height="20"
            rx="4"
            fill={isCorrect ? "rgba(22, 101, 52, 0.9)" : isWrong ? "rgba(127, 29, 29, 0.85)" : "rgba(15, 23, 42, 0.85)"}
            stroke={isCorrect ? "rgba(74, 222, 128, 0.5)" : isWrong ? "rgba(248, 113, 113, 0.3)" : "rgba(99, 102, 241, 0.4)"}
            strokeWidth="1"
          />
          <text
            x="0"
            y="3"
            textAnchor="middle"
            fill={isCorrect ? "#4ade80" : isWrong ? "#fca5a5" : "#e2e8f0"}
            fontSize="10"
            fontFamily="system-ui, sans-serif"
          >
            {answerText.length > 20 ? answerText.slice(0, 18) + "..." : answerText}
          </text>
        </g>
      )}
    </g>
  );
});

/** State of the climber after reveal */
export type ClimberRevealState = "climbing" | "celebrating" | "falling" | "landed";

/**
 * Player climbing on a rope
 * Rendered as HTML overlay for animation support
 */
export const RopeClimber = memo(function RopeClimber({
  player,
  x,
  y,
  size,
  showName,
  isCurrentPlayer,
  climbOffset,
  revealState = "climbing",
  fallDistance = 0,
  climbDistance = 0,
}: {
  player: RopePlayer;
  x: number;
  y: number;
  size: number;
  showName: boolean;
  isCurrentPlayer: boolean;
  climbOffset: number;
  /** State after reveal */
  revealState?: ClimberRevealState;
  /** Distance to fall (in pixels) for wrong answers */
  fallDistance?: number;
  /** Distance to climb up (in pixels) for correct answers */
  climbDistance?: number;
}) {
  const blobConfig = useMemo(() => generateBlob(player.name), [player.name]);

  // Determine CSS class based on reveal state
  const getRevealClass = () => {
    switch (revealState) {
      case "celebrating":
        return "rope-climber-celebrating";
      case "falling":
        return "rope-climber-falling";
      case "landed":
        return "rope-climber-landed";
      default:
        return "rope-climber";
    }
  };

  // Determine blob state based on reveal state
  const getBlobState = (): "idle" | "climbing" | "falling" | "celebrating" => {
    switch (revealState) {
      case "celebrating":
        return "celebrating";
      case "falling":
      case "landed":
        return "falling";
      default:
        return "climbing";
    }
  };

  // Build filter based on state
  const getFilter = () => {
    if (revealState === "celebrating") {
      return isCurrentPlayer
        ? "drop-shadow(0 0 12px gold) drop-shadow(0 0 20px rgba(16, 185, 129, 0.8))"
        : "drop-shadow(0 0 8px rgba(16, 185, 129, 0.6)) drop-shadow(0 0 16px rgba(16, 185, 129, 0.4))";
    }
    if (revealState === "falling" || revealState === "landed") {
      return "drop-shadow(0 2px 4px rgba(0,0,0,0.5)) grayscale(30%)";
    }
    return isCurrentPlayer
      ? "drop-shadow(0 0 8px gold) drop-shadow(0 0 16px rgba(255,215,0,0.6))"
      : "drop-shadow(0 2px 4px rgba(0,0,0,0.3))";
  };

  // CSS custom properties for animation distances
  const customProperties: React.CSSProperties = {
    "--fall-distance": `${fallDistance}px`,
    "--climb-distance": `${-climbDistance}px`,
  } as React.CSSProperties;

  return (
    <div
      className={getRevealClass()}
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2 + climbOffset,
        zIndex: isCurrentPlayer ? 100 : revealState === "celebrating" ? 50 : 10,
        filter: getFilter(),
        pointerEvents: "none",
        ...customProperties,
      }}
    >
      <Blob config={blobConfig} size={size} state={getBlobState()} />
      {showName && (
        <div
          style={{
            position: "absolute",
            top: size + 2,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: "9px",
            fontWeight: isCurrentPlayer ? "bold" : "normal",
            color: revealState === "celebrating"
              ? "#4ade80"
              : revealState === "falling" || revealState === "landed"
              ? "#fca5a5"
              : isCurrentPlayer
              ? "#FFD700"
              : "#fff",
            whiteSpace: "nowrap",
            textShadow: "0 1px 3px rgba(0,0,0,0.8)",
            background: revealState === "celebrating"
              ? "rgba(22, 101, 52, 0.7)"
              : revealState === "falling" || revealState === "landed"
              ? "rgba(127, 29, 29, 0.6)"
              : "rgba(0,0,0,0.5)",
            padding: "1px 4px",
            borderRadius: "3px",
            maxWidth: size * 3,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {player.name}
        </div>
      )}
    </div>
  );
});
