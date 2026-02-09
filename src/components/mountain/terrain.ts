/**
 * Seeded random number generator for deterministic "randomness"
 * Uses a simple LCG (Linear Congruential Generator)
 */
export function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/**
 * Generate jagged edge points with natural rocky variation
 */
export function generateJaggedEdge(
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
 * Simple text wrapping helper for SVG text elements
 */
export function wrapText(text: string, charsPerLine: number): string[] {
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
