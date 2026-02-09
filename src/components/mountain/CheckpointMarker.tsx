import type { MountainMode } from "./types";

/**
 * Checkpoint marker with elevation labels on both sides
 */
export function CheckpointMarker({
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
