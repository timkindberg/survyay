import type { BlobConfig, BlobShape, EyeStyle, HairStyle, Accessory } from "../lib/blobGenerator";
import "./Blob.css";

interface BlobProps {
  config: BlobConfig;
  size?: number;
  state?: "idle" | "climbing" | "falling" | "celebrating";
  className?: string;
}

/**
 * SVG Blob Creature Component
 */
export function Blob({ config, size = 60, state = "idle", className = "" }: BlobProps) {
  const { body, eyes, features, accessory } = config;
  const bodyPath = getBodyPath(body.shape);
  const eyePositions = getEyePositions(body.shape);
  const topY = getTopY(body.shape);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={`blob blob--${state} ${className}`}
      style={{ animation: getAnimation(state) }}
    >
      {/* Shadow */}
      <ellipse cx="50" cy="92" rx="25" ry="6" fill="rgba(0,0,0,0.15)" />

      {/* Body */}
      <path d={bodyPath} fill={body.color} />

      {/* Highlight */}
      <ellipse
        cx={body.shape === "wide" ? 35 : 40}
        cy={body.shape === "tall" ? 28 : 35}
        rx="12"
        ry="8"
        fill={body.highlightColor}
        opacity="0.6"
      />

      {/* Hair (behind head, rendered first) */}
      <Hair style={features.hair} bodyShape={body.shape} color={eyes.color} topY={topY} />

      {/* Rosy Cheeks */}
      {features.rosyCheeks && (
        <RosyCheeks bodyShape={body.shape} eyePositions={eyePositions} />
      )}

      {/* Eyes */}
      <Eyes style={eyes.style} color={eyes.color} positions={eyePositions} />

      {/* Accessory (on top) */}
      <AccessoryComponent type={accessory} bodyShape={body.shape} topY={topY} eyePositions={eyePositions} />
    </svg>
  );
}

function getBodyPath(shape: BlobShape): string {
  switch (shape) {
    case "round":
      return "M50 15 C80 15 90 40 90 55 C90 75 75 88 50 88 C25 88 10 75 10 55 C10 40 20 15 50 15";
    case "tall":
      return "M50 8 C70 8 78 25 78 45 C78 70 68 92 50 92 C32 92 22 70 22 45 C22 25 30 8 50 8";
    case "wide":
      return "M50 25 C85 25 95 45 95 58 C95 75 80 85 50 85 C20 85 5 75 5 58 C5 45 15 25 50 25";
    case "bean":
      return "M45 12 C70 12 85 30 82 55 C80 75 65 90 45 88 C25 86 12 70 15 50 C18 30 25 12 45 12";
    case "pear":
      return "M50 10 C65 10 72 20 72 35 C72 50 80 70 80 78 C80 90 65 92 50 92 C35 92 20 90 20 78 C20 70 28 50 28 35 C28 20 35 10 50 10";
    case "square":
      return "M25 20 C25 15 75 15 75 20 L78 75 C78 88 22 88 22 75 L25 20";
    case "ghost":
      return "M50 10 C75 10 85 30 85 50 L85 80 L75 75 L65 85 L55 75 L45 85 L35 75 L25 85 L15 75 L15 50 C15 30 25 10 50 10";
    case "droplet":
      return "M50 8 C55 8 60 15 65 30 C75 55 80 75 70 85 C60 92 40 92 30 85 C20 75 25 55 35 30 C40 15 45 8 50 8";
    default:
      return "M50 15 C80 15 90 40 90 55 C90 75 75 88 50 88 C25 88 10 75 10 55 C10 40 20 15 50 15";
  }
}

function getEyePositions(shape: BlobShape): { left: [number, number]; right: [number, number] } {
  switch (shape) {
    case "round": return { left: [35, 45], right: [65, 45] };
    case "tall": return { left: [38, 38], right: [62, 38] };
    case "wide": return { left: [32, 50], right: [68, 50] };
    case "bean": return { left: [32, 42], right: [58, 40] };
    case "pear": return { left: [38, 32], right: [62, 32] };
    case "square": return { left: [35, 42], right: [65, 42] };
    case "ghost": return { left: [35, 38], right: [65, 38] };
    case "droplet": return { left: [40, 45], right: [60, 45] };
    default: return { left: [35, 45], right: [65, 45] };
  }
}

