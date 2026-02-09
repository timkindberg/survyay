import { memo, useMemo } from "react";
import { Blob } from "../Blob";
import { generateBlob } from "../../lib/blobGenerator";
import type { MountainPlayer } from "./types";

/**
 * Player blob positioned on the mountain (memoized for performance)
 */
export const MemoizedPlayerBlob = memo(function PlayerBlob({
  player,
  x,
  y,
  isCurrentPlayer,
  size,
  showName,
  nameSize,
}: {
  player: MountainPlayer;
  x: number;
  y: number;
  isCurrentPlayer: boolean;
  size: number;
  showName: boolean;
  nameSize: number;
}) {
  const blobConfig = useMemo(() => generateBlob(player.name), [player.name]);

  // Highlight circle size is slightly larger than the blob
  const highlightSize = size * 1.4;

  return (
    <div
      className={`mountain-player ${isCurrentPlayer ? "current-player-highlight" : ""}`}
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size,
        transition: "left 0.3s ease-out, top 0.5s ease-out",
        zIndex: isCurrentPlayer ? 100 : 1,
        filter: isCurrentPlayer ? "drop-shadow(0 0 6px gold) drop-shadow(0 0 12px rgba(255,215,0,0.5))" : "none",
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
      {/* Name label - optimized for dark rock background */}
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
          {player.name}
        </div>
      )}
    </div>
  );
});
