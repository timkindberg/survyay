/**
 * Blob Creature Avatar Generator
 *
 * Generates deterministic blob creature configs from player names.
 * Same name = same blob every time.
 */

export interface BlobConfig {
  name: string;
  body: {
    shape: BlobShape;
    color: string;
    highlightColor: string;
  };
  eyes: {
    style: EyeStyle;
    color: string;
  };
  features: {
    rosyCheeks: boolean;
    hair: HairStyle;
  };
  accessory: Accessory;
  seed: number;
}

export type BlobShape = "round" | "tall" | "wide" | "bean" | "pear" | "square" | "ghost" | "droplet";
export type EyeStyle = "dots" | "wide" | "sleepy" | "excited" | "angry" | "wink" | "dizzy" | "hearts" | "side-eye" | "sparkle";
export type HairStyle = "none" | "tuft" | "spiky" | "curly" | "swoosh" | "ponytail" | "single-curl";
export type Accessory = "none" | "hat" | "bow" | "glasses" | "bandana" | "monocle" | "bowtie" | "crown" | "headphones" | "flower";

// Color palettes - each blob gets one palette
const PALETTES = [
  { main: "#FF6B6B", highlight: "#FF8E8E" }, // Coral
  { main: "#4ECDC4", highlight: "#7EDDD6" }, // Teal
  { main: "#45B7D1", highlight: "#6FC9DE" }, // Sky
  { main: "#96CEB4", highlight: "#B3DBCA" }, // Sage
  { main: "#FFEAA7", highlight: "#FFF0C4" }, // Butter
  { main: "#DDA0DD", highlight: "#E8BFE8" }, // Plum
  { main: "#98D8C8", highlight: "#B5E4D8" }, // Mint
  { main: "#F7DC6F", highlight: "#F9E79F" }, // Sunshine
  { main: "#BB8FCE", highlight: "#D2B4DE" }, // Lavender
  { main: "#85C1E9", highlight: "#A9D4F0" }, // Periwinkle
  { main: "#F8B500", highlight: "#FACF5A" }, // Mango
  { main: "#FF7675", highlight: "#FF9494" }, // Salmon
  { main: "#74B9FF", highlight: "#93C9FF" }, // Cornflower
  { main: "#A29BFE", highlight: "#B8B3FE" }, // Iris
  { main: "#FD79A8", highlight: "#FD9BBD" }, // Pink
  { main: "#00CEC9", highlight: "#33D9D5" }, // Cyan
  { main: "#E17055", highlight: "#E8907A" }, // Terracotta
  { main: "#00B894", highlight: "#33C9AB" }, // Emerald
  { main: "#FDCB6E", highlight: "#FDD98B" }, // Honey
  { main: "#6C5CE7", highlight: "#8A7EEB" }, // Violet
];

const BODY_SHAPES: BlobShape[] = ["round", "tall", "wide", "bean", "pear", "square", "ghost", "droplet"];
const EYE_STYLES: EyeStyle[] = ["dots", "wide", "sleepy", "excited", "angry", "wink", "dizzy", "hearts", "side-eye", "sparkle"];
const HAIR_STYLES: HairStyle[] = ["none", "none", "none", "tuft", "spiky", "curly", "swoosh", "ponytail", "single-curl"]; // weighted toward none
const ACCESSORIES: Accessory[] = [
  "none", "none", "none", "none", // 40% none
  "hat", "bow", "glasses", "bandana", "monocle", "bowtie", "crown", "headphones", "flower"
];

/**
 * Simple string hash function (djb2 variant)
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

/**
 * Seeded random number generator (Mulberry32)
 */
function seededRandom(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick a random item from an array using seeded random
 */
function pick<T>(arr: readonly T[], random: () => number): T {
  return arr[Math.floor(random() * arr.length)]!;
}

/**
 * Generate a blob config from a player name
 */
export function generateBlob(name: string): BlobConfig {
  const seed = hashString(name.toLowerCase().trim());
  const random = seededRandom(seed);

  const palette = pick(PALETTES, random);
  const bodyShape = pick(BODY_SHAPES, random);
  const eyeStyle = pick(EYE_STYLES, random);
  const hairStyle = pick(HAIR_STYLES, random);
  const accessory = pick(ACCESSORIES, random);

  // Eye color - always dark or contrasting, never matches body
  const eyeColors = ["#2C3E50", "#1A1A2E", "#34495E", "#2D3436", "#5D4E60"];
  const eyeColor = pick(eyeColors, random);

  // Rosy cheeks - 30% chance
  const rosyCheeks = random() < 0.3;

  return {
    name,
    body: {
      shape: bodyShape,
      color: palette.main,
      highlightColor: palette.highlight,
    },
    eyes: {
      style: eyeStyle,
      color: eyeColor,
    },
    features: {
      rosyCheeks,
      hair: hairStyle,
    },
    accessory,
    seed,
  };
}