function getTopY(shape: BlobShape): number {
  switch (shape) {
    case "tall": return 8;
    case "wide": return 25;
    case "pear": return 10;
    case "droplet": return 8;
    case "ghost": return 10;
    default: return 15;
  }
}

// ============ EYES ============

interface EyesProps {
  style: EyeStyle;
  color: string;
  positions: { left: [number, number]; right: [number, number] };
}

function Eyes({ style, color, positions }: EyesProps) {
  const [lx, ly] = positions.left;
  const [rx, ry] = positions.right;

  switch (style) {
    case "dots":
      return (
        <>
          <circle cx={lx} cy={ly} r="5" fill={color} />
          <circle cx={rx} cy={ry} r="5" fill={color} />
        </>
      );

    case "wide":
      return (
        <>
          <ellipse cx={lx} cy={ly} rx="8" ry="10" fill="white" stroke={color} strokeWidth="2" />
          <circle cx={lx + 2} cy={ly} r="4" fill={color} />
          <ellipse cx={rx} cy={ry} rx="8" ry="10" fill="white" stroke={color} strokeWidth="2" />
          <circle cx={rx + 2} cy={ry} r="4" fill={color} />
        </>
      );

    case "sleepy":
      return (
        <>
          <path d={`M${lx - 7} ${ly} Q${lx} ${ly - 5} ${lx + 7} ${ly}`} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
          <path d={`M${rx - 7} ${ry} Q${rx} ${ry - 5} ${rx + 7} ${ry}`} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
        </>
      );

    case "excited":
      return (
        <>
          <ellipse cx={lx} cy={ly} rx="7" ry="9" fill="white" stroke={color} strokeWidth="2" />
          <circle cx={lx} cy={ly - 1} r="5" fill={color} />
          <circle cx={lx + 1} cy={ly - 2} r="2" fill="white" />
          <ellipse cx={rx} cy={ry} rx="7" ry="9" fill="white" stroke={color} strokeWidth="2" />
          <circle cx={rx} cy={ry - 1} r="5" fill={color} />
          <circle cx={rx + 1} cy={ry - 2} r="2" fill="white" />
        </>
      );

    case "angry":
      return (
        <>
          <line x1={lx - 8} y1={ly - 8} x2={lx + 4} y2={ly - 4} stroke={color} strokeWidth="3" strokeLinecap="round" />
          <circle cx={lx} cy={ly + 2} r="5" fill={color} />
          <line x1={rx + 8} y1={ry - 8} x2={rx - 4} y2={ry - 4} stroke={color} strokeWidth="3" strokeLinecap="round" />
          <circle cx={rx} cy={ry + 2} r="5" fill={color} />
        </>
      );

    case "wink":
      return (
        <>
          <ellipse cx={lx} cy={ly} rx="7" ry="9" fill="white" stroke={color} strokeWidth="2" />
          <circle cx={lx + 1} cy={ly} r="4" fill={color} />
          <path d={`M${rx - 7} ${ry} Q${rx} ${ry - 6} ${rx + 7} ${ry}`} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
        </>
      );

    case "dizzy":
      return (
        <>
          <g transform={`translate(${lx}, ${ly})`}>
            <line x1="-5" y1="-5" x2="5" y2="5" stroke={color} strokeWidth="3" strokeLinecap="round" />
            <line x1="5" y1="-5" x2="-5" y2="5" stroke={color} strokeWidth="3" strokeLinecap="round" />
          </g>
          <g transform={`translate(${rx}, ${ry})`}>
            <line x1="-5" y1="-5" x2="5" y2="5" stroke={color} strokeWidth="3" strokeLinecap="round" />
            <line x1="5" y1="-5" x2="-5" y2="5" stroke={color} strokeWidth="3" strokeLinecap="round" />
          </g>
        </>
      );

    case "hearts":
      return (
        <>
          <path d={`M${lx} ${ly + 3} C${lx - 5} ${ly - 5} ${lx - 8} ${ly + 2} ${lx} ${ly + 8} C${lx + 8} ${ly + 2} ${lx + 5} ${ly - 5} ${lx} ${ly + 3}`} fill="#E74C3C" />
          <path d={`M${rx} ${ry + 3} C${rx - 5} ${ry - 5} ${rx - 8} ${ry + 2} ${rx} ${ry + 8} C${rx + 8} ${ry + 2} ${rx + 5} ${ry - 5} ${rx} ${ry + 3}`} fill="#E74C3C" />
        </>
      );

    case "side-eye":
      return (
        <>
          <ellipse cx={lx} cy={ly} rx="8" ry="8" fill="white" stroke={color} strokeWidth="2" />
          <circle cx={lx + 4} cy={ly} r="4" fill={color} />
          <ellipse cx={rx} cy={ry} rx="8" ry="8" fill="white" stroke={color} strokeWidth="2" />
          <circle cx={rx + 4} cy={ry} r="4" fill={color} />
        </>
      );

    case "sparkle":
      return (
        <>
          <ellipse cx={lx} cy={ly} rx="8" ry="9" fill="white" stroke={color} strokeWidth="2" />
          <circle cx={lx} cy={ly} r="5" fill={color} />
          <circle cx={lx - 2} cy={ly - 3} r="2" fill="white" />
          <circle cx={lx + 3} cy={ly - 1} r="1" fill="white" />
          <ellipse cx={rx} cy={ry} rx="8" ry="9" fill="white" stroke={color} strokeWidth="2" />
          <circle cx={rx} cy={ry} r="5" fill={color} />
          <circle cx={rx - 2} cy={ry - 3} r="2" fill="white" />
          <circle cx={rx + 3} cy={ry - 1} r="1" fill="white" />
        </>
      );

    default:
      return null;
  }
}

