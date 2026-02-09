import { SUMMIT } from "../../../lib/elevation";
import type { MountainMode } from "./types";
import { seededRandom } from "./terrain";

/**
 * Surface details - simplified, cohesive rock face with subtle texture
 *
 * Design approach (Celeste/Alto's Adventure inspired):
 * - NO floating snow patches - snow only at summit cap
 * - NO geometric rock slabs - just subtle cracks/fissures
 * - Subtle diagonal striations as gentle texture, not bold lines
 * - Single unified rock face feel
 */
export function MountainDetails({
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
