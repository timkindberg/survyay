import { useState, useCallback } from "react";
import { Blob } from "./Blob";
import { generateBlob } from "../lib/blobGenerator";
import { SUMMIT } from "../../lib/elevation";

interface ShareResultsProps {
  playerName: string;
  elevation: number;
  rank: number | null;
  totalPlayers: number;
}

/**
 * Convert number to ordinal string (1st, 2nd, 3rd, etc.)
 */
function getOrdinal(n: number): string {
  const s = ["th", "st", "nd", "rd"] as const;
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

function getRankText(rank: number | null, elevation: number): string {
  if (elevation >= SUMMIT) return "Summited!";
  if (rank === null) return "";
  return `${getOrdinal(rank)} place`;
}

function getShareText(playerName: string, elevation: number, rank: number | null): string {
  const summited = elevation >= SUMMIT;
  if (summited) {
    return `I summited at ${elevation}m in Blobby: Summit! Can you reach the top?`;
  }
  const rankStr = rank ? ` and placed ${getOrdinal(rank)}` : "";
  return `I reached ${elevation}m${rankStr} in Blobby: Summit! Can you beat me?`;
}

export function ShareResults({ playerName, elevation, rank, totalPlayers }: ShareResultsProps) {
  const [copied, setCopied] = useState(false);
  const blobConfig = generateBlob(playerName);
  const rankText = getRankText(rank, elevation);
  const shareText = getShareText(playerName, elevation, rank);
  const shareUrl = window.location.origin;

  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Blobby: Summit",
          text: shareText,
          url: shareUrl,
        });
      } catch (err) {
        // User cancelled share -- ignore
        if ((err as DOMException).name !== "AbortError") {
          console.error("Share failed:", err);
        }
      }
    } else {
      // Fallback: copy to clipboard
      await handleCopy();
    }
  }, [shareText, shareUrl]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = `${shareText} ${shareUrl}`;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [shareText, shareUrl]);

  return (
    <div className="share-results">
      <div className="share-card">
        <div className="share-card-branding">Blobby: Summit</div>
        <div className="share-card-blob">
          <Blob config={blobConfig} size={80} state="celebrating" />
        </div>
        <div className="share-card-name">{playerName}</div>
        <div className="share-card-elevation">{elevation}m</div>
        {rankText && (
          <div className={`share-card-rank ${elevation >= SUMMIT ? "summited" : ""}`}>
            {rankText}
          </div>
        )}
        {totalPlayers > 1 && rank && elevation < SUMMIT && (
          <div className="share-card-total">of {totalPlayers} players</div>
        )}
      </div>
      <div className="share-actions">
        <button onClick={handleShare} className="share-btn primary">
          Share
        </button>
        <button onClick={handleCopy} className="share-btn secondary">
          {copied ? "Copied!" : "Copy Link"}
        </button>
      </div>
    </div>
  );
}