// ============ ROSY CHEEKS ============

interface RosyCheeksProps {
  bodyShape: BlobShape;
  eyePositions: { left: [number, number]; right: [number, number] };
}

function RosyCheeks({ eyePositions }: RosyCheeksProps) {
  const [lx, ly] = eyePositions.left;
  const [rx, ry] = eyePositions.right;

  return (
    <>
      <ellipse cx={lx - 8} cy={ly + 12} rx="6" ry="4" fill="#FFB6C1" opacity="0.6" />
      <ellipse cx={rx + 8} cy={ry + 12} rx="6" ry="4" fill="#FFB6C1" opacity="0.6" />
    </>
  );
}

// ============ HAIR ============

interface HairProps {
  style: HairStyle;
  bodyShape: BlobShape;
  color: string;
  topY: number;
}

function Hair({ style, bodyShape, color, topY }: HairProps) {
  const dims = getShapeDimensions(bodyShape);
  const centerX = dims.centerX;
  const hw = dims.headWidth;
  const scale = dims.width;

  switch (style) {
    case "tuft":
      return (
        <g>
          <ellipse cx={centerX} cy={topY - 2} rx={6 * scale} ry={5 * scale} fill={color} />
          <ellipse cx={centerX - 4 * scale} cy={topY} rx={4 * scale} ry={3 * scale} fill={color} />
          <ellipse cx={centerX + 4 * scale} cy={topY} rx={4 * scale} ry={3 * scale} fill={color} />
        </g>
      );

    case "spiky": {
      const spikeOffsets = [-hw * 0.4, -hw * 0.2, 0, hw * 0.2, hw * 0.4];
      return (
        <g>
          {spikeOffsets.map((offset, i) => (
            <polygon
              key={i}
              points={`${centerX + offset - 3},${topY + 4} ${centerX + offset},${topY - 6 - (i % 2) * 3} ${centerX + offset + 3},${topY + 4}`}
              fill={color}
            />
          ))}
        </g>
      );
    }

    case "curly": {
      const curlOffsets = [-hw * 0.35, -hw * 0.12, hw * 0.12, hw * 0.35];
      return (
        <g>
          {curlOffsets.map((offset, i) => (
            <circle key={i} cx={centerX + offset} cy={topY + (i % 2) * 2} r={5 * scale} fill={color} />
          ))}
        </g>
      );
    }

    case "swoosh": {
      const sw = hw * 0.5;
      return (
        <path
          d={`M${centerX - sw * 0.8} ${topY + 6} Q${centerX - sw * 0.3} ${topY - 8} ${centerX + sw} ${topY - 4} Q${centerX + sw * 0.5} ${topY + 4} ${centerX} ${topY + 4} Q${centerX - sw * 0.5} ${topY + 4} ${centerX - sw * 0.8} ${topY + 6}`}
          fill={color}
        />
      );
    }

    case "ponytail": {
      // Hair tuft on top with a small ponytail bump to the side
      const tuftW = hw * 0.3;
      return (
        <g>
          {/* Main hair tuft */}
          <ellipse cx={centerX - tuftW * 0.3} cy={topY + 2} rx={tuftW} ry={tuftW * 0.6} fill={color} />
          <ellipse cx={centerX + tuftW * 0.3} cy={topY + 1} rx={tuftW * 0.8} ry={tuftW * 0.5} fill={color} />
          {/* Small ponytail/bun to the side */}
          <circle cx={centerX + hw * 0.45} cy={topY + 6} r={tuftW * 0.5} fill={color} />
          {/* Hair tie */}
          <ellipse cx={centerX + hw * 0.35} cy={topY + 5} rx={2} ry={3} fill="#E91E63" />
        </g>
      );
    }

    case "single-curl": {
      // One cute curl on top of the head
      const curlSize = hw * 0.2;
      return (
        <g>
          {/* Base of curl attached to head */}
          <ellipse cx={centerX} cy={topY + 2} rx={curlSize * 0.6} ry={curlSize * 0.4} fill={color} />
          {/* The curl spiral */}
          <path
            d={`M${centerX} ${topY + 1}
               Q${centerX + curlSize * 0.8} ${topY - curlSize * 0.5} ${centerX + curlSize * 0.3} ${topY - curlSize * 1.2}
               Q${centerX - curlSize * 0.5} ${topY - curlSize * 1.5} ${centerX - curlSize * 0.3} ${topY - curlSize * 0.6}
               Q${centerX} ${topY - curlSize * 0.2} ${centerX + curlSize * 0.2} ${topY - curlSize * 0.5}`}
            fill="none"
            stroke={color}
            strokeWidth={curlSize * 0.4}
            strokeLinecap="round"
          />
        </g>
      );
    }

    default:
      return null;
  }
}

