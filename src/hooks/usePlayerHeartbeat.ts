import { useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

// Heartbeat interval - send every 5 seconds
const HEARTBEAT_INTERVAL_MS = 5000;

/**
 * Get the Convex site URL for HTTP endpoints.
 * Converts the Convex cloud URL to the site URL format.
 * e.g., "https://xyz.convex.cloud" -> "https://xyz.convex.site"
 */
function getConvexSiteUrl(): string {
  const convexUrl = import.meta.env.VITE_CONVEX_URL;
  if (!convexUrl) {
    console.warn("VITE_CONVEX_URL not set, player disconnect may not work");
    return "";
  }
  // Convert .convex.cloud to .convex.site for HTTP endpoints
  return convexUrl.replace(".convex.cloud", ".convex.site");
}

/**
 * Hook that sends periodic heartbeats to track player presence.
 * When the player's tab is open, heartbeats are sent every 5 seconds.
 * When the tab is closed (or component unmounts), heartbeats stop.
 *
 * Also sets up unload listeners for immediate disconnect detection
 * when the player closes their tab or navigates away.
 *
 * The backend considers a player "active" if their lastSeenAt is within 15 seconds.
 */
export function usePlayerHeartbeat(playerId: Id<"players"> | null) {
  const heartbeat = useMutation(api.players.heartbeat);

  // Periodic heartbeat effect
  useEffect(() => {
    if (!playerId) return;

    // Send heartbeat immediately on mount
    heartbeat({ playerId });

    // Then send every 5 seconds
    const interval = setInterval(() => {
      heartbeat({ playerId });
    }, HEARTBEAT_INTERVAL_MS);

    // Clean up interval when component unmounts or playerId changes
    return () => clearInterval(interval);
  }, [playerId, heartbeat]);

  // Unload listener effect for immediate disconnect detection
  useEffect(() => {
    if (!playerId) return;

    const handleUnload = () => {
      const siteUrl = getConvexSiteUrl();
      if (!siteUrl) return;

      // Use sendBeacon for reliable delivery on page close
      // This is fire-and-forget but designed to survive page unload
      navigator.sendBeacon(
        `${siteUrl}/api/player-disconnect`,
        JSON.stringify({ playerId })
      );
    };

    // Listen for both events for maximum browser compatibility
    // - beforeunload: fires before the page is unloaded
    // - pagehide: fires when the page is hidden (better for mobile Safari)
    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pagehide", handleUnload);

    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("pagehide", handleUnload);
    };
  }, [playerId]);
}
