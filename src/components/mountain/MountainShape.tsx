import { SUMMIT } from "../../../lib/elevation";
import type { MountainMode } from "./types";
import { seededRandom, generateJaggedEdge } from "./terrain";

/**
 * Mountain shape - full width with decorative peak tip and jagged rocky edges
 */
export function MountainShape({
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