// ============ ACCESSORIES ============

// Get shape-specific dimensions for accessories
function getShapeDimensions(shape: BlobShape): { width: number; headWidth: number; centerX: number } {
  switch (shape) {
    case "tall": return { width: 0.7, headWidth: 24, centerX: 50 };
    case "wide": return { width: 1.2, headWidth: 40, centerX: 50 };
    case "pear": return { width: 0.65, headWidth: 22, centerX: 50 };
    case "droplet": return { width: 0.6, headWidth: 20, centerX: 50 };
    case "ghost": return { width: 0.9, headWidth: 32, centerX: 50 };
    case "bean": return { width: 0.85, headWidth: 30, centerX: 45 };
    case "square": return { width: 0.85, headWidth: 30, centerX: 50 };
    case "round": return { width: 1.0, headWidth: 35, centerX: 50 };
    default: return { width: 1.0, headWidth: 35, centerX: 50 };
  }
}

// Get the actual body edge positions at a given Y coordinate for each shape
// This is used to position accessories like headphones and bandanas that need to wrap around the body
function getBodyEdges(shape: BlobShape, y: number): { left: number; right: number } {
  switch (shape) {
    case "wide": {
      // Body goes from x=5 to x=95, widest in the middle (y~58)
      // At top (y=25) it's narrower, at y=50 it's widest
      const t = Math.max(0, Math.min(1, (y - 25) / 35)); // 0 at y=25, 1 at y=60
      const halfWidth = 30 + t * 15; // 30 at top, up to 45 at widest
      return { left: 50 - halfWidth, right: 50 + halfWidth };
    }
    case "ghost": {
      // Body from x=15 to x=85
      const t = Math.max(0, Math.min(1, (y - 10) / 40)); // 0 at top, 1 at y=50
      const halfWidth = 20 + t * 15; // starts narrow, gets wider
      return { left: 50 - halfWidth, right: 50 + halfWidth };
    }
    case "round": {
      // Body from x=10 to x=90
      const halfWidth = 35;
      return { left: 50 - halfWidth, right: 50 + halfWidth };
    }
    case "tall": {
      // Body from x=22 to x=78
      const halfWidth = 26;
      return { left: 50 - halfWidth, right: 50 + halfWidth };
    }
    case "bean": {
      // Asymmetric - centered around x=45
      return { left: 18, right: 78 };
    }
    case "pear": {
      // Narrow at top, wide at bottom
      const t = Math.max(0, Math.min(1, (y - 10) / 60));
      const halfWidth = 20 + t * 10;
      return { left: 50 - halfWidth, right: 50 + halfWidth };
    }
    case "square": {
      // Body from x=22 to x=78
      return { left: 24, right: 76 };
    }
    case "droplet": {
      // Narrow at top, wider at bottom
      const t = Math.max(0, Math.min(1, (y - 8) / 60));
      const halfWidth = 12 + t * 18;
      return { left: 50 - halfWidth, right: 50 + halfWidth };
    }
    default:
      return { left: 20, right: 80 };
  }
}

