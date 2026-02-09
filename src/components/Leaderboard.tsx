import { Blob } from "./Blob";
import { generateBlob } from "../lib/blobGenerator";
import { SUMMIT } from "../../lib/elevation";
import "./Leaderboard.css";

interface LeaderboardPlayer {
  _id: string;
  name: string;
  elevation: number;
  summitPlace?: number;
  summitElevation?: number;
}

interface LeaderboardProps {
  players: LeaderboardPlayer[];
  maxDisplay?: number;
  currentPlayerId?: string;
  compact?: boolean;
  className?: string;
}

/**
 * Leaderboard Component
 *
 * Shows top players sorted by elevation with blob avatars.
 * Highlights current player if provided.
 * Shows special styling for top 3 (gold/silver/bronze).
 */
export function Leaderboard({
  players,
  maxDisplay = 10,
  currentPlayerId,
  compact = false,
  className = "",
}: LeaderboardProps) {
  // Sort players by elevation descending
  const sortedPlayers = [...players].sort((a, b) => b.elevation - a.elevation);

  // Get top N players
  const topPlayers = sortedPlayers.slice(0, maxDisplay);

  // Check if current player is in top N
  const currentPlayerInTop = currentPlayerId
    ? topPlayers.some((p) => p._id === currentPlayerId)
    : true;

  // Find current player's data and rank if not in top
  const currentPlayerData = currentPlayerId
    ? sortedPlayers.find((p) => p._id === currentPlayerId)
    : null;
  const currentPlayerRank = currentPlayerId
    ? sortedPlayers.findIndex((p) => p._id === currentPlayerId) + 1
    : 0;

  if (players.length === 0) {
    return (
      <div className={`leaderboard leaderboard-empty ${className}`}>
        <p>No players yet</p>
      </div>
    );
  }

  return (
    <div className={`leaderboard ${compact ? "leaderboard-compact" : ""} ${className}`}>
      <ol className="leaderboard-list">
        {topPlayers.map((player, index) => (
          <LeaderboardRow
            key={player._id}
            player={player}
            rank={index + 1}
            isCurrentPlayer={player._id === currentPlayerId}
            compact={compact}
          />
        ))}
      </ol>

      {/* Show current player at bottom if not in top N */}
      {!currentPlayerInTop && currentPlayerData && (
        <>
          <div className="leaderboard-separator">
            <span>...</span>
          </div>
          <div className="leaderboard-current-player">
            <LeaderboardRow
              player={currentPlayerData}
              rank={currentPlayerRank}
              isCurrentPlayer={true}
              compact={compact}
            />
          </div>
        </>
      )}
    </div>
  );
}

interface LeaderboardRowProps {
  player: LeaderboardPlayer;
  rank: number;
  isCurrentPlayer: boolean;
  compact: boolean;
}

/**
 * Format elevation display, showing bonus elevation for summit players.
 */
function formatElevation(elevation: number): React.ReactNode {
  if (elevation <= SUMMIT) {
    return <>{elevation}m</>;
  }
  const bonus = elevation - SUMMIT;
  return (
    <>
      {SUMMIT}m <span className="bonus-elevation">+{bonus}m!</span>
    </>
  );
}

function LeaderboardRow({ player, rank, isCurrentPlayer, compact }: LeaderboardRowProps) {
  const blobConfig = generateBlob(player.name);
  const atSummit = player.elevation >= SUMMIT;

  const rankClass =
    rank === 1 ? "rank-1" : rank === 2 ? "rank-2" : rank === 3 ? "rank-3" : "";

  return (
    <li
      className={`leaderboard-row ${rankClass} ${isCurrentPlayer ? "current-player" : ""} ${atSummit ? "at-summit" : ""}`}
    >
      <span className="leaderboard-rank">{rank}</span>
      <div className="leaderboard-avatar">
        <Blob config={blobConfig} size={compact ? 32 : 40} state="idle" />
      </div>
      <span className="leaderboard-name">{player.name}</span>
      <span className="leaderboard-elevation">
        {formatElevation(player.elevation)}
        {atSummit && player.summitPlace && (
          <span className="summit-badge">{getOrdinal(player.summitPlace)} to Summit!</span>
        )}
        {atSummit && !player.summitPlace && <span className="summit-badge">Summit!</span>}
      </span>
    </li>
  );
}

/**
 * Convert number to ordinal string (1st, 2nd, 3rd, etc.)
 */
function getOrdinal(n: number): string {
  const s = ["th", "st", "nd", "rd"] as const;
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}
