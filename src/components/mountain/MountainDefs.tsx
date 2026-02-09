import type { MountainMode } from "./types";

/**
 * SVG <defs> block for mountain gradients, patterns, and filters.
 * Extracted to keep the main Mountain SVG readable.
 */
export function MountainDefs({ mode }: { mode: MountainMode }) {
  return (
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
  );
}