interface AccessoryProps {
  type: Accessory;
  bodyShape: BlobShape;
  topY: number;
  eyePositions: { left: [number, number]; right: [number, number] };
}

function AccessoryComponent({ type, bodyShape, topY, eyePositions }: AccessoryProps) {
  const dims = getShapeDimensions(bodyShape);
  const centerX = dims.centerX;
  const w = dims.width; // width multiplier
  const hw = dims.headWidth; // head width for accessories
  const [lx, ly] = eyePositions.left;
  const [rx, ry] = eyePositions.right;

  switch (type) {
    case "hat":
      return (
        <g>
          <rect x={centerX - hw * 0.55} y={topY - 3} width={hw * 1.1} height="7" rx="2" fill="#2C3E50" />
          <rect x={centerX - hw * 0.35} y={topY - 18} width={hw * 0.7} height="18" rx="3" fill="#2C3E50" />
        </g>
      );

    case "bow":
      return (
        <g transform={`translate(${centerX + hw * 0.5}, ${topY + 8})`}>
          <path d={`M-8 0 Q-4 -5 0 0 Q4 -5 8 0 Q4 5 0 0 Q-4 5 -8 0`} fill="#FF6B9D" />
          <circle cx="0" cy="0" r="2.5" fill="#D63384" />
        </g>
      );

    case "glasses": {
      const glassR = Math.min(10, (rx - lx) * 0.28);
      return (
        <g>
          <circle cx={lx} cy={ly} r={glassR} fill="none" stroke="#2C3E50" strokeWidth="2" />
          <circle cx={rx} cy={ry} r={glassR} fill="none" stroke="#2C3E50" strokeWidth="2" />
          <line x1={lx + glassR} y1={ly} x2={rx - glassR} y2={ry} stroke="#2C3E50" strokeWidth="2" />
        </g>
      );
    }

    case "bandana": {
      // Use actual body edges at the bandana Y position
      const bandanaY = topY + 12;
      const edges = getBodyEdges(bodyShape, bandanaY);
      // Inset a bit from the edges so it looks like it's wrapping around
      const leftX = edges.left + 4;
      const rightX = edges.right - 4;
      return (
        <g>
          <path
            d={`M${leftX} ${bandanaY} Q${centerX} ${topY + 4} ${rightX} ${bandanaY}`}
            fill="none"
            stroke="#E74C3C"
            strokeWidth="5"
            strokeLinecap="round"
          />
          {/* Knot tails on the right side */}
          <path d={`M${rightX - 3} ${bandanaY - 2} L${rightX + 5} ${bandanaY + 6} L${rightX + 2} ${bandanaY + 11}`} fill="#E74C3C" />
        </g>
      );
    }

    case "monocle": {
      const monocleR = Math.min(11, (rx - lx) * 0.3);
      return (
        <g>
          <circle cx={rx} cy={ry} r={monocleR} fill="none" stroke="#C9A227" strokeWidth="2" />
          <line x1={rx} y1={ry + monocleR} x2={rx + 4} y2={ry + 30} stroke="#C9A227" strokeWidth="1.5" />
        </g>
      );
    }

    case "bowtie": {
      const bty = bodyShape === "tall" ? 70 : bodyShape === "pear" ? 75 : bodyShape === "wide" ? 72 : bodyShape === "droplet" ? 72 : 68;
      const btw = 10 * w;
      return (
        <g transform={`translate(${centerX}, ${bty})`}>
          <path d={`M-2 -2 L${-btw} -5 L${-btw} 5 L-2 2 Z`} fill="#E74C3C" />
          <path d={`M2 -2 L${btw} -5 L${btw} 5 L2 2 Z`} fill="#E74C3C" />
          <rect x="-3" y="-3" width="6" height="6" rx="1" fill="#C0392B" />
        </g>
      );
    }

    case "crown": {
      const cw = hw * 0.5; // crown half-width
      return (
        <g>
          <path
            d={`M${centerX - cw} ${topY + 4} L${centerX - cw * 0.8} ${topY - 6} L${centerX - cw * 0.4} ${topY} L${centerX} ${topY - 10} L${centerX + cw * 0.4} ${topY} L${centerX + cw * 0.8} ${topY - 6} L${centerX + cw} ${topY + 4} Z`}
            fill="#F1C40F"
            stroke="#D4AC0D"
            strokeWidth="1"
          />
          <circle cx={centerX - cw * 0.4} cy={topY - 1} r="1.5" fill="#E74C3C" />
          <circle cx={centerX} cy={topY - 5} r="1.5" fill="#3498DB" />
          <circle cx={centerX + cw * 0.4} cy={topY - 1} r="1.5" fill="#2ECC71" />
        </g>
      );
    }

    case "headphones": {
      // Position ear cups at the actual body edges at eye level
      const edges = getBodyEdges(bodyShape, ly);
      const earSize = Math.min(12, hw * 0.32);
      const bandY = topY - 4;
      // Ear cups must be outside BOTH the body edges AND the eyes
      // Use whichever puts the cups further out, with generous padding from eyes
      const leftEdge = Math.min(edges.left, lx - 12); // 12px padding from eye
      const rightEdge = Math.max(edges.right, rx + 12);
      const leftCupX = leftEdge - 2;
      const rightCupX = rightEdge + 2;
      return (
        <g>
          {/* Headband - arcs over the top of the head */}
          <path
            d={`M${leftCupX + earSize * 0.5} ${ly} Q${leftCupX} ${bandY} ${centerX} ${bandY - 2} Q${rightCupX} ${bandY} ${rightCupX - earSize * 0.5} ${ry}`}
            fill="none"
            stroke="#2C3E50"
            strokeWidth="3"
          />
          {/* Left ear cup - outside left eye/body edge */}
          <rect x={leftCupX} y={ly - earSize * 0.6} width={earSize} height={earSize * 1.5} rx="3" fill="#2C3E50" />
          {/* Right ear cup - outside right eye/body edge */}
          <rect x={rightCupX - earSize} y={ry - earSize * 0.6} width={earSize} height={earSize * 1.5} rx="3" fill="#2C3E50" />
        </g>
      );
    }

    case "flower": {
      const flowerX = centerX + hw * 0.55;
      return (
        <g transform={`translate(${flowerX}, ${topY + 6})`}>
          {[0, 60, 120, 180, 240, 300].map((angle) => (
            <ellipse
              key={angle}
              cx={Math.cos((angle * Math.PI) / 180) * 5}
              cy={Math.sin((angle * Math.PI) / 180) * 5}
              rx="4"
              ry="4"
              fill="#FF69B4"
            />
          ))}
          <circle cx="0" cy="0" r="3" fill="#FFD700" />
        </g>
      );
    }

    default:
      return null;
  }
}

function getAnimation(state: BlobProps["state"]): string {
  switch (state) {
    case "idle": return "blob-idle 2s ease-in-out infinite";
    case "climbing": return "blob-climb 0.3s ease-in-out infinite";
    case "falling": return "blob-fall 0.5s ease-in";
    case "celebrating": return "blob-celebrate 0.4s ease-in-out infinite";
    default: return "none";
  }
}
